-- 0085 — Confirmar un pago que ya se recibió, sin extender la vigencia.
--
-- Las suscripciones cargadas sin saber si el último ciclo se pagó quedan SIN pago registrado
-- ("Pago sin confirmar" en la pantalla). Cuando se confirma que ya habían pagado, este RPC registra
-- ese pago contra el ciclo actual: no cambia fecha_inicio ni fecha_fin (renovar sí las mueve), y no
-- se amarra al turno de caja de quien lo registra porque la plata entró antes, no en su turno.
-- Solo se puede una vez por ciclo: si ya hay un pago que cubre hasta fecha_fin, se rechaza.

create function public.confirmar_pago_ciclo_suscripcion(
  p_suscripcion_id uuid,
  p_metodo_pago text,
  p_fecha_pago date
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

  insert into public.pagos_suscripcion_parqueadero
    (suscripcion_id, monto, fecha_pago, periodo_inicio, periodo_fin, registrado_por, metodo_pago, turno_id)
  values (p_suscripcion_id, v_sus.valor, v_fecha, v_sus.fecha_inicio, v_sus.fecha_fin, v_por, p_metodo_pago, null)
  returning * into v_pago;

  return next v_pago;
end;
$$;

revoke execute on function public.confirmar_pago_ciclo_suscripcion(uuid, text, date) from public, anon;
grant execute on function public.confirmar_pago_ciclo_suscripcion(uuid, text, date) to authenticated;
