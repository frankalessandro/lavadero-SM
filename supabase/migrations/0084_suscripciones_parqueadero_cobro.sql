-- 0084 — Suscripciones de parqueadero: precio por tarifa, método de pago y cobro por jefe de patio
-- o vigilante (a cualquiera de los dos le pueden pagar).
--
-- Antes: el valor se digitaba a mano y solo gerencia escribía. Ahora:
--   · La suscripción tiene CLASE de vehículo (carro / moto / motocarro) y CONDICIÓN (mensualidad o
--     fijo 24h). El valor sale SIEMPRE de `tarifas_parqueadero` (clase × modalidad): nadie lo
--     digita, ni al crear ni al renovar. Si esa combinación no tiene tarifa, no se puede cobrar.
--   · Cada pago guarda el MÉTODO (efectivo / transferencia / datáfono) y el TURNO de caja de quien
--     lo recibió (null si lo registró gerencia, que no abre turno).
--   · Todo va por RPC (crear, renovar, actualizar datos, activar/inactivar) para admin, jefe de patio
--     y vigilante; el INSERT/UPDATE directo se cierra (histórico inmutable, lista blanca de columnas).
--
-- OJO: estos pagos todavía NO suman al arqueo del turno; `turno_id` y `metodo_pago` quedan listos
-- para eso, pero cambiar el arqueo es una decisión de negocio aparte.

-- ── Clase de vehículo ────────────────────────────────────────────────────────────────────────
alter table public.suscripciones_parqueadero
  add column if not exists clase_vehiculo text check (clase_vehiculo in ('carro', 'moto', 'motocarro'));

update public.suscripciones_parqueadero set clase_vehiculo = case
  when nota ilike 'motocarro%' then 'motocarro'
  when nota ilike 'moto%' then 'moto'
  else 'carro'
end
where clase_vehiculo is null;

alter table public.suscripciones_parqueadero alter column clase_vehiculo set not null;

-- ── Método y turno en cada pago ──────────────────────────────────────────────────────────────
alter table public.pagos_suscripcion_parqueadero
  add column if not exists metodo_pago text check (metodo_pago in ('efectivo', 'transferencia', 'datafono')),
  add column if not exists turno_id uuid references public.turnos_caja(id);

-- El primer pago ya no se crea por trigger: lo registra `crear_suscripcion_parqueadero` con su
-- método y turno.
drop trigger if exists suscripciones_pago_inicial on public.suscripciones_parqueadero;
drop function if exists interno.pago_inicial_suscripcion();

-- ── RLS: leer lo ven los tres roles operativos; escribir solo por RPC ─────────────────────────
drop policy if exists suscripciones_admin_insert on public.suscripciones_parqueadero;
drop policy if exists suscripciones_admin_update on public.suscripciones_parqueadero;
revoke insert, update on public.suscripciones_parqueadero from authenticated;

create policy suscripciones_jefe_zona_select on public.suscripciones_parqueadero
  for select to authenticated using (interno.rol_actual() = 'jefe_zona' and interno.es_activo());

drop policy if exists pagos_suscripcion_admin_select on public.pagos_suscripcion_parqueadero;
create policy pagos_suscripcion_select on public.pagos_suscripcion_parqueadero
  for select to authenticated
  using (interno.rol_actual() in ('admin', 'jefe_zona', 'vigilante') and interno.es_activo());

-- El jefe de patio necesita VER la tarifa para mostrar el valor al cobrar (editarla sigue siendo
-- solo de gerencia).
create policy tarifas_parqueadero_select_jefe_zona on public.tarifas_parqueadero
  for select to authenticated using (interno.rol_actual() = 'jefe_zona' and interno.es_activo());

-- ── Crear ────────────────────────────────────────────────────────────────────────────────────
create function public.crear_suscripcion_parqueadero(
  p_placa text,
  p_titular text,
  p_telefono text,
  p_clase text,
  p_modalidad text,
  p_fecha_inicio date,
  p_metodo_pago text,
  p_nota text
) returns setof public.suscripciones_parqueadero
language plpgsql security definer set search_path = public
as $$
declare
  v_rol text := interno.rol_actual();
  v_actor jsonb := interno.actor();
  v_por text := coalesce(nullif(v_actor ->> 'persona_nombre', ''), nullif(v_actor ->> 'usuario_nombre', ''));
  v_placa text := regexp_replace(upper(trim(coalesce(p_placa, ''))), '[^A-Z0-9]', '', 'g');
  v_titular text := nullif(trim(p_titular), '');
  v_hoy date := (now() at time zone 'America/Bogota')::date;
  v_inicio date;
  v_fin date;
  v_precio integer;
  v_turno uuid;
  v_sus public.suscripciones_parqueadero;
begin
  if not interno.es_activo() or v_rol not in ('admin', 'jefe_zona', 'vigilante') then
    raise exception 'No autorizado';
  end if;
  if length(v_placa) < 5 then raise exception 'La placa es obligatoria'; end if;
  if v_titular is null or length(v_titular) < 2 then raise exception 'El nombre del titular es obligatorio'; end if;
  if p_clase not in ('carro', 'moto', 'motocarro') then raise exception 'Clase de vehículo inválida'; end if;
  if p_modalidad not in ('mensualidad', 'fijo') then raise exception 'Condición inválida'; end if;
  if p_metodo_pago not in ('efectivo', 'transferencia', 'datafono') then raise exception 'Método de pago inválido'; end if;
  if v_por is null then raise exception 'No se pudo identificar a quien registra'; end if;

  select precio into v_precio from public.tarifas_parqueadero
    where clase_vehiculo = p_clase and modalidad = p_modalidad;
  if v_precio is null then
    raise exception 'No hay tarifa definida para % de esa clase — se define en Catálogo y precios › Parqueadero', p_modalidad;
  end if;

  if exists (select 1 from public.suscripciones_parqueadero where placa = v_placa and activo) then
    raise exception 'La placa % ya tiene una suscripción activa — renuévala en vez de crear otra', v_placa;
  end if;

  if v_rol <> 'admin' then
    select id into v_turno from public.turnos_caja where not cerrado and rol = v_rol limit 1;
    if v_turno is null then
      raise exception 'No hay turno de caja abierto — ábrelo antes de registrar el pago';
    end if;
  end if;

  -- Solo gerencia puede registrar una suscripción que empezó otro día (carga de datos viejos).
  v_inicio := case when v_rol = 'admin' then coalesce(p_fecha_inicio, v_hoy) else v_hoy end;
  v_fin := (v_inicio + interval '1 month')::date;

  insert into public.suscripciones_parqueadero
    (placa, titular, telefono, modalidad, clase_vehiculo, valor, fecha_inicio, fecha_fin, nota, creado_por)
  values
    (v_placa, v_titular, nullif(trim(p_telefono), ''), p_modalidad, p_clase, v_precio, v_inicio, v_fin,
     nullif(trim(p_nota), ''), v_por)
  returning * into v_sus;

  insert into public.pagos_suscripcion_parqueadero
    (suscripcion_id, monto, fecha_pago, periodo_inicio, periodo_fin, registrado_por, metodo_pago, turno_id)
  values (v_sus.id, v_precio, v_inicio, v_inicio, v_fin, v_por, p_metodo_pago, v_turno);

  return next v_sus;
end;
$$;

revoke execute on function public.crear_suscripcion_parqueadero(text, text, text, text, text, date, text, text) from public, anon;
grant execute on function public.crear_suscripcion_parqueadero(text, text, text, text, text, date, text, text) to authenticated;

-- ── Renovar (reemplaza la de 0081, que recibía el monto) ─────────────────────────────────────
drop function if exists public.renovar_suscripcion_parqueadero(uuid, integer, date);

create function public.renovar_suscripcion_parqueadero(
  p_suscripcion_id uuid,
  p_metodo_pago text,
  p_fecha_pago date
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

  select precio into v_precio from public.tarifas_parqueadero
    where clase_vehiculo = v_sus.clase_vehiculo and modalidad = v_sus.modalidad;
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
    fecha_inicio = v_inicio, fecha_fin = v_fin, valor = v_precio, activo = true
  where id = p_suscripcion_id;

  insert into public.pagos_suscripcion_parqueadero
    (suscripcion_id, monto, fecha_pago, periodo_inicio, periodo_fin, registrado_por, metodo_pago, turno_id)
  values (p_suscripcion_id, v_precio, v_fecha_pago, v_inicio, v_fin, v_por, p_metodo_pago, v_turno)
  returning * into v_pago;

  return next v_pago;
end;
$$;

revoke execute on function public.renovar_suscripcion_parqueadero(uuid, text, date) from public, anon;
grant execute on function public.renovar_suscripcion_parqueadero(uuid, text, date) to authenticated;

-- ── Datos del titular (no toca vigencia ni valor) ────────────────────────────────────────────
create function public.actualizar_suscripcion_parqueadero(
  p_id uuid,
  p_placa text,
  p_titular text,
  p_telefono text,
  p_nota text
) returns setof public.suscripciones_parqueadero
language plpgsql security definer set search_path = public
as $$
declare
  v_placa text := regexp_replace(upper(trim(coalesce(p_placa, ''))), '[^A-Z0-9]', '', 'g');
  v_titular text := nullif(trim(p_titular), '');
  v_sus public.suscripciones_parqueadero;
begin
  if not interno.es_activo() or interno.rol_actual() not in ('admin', 'jefe_zona', 'vigilante') then
    raise exception 'No autorizado';
  end if;
  if length(v_placa) < 5 then raise exception 'La placa es obligatoria'; end if;
  if v_titular is null or length(v_titular) < 2 then raise exception 'El nombre del titular es obligatorio'; end if;
  if exists (
    select 1 from public.suscripciones_parqueadero where placa = v_placa and activo and id <> p_id
  ) then
    raise exception 'La placa % ya tiene otra suscripción activa', v_placa;
  end if;

  update public.suscripciones_parqueadero set
    placa = v_placa, titular = v_titular, telefono = nullif(trim(p_telefono), ''), nota = nullif(trim(p_nota), '')
  where id = p_id
  returning * into v_sus;
  if not found then raise exception 'La suscripción no existe'; end if;

  return next v_sus;
end;
$$;

revoke execute on function public.actualizar_suscripcion_parqueadero(uuid, text, text, text, text) from public, anon;
grant execute on function public.actualizar_suscripcion_parqueadero(uuid, text, text, text, text) to authenticated;

-- ── Activar / inactivar (nunca se borra) ─────────────────────────────────────────────────────
create function public.cambiar_estado_suscripcion_parqueadero(p_id uuid, p_activo boolean)
returns setof public.suscripciones_parqueadero
language plpgsql security definer set search_path = public
as $$
declare
  v_sus public.suscripciones_parqueadero;
begin
  if not interno.es_activo() or interno.rol_actual() not in ('admin', 'jefe_zona', 'vigilante') then
    raise exception 'No autorizado';
  end if;

  if p_activo and exists (
    select 1 from public.suscripciones_parqueadero s
    join public.suscripciones_parqueadero o on o.placa = s.placa and o.activo and o.id <> s.id
    where s.id = p_id
  ) then
    raise exception 'Esa placa ya tiene otra suscripción activa';
  end if;

  update public.suscripciones_parqueadero set activo = p_activo where id = p_id returning * into v_sus;
  if not found then raise exception 'La suscripción no existe'; end if;

  return next v_sus;
end;
$$;

revoke execute on function public.cambiar_estado_suscripcion_parqueadero(uuid, boolean) from public, anon;
grant execute on function public.cambiar_estado_suscripcion_parqueadero(uuid, boolean) to authenticated;

-- ── Bitácora (0044) ──────────────────────────────────────────────────────────────────────────
create trigger bitacora_suscripciones_parqueadero_insert after insert on public.suscripciones_parqueadero
  for each row execute function interno.bitacora_trigger('crear');
create trigger bitacora_suscripciones_parqueadero_update after update on public.suscripciones_parqueadero
  for each row execute function interno.bitacora_trigger('editar', 'activo', 'titular', 'telefono', 'placa');
