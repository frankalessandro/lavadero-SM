-- 0081 — Historial de pagos de las suscripciones de parqueadero (mensualidad / fijo 24h).
--
-- Una suscripción es un ciclo: empieza un día, vence un mes después y hay que volver a pagar (o
-- inactivarla si el cliente no vuelve). `suscripciones_parqueadero` guarda el PERIODO VIGENTE
-- (fecha_inicio → fecha_fin, valor); esta tabla guarda cada pago hecho, append-only: nada se edita
-- ni se borra (regla 13), así el historial no se pierde al renovar.
--
-- Renovar va por RPC (`renovar_suscripcion_parqueadero`): suma el mes y registra el pago en una
-- sola transacción. Si aún está vigente, el nuevo mes arranca donde termina el actual (no se
-- pierden días por pagar antes); si ya venció, arranca el día del pago.
--
-- OJO: estos pagos NO entran a ningún arqueo de caja ni a rentabilidad (se cobran por fuera del
-- turno, igual que "otros ingresos" de 0078). Es un registro de control y de cobranza.

create table public.pagos_suscripcion_parqueadero (
  id uuid primary key default gen_random_uuid(),
  suscripcion_id uuid not null references public.suscripciones_parqueadero(id),
  monto integer not null check (monto >= 0),
  fecha_pago date not null,
  periodo_inicio date not null,
  periodo_fin date not null,
  registrado_por text,
  creado_en timestamptz not null default now(),
  check (periodo_fin >= periodo_inicio)
);
create index pagos_suscripcion_parqueadero_sus_idx
  on public.pagos_suscripcion_parqueadero (suscripcion_id, periodo_inicio desc);

alter table public.pagos_suscripcion_parqueadero enable row level security;
create policy pagos_suscripcion_admin_select on public.pagos_suscripcion_parqueadero
  for select to authenticated using (interno.es_admin() and interno.es_activo());
grant select on public.pagos_suscripcion_parqueadero to authenticated;

-- ── Datos ya cargados ────────────────────────────────────────────────────────────────────────
-- Un pago por suscripción existente (el que abrió su periodo actual).
insert into public.pagos_suscripcion_parqueadero
  (suscripcion_id, monto, fecha_pago, periodo_inicio, periodo_fin, registrado_por)
select id, valor, fecha_inicio, fecha_inicio, fecha_fin, coalesce(creado_por, 'Carga inicial')
from public.suscripciones_parqueadero;

-- TQF61E se había cargado como dos suscripciones (agosto y septiembre): es UNA suscripción con dos
-- pagos. Se pasa el pago de agosto a la vigente y se retira la fila duplicada.
do $$
declare
  v_vieja uuid;
  v_vigente uuid;
begin
  select id into v_vieja from public.suscripciones_parqueadero
    where placa = 'TQF61E' and fecha_inicio = date '2026-08-30' and not activo limit 1;
  select id into v_vigente from public.suscripciones_parqueadero
    where placa = 'TQF61E' and fecha_inicio = date '2026-09-30' and activo limit 1;
  if v_vieja is not null and v_vigente is not null then
    update public.pagos_suscripcion_parqueadero set suscripcion_id = v_vigente where suscripcion_id = v_vieja;
    delete from public.suscripciones_parqueadero where id = v_vieja;
  end if;
end $$;

-- ── Suscripción nueva = primer pago ──────────────────────────────────────────────────────────
create function interno.pago_inicial_suscripcion() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.pagos_suscripcion_parqueadero
    (suscripcion_id, monto, fecha_pago, periodo_inicio, periodo_fin, registrado_por)
  values (new.id, new.valor, new.fecha_inicio, new.fecha_inicio, new.fecha_fin, new.creado_por);
  return new;
end;
$$;

create trigger suscripciones_pago_inicial after insert on public.suscripciones_parqueadero
  for each row execute function interno.pago_inicial_suscripcion();

-- ── Renovar ──────────────────────────────────────────────────────────────────────────────────
create function public.renovar_suscripcion_parqueadero(
  p_suscripcion_id uuid,
  p_monto integer,
  p_fecha_pago date
) returns setof public.pagos_suscripcion_parqueadero
language plpgsql security definer set search_path = public
as $$
declare
  v_sus public.suscripciones_parqueadero;
  v_pago public.pagos_suscripcion_parqueadero;
  v_actor jsonb := interno.actor();
  v_por text := coalesce(nullif(v_actor ->> 'persona_nombre', ''), nullif(v_actor ->> 'usuario_nombre', ''));
  v_fecha_pago date := coalesce(p_fecha_pago, (now() at time zone 'America/Bogota')::date);
  v_inicio date;
  v_fin date;
begin
  if not interno.es_activo() or interno.rol_actual() <> 'admin' then
    raise exception 'No autorizado';
  end if;
  if p_monto is null or p_monto < 0 then raise exception 'El monto no puede ser negativo'; end if;

  select * into v_sus from public.suscripciones_parqueadero where id = p_suscripcion_id for update;
  if not found then raise exception 'La suscripción no existe'; end if;

  v_inicio := case when v_sus.activo and v_sus.fecha_fin >= v_fecha_pago then v_sus.fecha_fin else v_fecha_pago end;
  v_fin := (v_inicio + interval '1 month')::date;

  update public.suscripciones_parqueadero set
    fecha_inicio = v_inicio, fecha_fin = v_fin, valor = p_monto, activo = true
  where id = p_suscripcion_id;

  insert into public.pagos_suscripcion_parqueadero
    (suscripcion_id, monto, fecha_pago, periodo_inicio, periodo_fin, registrado_por)
  values (p_suscripcion_id, p_monto, v_fecha_pago, v_inicio, v_fin, v_por)
  returning * into v_pago;

  return next v_pago;
end;
$$;

revoke execute on function public.renovar_suscripcion_parqueadero(uuid, integer, date) from public, anon;
grant execute on function public.renovar_suscripcion_parqueadero(uuid, integer, date) to authenticated;

-- ── Bitácora (0044) ──────────────────────────────────────────────────────────────────────────
create trigger bitacora_pagos_suscripcion_insert after insert on public.pagos_suscripcion_parqueadero
  for each row execute function interno.bitacora_trigger('crear');
