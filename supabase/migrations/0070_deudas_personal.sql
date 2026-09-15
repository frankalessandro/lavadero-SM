-- Deudas del personal: lavadores, jefes de patio y gerencia (decisiones de Alessandro, 2026-09-15).
-- Generaliza `deudas_lavador` (0065, sin filas en producción al migrar) a `deudas_personal`.
--
--   · Deudor: un lavador (`lavador_id`) o una persona con cuenta del sistema (`persona_id` →
--     perfiles: jefes de patio y gerencia). Exactamente uno.
--   · Genera deuda: 'prestamo' (efectivo de la caja del turno), 'consumo' (cuenta de nevera
--     cargada a la persona, a precio de venta) y 'faltante' (faltante de un conteo de inventario que
--     gerencia decide cobrar, a costo).
--   · Salda deuda: 'abono' (entre semana; en efectivo a la caja del turno —entra al arqueo— o por
--     fuera: transferencia, nómina) y 'liquidacion' (descuento parcial o total que se ELIGE al
--     generar la liquidación del lavador o del jefe de patio). Gerencia no tiene liquidación: abona.
--   · Faltantes de conteo: gerencia decide por cada uno — cobrarlo a una persona o descartarlo.
--   · Registran préstamos, consumos y abonos: jefe de patio y admin. Cobrar/descartar faltantes y
--     anular deudas: solo admin.
--   · Ledger con signo; la deuda pendiente es la suma de las filas 'activo'. Un trigger impide que
--     un abono o descuento la deje negativa (no hay saldo a favor).

-- ── 0) Tabla ────────────────────────────────────────────────────────────────────────────────────
alter table public.deudas_lavador rename to deudas_personal;
alter index public.deudas_lavador_lavador_idx rename to deudas_personal_lavador_idx;
alter index public.deudas_lavador_turno_idx rename to deudas_personal_turno_idx;
alter policy deudas_lavador_admin_all on public.deudas_personal rename to deudas_personal_admin_all;
alter policy deudas_lavador_jefe_zona_select on public.deudas_personal rename to deudas_personal_jefe_zona_select;

alter table public.deudas_personal alter column lavador_id drop not null;
alter table public.deudas_personal
  add column persona_id uuid references public.perfiles(id),
  add column conteo_linea_id uuid unique references public.conteos_inventario_lineas(id),
  add column liquidacion_jefe_zona_id uuid references public.liquidaciones_jefe_zona(id),
  add column metodo_abono text check (metodo_abono in ('efectivo', 'fuera'));

alter table public.deudas_personal add constraint deudas_personal_deudor_check
  check ((lavador_id is null) <> (persona_id is null));

alter table public.deudas_personal drop constraint deudas_lavador_tipo_check;
alter table public.deudas_personal add constraint deudas_personal_tipo_check
  check (tipo in ('prestamo', 'consumo', 'faltante', 'abono', 'liquidacion'));

alter table public.deudas_personal add constraint deudas_personal_signo_check
  check ((tipo in ('prestamo', 'consumo', 'faltante') and monto > 0) or (tipo in ('abono', 'liquidacion') and monto < 0));

alter table public.deudas_personal add constraint deudas_personal_abono_check
  check ((tipo = 'abono') = (metodo_abono is not null) and (metodo_abono is distinct from 'efectivo' or turno_id is not null));

create index deudas_personal_persona_idx on public.deudas_personal (persona_id, estado);

-- Liquidación del jefe de patio con el mismo desglose que la de lavadores (0065).
alter table public.liquidaciones_jefe_zona
  add column comision_bruta integer,
  add column deuda_descontada integer not null default 0;
update public.liquidaciones_jefe_zona set comision_bruta = monto where comision_bruta is null;
alter table public.liquidaciones_jefe_zona alter column comision_bruta set not null;
alter table public.liquidaciones_jefe_zona add constraint liquidaciones_jefe_zona_monto_neto_check
  check (monto = comision_bruta - deuda_descontada and deuda_descontada >= 0);

-- ── 1) Saldo y guarda contra saldo negativo ─────────────────────────────────────────────────────
create function interno.deuda_pendiente(p_lavador_id uuid, p_persona_id uuid)
returns integer
language sql stable security definer set search_path to 'public'
as $$
  select coalesce(sum(monto), 0)::integer from deudas_personal
  where estado = 'activo'
    and ((p_lavador_id is not null and lavador_id = p_lavador_id)
      or (p_persona_id is not null and persona_id = p_persona_id));
$$;

revoke execute on function interno.deuda_pendiente(uuid, uuid) from public, anon, authenticated;

create function interno.deuda_no_negativa()
returns trigger
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_saldo integer;
begin
  if new.estado = 'activo' and new.monto < 0 then
    -- Serializa abonos/descuentos concurrentes del mismo deudor.
    perform pg_advisory_xact_lock(hashtext('deuda:' || coalesce(new.lavador_id, new.persona_id)::text));
    v_saldo := interno.deuda_pendiente(new.lavador_id, new.persona_id);
    if v_saldo + new.monto < 0 then
      raise exception 'El abono o descuento (%) supera la deuda pendiente (%)', -new.monto, v_saldo;
    end if;
  end if;
  return new;
end;
$$;

create trigger deudas_personal_no_negativa
  before insert on public.deudas_personal
  for each row execute function interno.deuda_no_negativa();

-- Valida el deudor y devuelve su nombre (para motivos legibles).
create function interno.deudor_nombre(p_lavador_id uuid, p_persona_id uuid)
returns text
language plpgsql stable security definer set search_path to 'public'
as $$
declare
  v_nombre text;
begin
  if (p_lavador_id is null) = (p_persona_id is null) then
    raise exception 'Indica a quién se le carga: un lavador o una persona del sistema';
  end if;
  if p_lavador_id is not null then
    select nombre into v_nombre from lavadores where id = p_lavador_id;
    if not found then raise exception 'El lavador no existe'; end if;
  else
    select coalesce(nullif(trim(nombre), ''), 'Sin nombre') into v_nombre from perfiles where id = p_persona_id;
    if not found then raise exception 'La persona no existe'; end if;
  end if;
  return v_nombre;
end;
$$;

revoke execute on function interno.deudor_nombre(uuid, uuid) from public, anon, authenticated;

-- ── 2) Préstamo ─────────────────────────────────────────────────────────────────────────────────
drop function if exists public.registrar_prestamo_lavador(uuid, integer, text, uuid, text);

create function public.registrar_prestamo_personal(
  p_lavador_id uuid, p_persona_id uuid, p_monto integer, p_motivo text
)
returns setof deudas_personal
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_turno turnos_caja;
  v_deuda deudas_personal;
begin
  if not interno.es_activo() or interno.rol_actual() not in ('jefe_zona', 'admin') then
    raise exception 'No autorizado para registrar préstamos';
  end if;
  if p_monto is null or p_monto <= 0 then
    raise exception 'El monto del préstamo debe ser mayor a cero';
  end if;
  perform interno.deudor_nombre(p_lavador_id, p_persona_id);

  select * into v_turno from turnos_caja where rol = 'jefe_zona' and not cerrado for update;
  if v_turno.id is null then
    raise exception 'El préstamo sale de la caja: abre el turno de caja primero';
  end if;

  insert into deudas_personal (lavador_id, persona_id, tipo, monto, turno_id, motivo, registrado_por)
  values (p_lavador_id, p_persona_id, 'prestamo', p_monto, v_turno.id, nullif(trim(p_motivo), ''), v_turno.responsable_actual)
  returning * into v_deuda;

  return next v_deuda;
end;
$$;

revoke execute on function public.registrar_prestamo_personal(uuid, uuid, integer, text) from public, anon;
grant execute on function public.registrar_prestamo_personal(uuid, uuid, integer, text) to authenticated;

-- ── 3) Consumo de nevera (cuenta cargada a la persona, a precio de venta) ───────────────────────
drop function if exists public.cargar_cuenta_a_lavador(uuid, uuid, text);

create function public.cargar_cuenta_a_personal(
  p_cuenta_id uuid, p_lavador_id uuid, p_persona_id uuid, p_cerrada_por text
)
returns setof cuentas
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_cuenta cuentas;
  v_total integer;
  v_responsable text := nullif(trim(p_cerrada_por), '');
  v_pendiente record;
  v_turno_actual uuid;
  v_deudor text;
begin
  if not interno.es_activo() or interno.rol_actual() not in ('jefe_zona', 'admin') then
    raise exception 'No autorizado para cerrar cuentas';
  end if;
  if v_responsable is null then
    raise exception 'Indica quién cierra la cuenta';
  end if;
  v_deudor := interno.deudor_nombre(p_lavador_id, p_persona_id);

  select * into v_cuenta from cuentas where id = p_cuenta_id for update;
  if not found then raise exception 'La cuenta no existe'; end if;
  if v_cuenta.estado <> 'abierta' then
    raise exception 'La cuenta ya está % — no se puede cerrar de nuevo', v_cuenta.estado;
  end if;

  select coalesce(sum(total), 0) into v_total from ventas where cuenta_id = p_cuenta_id and estado = 'pendiente';
  if v_total <= 0 then
    raise exception 'La cuenta no tiene productos pendientes — usa "Anular cuenta" si no se va a cobrar nada';
  end if;

  select id into v_turno_actual from turnos_caja where rol = 'jefe_zona' and not cerrado;

  update cuentas set estado = 'cerrada', cerrada_en = now(), cerrada_por = v_responsable, turno_id = v_turno_actual
  where id = p_cuenta_id returning * into v_cuenta;

  for v_pendiente in select * from ventas where cuenta_id = p_cuenta_id and estado = 'pendiente' for update
  loop
    update ventas set estado = 'activa', metodo_pago = 'cuenta_lavador', turno_id = v_turno_actual, cobrada_en = now()
    where id = v_pendiente.id;

    insert into movimientos_inventario (producto_id, tipo, cantidad, costo_unitario, motivo, responsable, venta_id)
    values (
      v_pendiente.producto_id, 'salida', -v_pendiente.cantidad, interno.costo_promedio_producto(v_pendiente.producto_id),
      'Venta #' || v_pendiente.consecutivo || ' (cargada a ' || v_deudor || ' — cuenta: ' || v_cuenta.titular || ')',
      v_responsable, v_pendiente.id
    );
  end loop;

  insert into deudas_personal (lavador_id, persona_id, tipo, monto, cuenta_id, motivo, registrado_por)
  values (p_lavador_id, p_persona_id, 'consumo', v_total, p_cuenta_id,
    'Consumo de nevera — cuenta "' || v_cuenta.titular || '"', v_responsable);

  return next v_cuenta;
end;
$$;

revoke execute on function public.cargar_cuenta_a_personal(uuid, uuid, uuid, text) from public, anon;
grant execute on function public.cargar_cuenta_a_personal(uuid, uuid, uuid, text) to authenticated;

-- ── 4) Abono ────────────────────────────────────────────────────────────────────────────────────
create function public.registrar_abono_deuda(
  p_lavador_id uuid, p_persona_id uuid, p_monto integer, p_metodo text, p_motivo text
)
returns setof deudas_personal
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_turno turnos_caja;
  v_motivo text := nullif(trim(p_motivo), '');
  v_registra text;
  v_deuda deudas_personal;
begin
  if not interno.es_activo() or interno.rol_actual() not in ('jefe_zona', 'admin') then
    raise exception 'No autorizado para registrar abonos';
  end if;
  if p_monto is null or p_monto <= 0 then
    raise exception 'El abono debe ser mayor a cero';
  end if;
  if p_metodo not in ('efectivo', 'fuera') then
    raise exception 'Método de abono inválido: %', p_metodo;
  end if;
  perform interno.deudor_nombre(p_lavador_id, p_persona_id);

  select * into v_turno from turnos_caja where rol = 'jefe_zona' and not cerrado for update;

  if p_metodo = 'efectivo' then
    if v_turno.id is null then
      raise exception 'Un abono en efectivo entra a la caja: abre el turno de caja primero';
    end if;
  elsif v_motivo is null or length(v_motivo) < 5 then
    raise exception 'Indica cómo se pagó (ej. transferencia Nequi, descuento de nómina)';
  end if;

  v_registra := case
    when interno.rol_actual() = 'jefe_zona' and v_turno.id is not null then v_turno.responsable_actual
    else coalesce(nullif(trim(interno.actor() ->> 'persona_nombre'), ''), 'Administrador')
  end;

  insert into deudas_personal (lavador_id, persona_id, tipo, monto, turno_id, metodo_abono, motivo, registrado_por)
  values (
    p_lavador_id, p_persona_id, 'abono', -p_monto,
    case when p_metodo = 'efectivo' then v_turno.id end,
    p_metodo, v_motivo, v_registra
  )
  returning * into v_deuda;

  return next v_deuda;
end;
$$;

revoke execute on function public.registrar_abono_deuda(uuid, uuid, integer, text, text) from public, anon;
grant execute on function public.registrar_abono_deuda(uuid, uuid, integer, text, text) to authenticated;

-- ── 5) Faltantes de conteo: cobrar o descartar (solo admin) ─────────────────────────────────────
create function public.cobrar_faltante(p_linea_id uuid, p_persona_id uuid default null)
returns setof deudas_personal
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_linea conteos_inventario_lineas;
  v_persona uuid;
  v_nombre text;
  v_producto text;
  v_deuda deudas_personal;
begin
  if not interno.es_activo() or not interno.es_admin() then
    raise exception 'Solo gerencia decide si un faltante se cobra';
  end if;

  select * into v_linea from conteos_inventario_lineas where id = p_linea_id for update;
  if not found then raise exception 'El faltante no existe'; end if;
  if v_linea.estado_faltante <> 'pendiente' then
    raise exception 'Ese faltante ya está %', v_linea.estado_faltante;
  end if;
  if v_linea.valor_diferencia <= 0 then
    raise exception 'El faltante no tiene valor a costo — no hay qué cobrar, descártalo';
  end if;

  v_persona := coalesce(p_persona_id, v_linea.responde_persona_id);
  if v_persona is null then
    raise exception 'Este faltante no tiene responsable (se perdió entre turnos): elige a quién cobrárselo';
  end if;
  v_nombre := interno.deudor_nombre(null, v_persona);
  select nombre into v_producto from productos where id = v_linea.producto_id;

  insert into deudas_personal (persona_id, tipo, monto, conteo_linea_id, motivo, registrado_por)
  values (
    v_persona, 'faltante', v_linea.valor_diferencia, v_linea.id,
    'Faltante de inventario: ' || abs(v_linea.diferencia) || ' × ' || v_producto || ' (a costo)',
    coalesce(nullif(trim(interno.actor() ->> 'persona_nombre'), ''), 'Administrador')
  )
  returning * into v_deuda;

  update conteos_inventario_lineas set
    estado_faltante = 'resuelto',
    responde_persona_id = v_persona,
    motivo = coalesce(motivo || ' | ', '') || 'Cobrado a ' || v_nombre
  where id = v_linea.id;

  return next v_deuda;
end;
$$;

revoke execute on function public.cobrar_faltante(uuid, uuid) from public, anon;
grant execute on function public.cobrar_faltante(uuid, uuid) to authenticated;

create function public.descartar_faltante(p_linea_id uuid, p_motivo text)
returns void
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_motivo text := nullif(trim(p_motivo), '');
begin
  if not interno.es_activo() or not interno.es_admin() then
    raise exception 'Solo gerencia decide si un faltante se descarta';
  end if;
  if v_motivo is null or length(v_motivo) < 5 then
    raise exception 'Explica por qué se descarta el faltante';
  end if;
  update conteos_inventario_lineas set
    estado_faltante = 'descartado',
    motivo = coalesce(motivo || ' | ', '') || 'Descartado: ' || v_motivo
  where id = p_linea_id and estado_faltante = 'pendiente';
  if not found then
    raise exception 'El faltante no existe o ya fue resuelto';
  end if;
end;
$$;

revoke execute on function public.descartar_faltante(uuid, text) from public, anon;
grant execute on function public.descartar_faltante(uuid, text) to authenticated;

-- ── 6) Anular una deuda (solo admin) ────────────────────────────────────────────────────────────
-- Préstamo, abono o faltante. Un consumo no (implicaría revertir la venta y el stock); un
-- descuento de liquidación se revierte anulando la liquidación.
create function public.anular_deuda(p_id uuid, p_motivo text)
returns setof deudas_personal
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_deuda deudas_personal;
  v_motivo text := nullif(trim(p_motivo), '');
  v_por text := coalesce(nullif(trim(interno.actor() ->> 'persona_nombre'), ''), 'Administrador');
begin
  if not interno.es_activo() or not interno.es_admin() then
    raise exception 'Solo un administrador puede anular una deuda';
  end if;
  if v_motivo is null or length(v_motivo) < 5 then
    raise exception 'El motivo de anulación es obligatorio';
  end if;

  select * into v_deuda from deudas_personal where id = p_id for update;
  if not found then raise exception 'El registro no existe'; end if;
  if v_deuda.estado <> 'activo' then raise exception 'Ya está anulado'; end if;
  if v_deuda.tipo not in ('prestamo', 'abono', 'faltante') then
    raise exception 'Un % no se anula acá (consumo: anula la venta; descuento: anula la liquidación)', v_deuda.tipo;
  end if;
  if v_deuda.tipo in ('prestamo', 'faltante')
     and interno.deuda_pendiente(v_deuda.lavador_id, v_deuda.persona_id) - v_deuda.monto < 0 then
    raise exception 'No se puede anular: ya se abonó o descontó más de lo que quedaría debiendo. Anula primero ese abono o liquidación';
  end if;

  update deudas_personal set estado = 'anulado', motivo_anulacion = v_motivo, anulada_por = v_por, anulada_en = now()
  where id = p_id returning * into v_deuda;

  -- El faltante vuelve a quedar por decidir.
  if v_deuda.tipo = 'faltante' and v_deuda.conteo_linea_id is not null then
    update conteos_inventario_lineas set estado_faltante = 'pendiente',
      motivo = coalesce(motivo || ' | ', '') || 'Cobro anulado: ' || v_motivo
    where id = v_deuda.conteo_linea_id;
  end if;

  return next v_deuda;
end;
$$;

revoke execute on function public.anular_deuda(uuid, text) from public, anon;
grant execute on function public.anular_deuda(uuid, text) to authenticated;

-- ── 7) Anular liquidaciones: la deuda descontada vuelve a quedar pendiente ──────────────────────
create or replace function public.anular_liquidacion(p_id uuid, p_motivo text, p_anulada_por text)
returns setof liquidaciones
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_liq liquidaciones;
  v_motivo text := nullif(trim(p_motivo), '');
  v_por text := nullif(trim(p_anulada_por), '');
begin
  if not interno.es_admin() or not interno.es_activo() then
    raise exception 'Solo un administrador puede anular una liquidación';
  end if;
  if v_motivo is null or length(v_motivo) < 3 then
    raise exception 'El motivo de anulación es obligatorio (mínimo 3 caracteres)';
  end if;
  if v_por is null then
    raise exception 'Indica quién anula la liquidación';
  end if;

  select * into v_liq from liquidaciones where id = p_id for update;
  if not found then raise exception 'La liquidación no existe'; end if;
  if v_liq.pagada then raise exception 'Una liquidación pagada no se puede anular'; end if;
  if v_liq.anulada then raise exception 'La liquidación ya está anulada'; end if;

  update ordenes set liquidacion_id = null where liquidacion_id = p_id;
  update ordenes set liquidacion_id_2 = null where liquidacion_id_2 = p_id;

  update deudas_personal set estado = 'anulado', motivo_anulacion = v_motivo, anulada_por = v_por, anulada_en = now()
  where liquidacion_id = p_id and tipo = 'liquidacion' and estado = 'activo';

  update liquidaciones set anulada = true, motivo_anulacion = v_motivo, anulada_por = v_por, anulada_en = now()
  where id = p_id returning * into v_liq;

  return next v_liq;
end;
$$;

create or replace function public.anular_liquidacion_jefe_zona(p_id uuid, p_motivo text, p_anulada_por text)
returns setof liquidaciones_jefe_zona
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_liq liquidaciones_jefe_zona;
  v_motivo text := nullif(trim(p_motivo), '');
  v_por text := nullif(trim(p_anulada_por), '');
begin
  if not interno.es_admin() or not interno.es_activo() then
    raise exception 'Solo un administrador puede anular una liquidación';
  end if;
  if v_motivo is null or length(v_motivo) < 3 then
    raise exception 'El motivo de anulación es obligatorio (mínimo 3 caracteres)';
  end if;
  if v_por is null then
    raise exception 'Indica quién anula la liquidación';
  end if;

  select * into v_liq from liquidaciones_jefe_zona where id = p_id for update;
  if not found then raise exception 'La liquidación no existe'; end if;
  if v_liq.pagada then raise exception 'Una liquidación pagada no se puede anular'; end if;
  if v_liq.anulada then raise exception 'La liquidación ya está anulada'; end if;

  update ordenes set liquidacion_jefe_zona_id = null where liquidacion_jefe_zona_id = p_id;

  update deudas_personal set estado = 'anulado', motivo_anulacion = v_motivo, anulada_por = v_por, anulada_en = now()
  where liquidacion_jefe_zona_id = p_id and tipo = 'liquidacion' and estado = 'activo';

  update liquidaciones_jefe_zona set anulada = true, motivo_anulacion = v_motivo, anulada_por = v_por, anulada_en = now()
  where id = p_id returning * into v_liq;

  return next v_liq;
end;
$$;

notify pgrst, 'reload schema';
