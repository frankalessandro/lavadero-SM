-- Cambiar el plan (tipo de vehículo y/o condición) de una suscripción al registrar un pago.
--
-- Caso real: CLR826 estaba como mensualidad ($120.000) y este mes pagó fijo 24h ($140.000). Antes
-- el tipo de vehículo y la condición solo se fijaban al crear la suscripción y había que inactivarla
-- y crear otra para cambiarlos, perdiendo el historial de pagos en una fila distinta. Ahora ambos
-- pagos — renovar (`renovar_suscripcion_parqueadero`) y registrar el del ciclo actual que ya se
-- había recibido (`confirmar_pago_ciclo_suscripcion`) — reciben opcionalmente la clase y la
-- condición que paga ese mes. Si cambian, la suscripción queda con el plan nuevo y el valor sale
-- SIEMPRE de `tarifas_parqueadero` (nadie lo digita, igual que 0084). NULL = conserva el plan.
-- El cambio queda en bitácora: el trigger de update ahora también mira modalidad, clase y valor.

drop function if exists public.renovar_suscripcion_parqueadero(uuid, text, date);

create function public.renovar_suscripcion_parqueadero(
  p_suscripcion_id uuid,
  p_metodo_pago text,
  p_fecha_pago date,
  p_clase text default null,
  p_modalidad text default null
) returns setof public.pagos_suscripcion_parqueadero
language plpgsql security definer set search_path = public
as $$
declare
  v_rol text := interno.rol_actual();
  v_actor jsonb := interno.actor();
  v_por text := coalesce(nullif(v_actor ->> 'persona_nombre', ''), nullif(v_actor ->> 'usuario_nombre', ''));
  v_hoy date := (now() at time zone 'America/Bogota')::date;
  v_sus public.suscripciones_parqueadero;
  v_pago public.pagos_suscripcion_parqueadero;
  v_clase text;
  v_modalidad text;
  v_fecha_pago date;
  v_inicio date;
  v_fin date;
  v_precio integer;
  v_turno uuid;
begin
  if not interno.es_activo() or v_rol not in ('admin', 'jefe_zona', 'vigilante') then
    raise exception 'No autorizado';
  end if;
  if p_metodo_pago not in ('efectivo', 'transferencia', 'datafono') then raise exception 'Método de pago inválido'; end if;
  if v_por is null then raise exception 'No se pudo identificar a quien registra'; end if;

  select * into v_sus from public.suscripciones_parqueadero where id = p_suscripcion_id for update;
  if not found then raise exception 'La suscripción no existe'; end if;

  v_clase := coalesce(p_clase, v_sus.clase_vehiculo);
  v_modalidad := coalesce(p_modalidad, v_sus.modalidad);
  if v_clase not in ('carro', 'moto', 'motocarro') then raise exception 'Tipo de vehículo inválido'; end if;
  if v_modalidad not in ('mensualidad', 'fijo') then raise exception 'Condición inválida'; end if;

  select precio into v_precio from public.tarifas_parqueadero
    where clase_vehiculo = v_clase and modalidad = v_modalidad;
  if v_precio is null then
    raise exception 'No hay tarifa definida para esa clase y condición — se define en Catálogo y precios › Parqueadero';
  end if;

  if v_rol <> 'admin' then
    select id into v_turno from public.turnos_caja where not cerrado and rol = v_rol limit 1;
    if v_turno is null then
      raise exception 'No hay turno de caja abierto — ábrelo antes de registrar el pago';
    end if;
  end if;

  v_fecha_pago := case when v_rol = 'admin' then coalesce(p_fecha_pago, v_hoy) else v_hoy end;
  v_inicio := case when v_sus.activo and v_sus.fecha_fin >= v_fecha_pago then v_sus.fecha_fin else v_fecha_pago end;
  v_fin := (v_inicio + interval '1 month')::date;

  update public.suscripciones_parqueadero set
    fecha_inicio = v_inicio, fecha_fin = v_fin, valor = v_precio, activo = true,
    clase_vehiculo = v_clase, modalidad = v_modalidad
  where id = p_suscripcion_id;

  insert into public.pagos_suscripcion_parqueadero
    (suscripcion_id, monto, fecha_pago, periodo_inicio, periodo_fin, registrado_por, metodo_pago, turno_id)
  values (p_suscripcion_id, v_precio, v_fecha_pago, v_inicio, v_fin, v_por, p_metodo_pago, v_turno)
  returning * into v_pago;

  return next v_pago;
end;
$$;
revoke execute on function public.renovar_suscripcion_parqueadero(uuid, text, date, text, text) from public, anon;
grant execute on function public.renovar_suscripcion_parqueadero(uuid, text, date, text, text) to authenticated;

drop function if exists public.confirmar_pago_ciclo_suscripcion(uuid, text, date);

create function public.confirmar_pago_ciclo_suscripcion(
  p_suscripcion_id uuid,
  p_metodo_pago text,
  p_fecha_pago date,
  p_clase text default null,
  p_modalidad text default null
) returns setof public.pagos_suscripcion_parqueadero
language plpgsql security definer set search_path = public
as $$
declare
  v_actor jsonb := interno.actor();
  v_por text := coalesce(nullif(v_actor ->> 'persona_nombre', ''), nullif(v_actor ->> 'usuario_nombre', ''));
  v_hoy date := (now() at time zone 'America/Bogota')::date;
  v_sus public.suscripciones_parqueadero;
  v_pago public.pagos_suscripcion_parqueadero;
  v_fecha date := coalesce(p_fecha_pago, v_hoy);
  v_clase text;
  v_modalidad text;
  v_monto integer;
begin
  if not interno.es_activo() or interno.rol_actual() not in ('admin', 'jefe_zona', 'vigilante') then
    raise exception 'No autorizado';
  end if;
  if p_metodo_pago not in ('efectivo', 'transferencia', 'datafono') then raise exception 'Método de pago inválido'; end if;
  if v_por is null then raise exception 'No se pudo identificar a quien registra'; end if;
  if v_fecha > v_hoy then raise exception 'La fecha del pago no puede ser futura'; end if;

  select * into v_sus from public.suscripciones_parqueadero where id = p_suscripcion_id for update;
  if not found then raise exception 'La suscripción no existe'; end if;

  if exists (
    select 1 from public.pagos_suscripcion_parqueadero
    where suscripcion_id = p_suscripcion_id and periodo_fin >= v_sus.fecha_fin
  ) then
    raise exception 'Este ciclo ya tiene un pago registrado';
  end if;

  v_clase := coalesce(p_clase, v_sus.clase_vehiculo);
  v_modalidad := coalesce(p_modalidad, v_sus.modalidad);
  if v_clase not in ('carro', 'moto', 'motocarro') then raise exception 'Tipo de vehículo inválido'; end if;
  if v_modalidad not in ('mensualidad', 'fijo') then raise exception 'Condición inválida'; end if;

  -- Sin cambio de plan se respeta el valor con que quedó la suscripción (como antes); con cambio,
  -- el del plan nuevo sale de la tarifa.
  if v_clase = v_sus.clase_vehiculo and v_modalidad = v_sus.modalidad then
    v_monto := v_sus.valor;
  else
    select precio into v_monto from public.tarifas_parqueadero
      where clase_vehiculo = v_clase and modalidad = v_modalidad;
    if v_monto is null then
      raise exception 'No hay tarifa definida para esa clase y condición — se define en Catálogo y precios › Parqueadero';
    end if;
    update public.suscripciones_parqueadero set
      clase_vehiculo = v_clase, modalidad = v_modalidad, valor = v_monto
    where id = p_suscripcion_id;
  end if;

  insert into public.pagos_suscripcion_parqueadero
    (suscripcion_id, monto, fecha_pago, periodo_inicio, periodo_fin, registrado_por, metodo_pago, turno_id)
  values (p_suscripcion_id, v_monto, v_fecha, v_sus.fecha_inicio, v_sus.fecha_fin, v_por, p_metodo_pago, null)
  returning * into v_pago;

  return next v_pago;
end;
$$;
revoke execute on function public.confirmar_pago_ciclo_suscripcion(uuid, text, date, text, text) from public, anon;
grant execute on function public.confirmar_pago_ciclo_suscripcion(uuid, text, date, text, text) to authenticated;

drop trigger if exists bitacora_suscripciones_parqueadero_update on public.suscripciones_parqueadero;
create trigger bitacora_suscripciones_parqueadero_update after update on public.suscripciones_parqueadero
  for each row execute function interno.bitacora_trigger(
    'editar', 'activo', 'titular', 'telefono', 'placa', 'modalidad', 'clase_vehiculo', 'valor'
  );
