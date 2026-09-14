-- Deuda de lavadores: préstamos en efectivo + consumo de nevera cargado a su liquidación.
--
-- Cambio de regla de negocio 4 (confirmado por Alessandro, 2026-09-14). La regla decía
-- explícito "sobre el acumulado, sin descuentos al lavador" — a partir de ahora SÍ hay
-- descuentos: un préstamo en efectivo o productos de nevera que un lavador toma se le resta de
-- su próxima liquidación (diaria o semanal, la que sea). CLAUDE.md se actualiza junto con esta
-- migración para que la regla 4 documentada sea la vigente, no una excepción oculta en el código.
--
-- Dos formas de generar deuda:
--  1. PRÉSTAMO: el jefe de patio (o admin) le da efectivo de la caja del turno — sale de la caja
--     EN ESE MOMENTO (se resta del efectivo esperado del arqueo, mismo mecanismo que
--     gastos.origen='caja' y compras.origen_pago='caja', 0042/0064) y además queda como deuda.
--  2. CONSUMO: un lavador coge algo de la nevera. Se abre una "cuenta" a su nombre igual que
--     cualquier otra (0041) y en vez de cobrarla en efectivo/transferencia/datáfono al cerrarla,
--     se carga a un lavador específico — stock y costo se descuentan igual que siempre, pero no
--     entra plata hoy: el total queda como deuda para descontar en su liquidación.
--
-- La deuda es un ledger con signo (`deudas_lavador.monto`): préstamo/consumo positivos (suman a
-- lo que debe), la fila que genera `generar_liquidacion` es negativa (lo que se le descontó). La
-- suma de las filas 'activo' de un lavador es su deuda pendiente actual.
--
-- Si la deuda pendiente es MAYOR que la comisión de ese corte (decisión de Alessandro): la
-- liquidación queda en $0, se aplica solo hasta donde alcance, y el resto de la deuda sigue
-- pendiente para la próxima — nunca se genera un pago negativo.

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- Esquema
-- ─────────────────────────────────────────────────────────────────────────────────────────────

create table public.deudas_lavador (
  id uuid primary key default gen_random_uuid(),
  lavador_id uuid not null references public.lavadores(id),
  tipo text not null check (tipo in ('prestamo', 'consumo', 'liquidacion')),
  -- Con signo: prestamo/consumo positivos (aumentan lo que debe); la fila 'liquidacion' que
  -- inserta generar_liquidacion es negativa (lo que se le descontó al pagarle). La suma de las
  -- filas 'activo' de un lavador ES su deuda pendiente — no hay columna de saldo aparte que
  -- pueda desincronizarse.
  monto integer not null check (monto <> 0),
  turno_id uuid references public.turnos_caja(id),          -- solo 'prestamo': de qué caja salió
  cuenta_id uuid references public.cuentas(id),               -- solo 'consumo': qué cuenta se cargó
  liquidacion_id uuid references public.liquidaciones(id),    -- solo 'liquidacion': qué corte la aplicó
  motivo text,
  registrado_por text not null,
  estado text not null default 'activo' check (estado in ('activo', 'anulado')),
  motivo_anulacion text,
  anulada_por text,
  anulada_en timestamptz,
  creado_en timestamptz not null default now()
);
create index deudas_lavador_lavador_idx on public.deudas_lavador (lavador_id, estado);
create index deudas_lavador_turno_idx on public.deudas_lavador (turno_id) where turno_id is not null;

-- 'cuenta_lavador' — nuevo método de pago-etiqueta para una venta cuyo cobro no fue plata sino
-- descuento de liquidación (ver cargar_cuenta_a_lavador). Cuenta como ingreso de ventas normal
-- en rentabilidad (el producto sí salió, el costo sí se incurrió) pero NUNCA entra a `pagos` —
-- por eso no aparece en "Caja del día"/arqueo, que se calculan sobre esa tabla, no sobre
-- `ventas.metodo_pago`.
alter table public.ventas drop constraint ventas_metodo_pago_check;
alter table public.ventas add constraint ventas_metodo_pago_check
  check (metodo_pago in ('efectivo', 'transferencia', 'datafono', 'mixto', 'cuenta_lavador'));

-- Transparencia en el histórico: `monto` sigue siendo lo que efectivamente se paga (compat con
-- marcarLiquidacionPagada y todo lo que ya lee esa columna); las dos nuevas dejan ver el desglose.
alter table public.liquidaciones
  add column comision_bruta integer,
  add column deuda_descontada integer not null default 0;
update public.liquidaciones set comision_bruta = monto where comision_bruta is null;
alter table public.liquidaciones alter column comision_bruta set not null;
alter table public.liquidaciones add constraint liquidaciones_monto_neto_check
  check (monto = comision_bruta - deuda_descontada);

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- RLS
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- Admin: acceso completo directo (mismo patrón que `liquidaciones` — genera la liquidación real
-- con un insert/update plano, no por RPC). Jefe de zona: solo lectura — necesita ver la deuda de
-- cada lavador para informarle, pero registra préstamos/consumo por las RPC de abajo (security
-- definer), nunca escribiendo la tabla directo.

alter table public.deudas_lavador enable row level security;
create policy deudas_lavador_admin_all on public.deudas_lavador
  for all to authenticated
  using (interno.es_admin() and interno.es_activo())
  with check (interno.es_admin() and interno.es_activo());
create policy deudas_lavador_jefe_zona_select on public.deudas_lavador
  for select to authenticated using (interno.rol_actual() = 'jefe_zona' and interno.es_activo());
grant select, insert, update on public.deudas_lavador to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- registrar_prestamo_lavador
-- ─────────────────────────────────────────────────────────────────────────────────────────────

create function public.registrar_prestamo_lavador(
  p_lavador_id uuid,
  p_monto integer,
  p_motivo text,
  p_turno_id uuid,
  p_registrado_por text
)
returns setof public.deudas_lavador
language plpgsql security definer set search_path = public
as $$
declare
  v_turno public.turnos_caja;
  v_responsable text := nullif(trim(p_registrado_por), '');
  v_motivo text := nullif(trim(p_motivo), '');
  v_deuda public.deudas_lavador;
begin
  if not interno.es_activo() or interno.rol_actual() not in ('jefe_zona', 'admin') then
    raise exception 'No autorizado para registrar préstamos';
  end if;
  if p_monto is null or p_monto <= 0 then
    raise exception 'El monto del préstamo debe ser mayor a cero';
  end if;
  if v_responsable is null then
    raise exception 'Indica quién presta';
  end if;
  if p_turno_id is null then
    raise exception 'Indica el turno cuya caja presta el efectivo';
  end if;
  if not exists (select 1 from public.lavadores where id = p_lavador_id) then
    raise exception 'El lavador no existe';
  end if;

  select * into v_turno from public.turnos_caja where id = p_turno_id for update;
  if not found then
    raise exception 'El turno no existe';
  end if;
  if v_turno.rol <> 'jefe_zona' then
    raise exception 'Solo la caja de jefe de zona presta a lavadores';
  end if;
  if v_turno.cerrado then
    raise exception 'Ese turno ya está cerrado — no se le puede cargar un préstamo (regla 14)';
  end if;

  insert into public.deudas_lavador (lavador_id, tipo, monto, turno_id, motivo, registrado_por)
  values (p_lavador_id, 'prestamo', p_monto, p_turno_id, v_motivo, v_responsable)
  returning * into v_deuda;

  return next v_deuda;
end;
$$;

revoke execute on function public.registrar_prestamo_lavador(uuid, integer, text, uuid, text) from public, anon;
grant execute on function public.registrar_prestamo_lavador(uuid, integer, text, uuid, text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- cargar_cuenta_a_lavador — cierra una cuenta abierta descontando de la liquidación del lavador
-- en vez de cobrar plata. Calco de `cerrar_cuenta` (0060) en la parte de stock/costo; sin
-- PagoLineas (no hay pago real hoy) y sin exigir turno abierto (no toca ningún arqueo).
-- ─────────────────────────────────────────────────────────────────────────────────────────────

create function public.cargar_cuenta_a_lavador(
  p_cuenta_id uuid,
  p_lavador_id uuid,
  p_cerrada_por text
)
returns setof public.cuentas
language plpgsql security definer set search_path = public
as $$
declare
  v_cuenta public.cuentas;
  v_total integer;
  v_responsable text := nullif(trim(p_cerrada_por), '');
  v_pendiente record;
  v_turno_actual uuid;
begin
  if not interno.es_activo() or interno.rol_actual() not in ('jefe_zona', 'admin') then
    raise exception 'No autorizado para cerrar cuentas';
  end if;
  if v_responsable is null then
    raise exception 'Indica quién cierra la cuenta';
  end if;
  if not exists (select 1 from public.lavadores where id = p_lavador_id) then
    raise exception 'El lavador no existe';
  end if;

  select * into v_cuenta from public.cuentas where id = p_cuenta_id for update;
  if not found then
    raise exception 'La cuenta no existe';
  end if;
  if v_cuenta.estado <> 'abierta' then
    raise exception 'La cuenta ya está % — no se puede cerrar de nuevo', v_cuenta.estado;
  end if;

  select coalesce(sum(total), 0) into v_total
  from public.ventas where cuenta_id = p_cuenta_id and estado = 'pendiente';
  if v_total <= 0 then
    raise exception 'La cuenta no tiene productos pendientes — usa "Anular cuenta" si no se va a cobrar nada';
  end if;

  -- Turno actual de jefe_zona, solo para trazabilidad en el expediente del turno — no mueve
  -- ningún arqueo (no se inserta fila en `pagos`, que es de donde sale todo cálculo de caja).
  select id into v_turno_actual from public.turnos_caja where rol = 'jefe_zona' and not cerrado;

  update public.cuentas set
    estado = 'cerrada',
    cerrada_en = now(),
    cerrada_por = v_responsable,
    turno_id = v_turno_actual
  where id = p_cuenta_id
  returning * into v_cuenta;

  for v_pendiente in
    select * from public.ventas where cuenta_id = p_cuenta_id and estado = 'pendiente' for update
  loop
    update public.ventas set
      estado = 'activa',
      metodo_pago = 'cuenta_lavador',
      turno_id = v_turno_actual,
      cobrada_en = now()
    where id = v_pendiente.id;

    insert into public.movimientos_inventario (
      producto_id, tipo, cantidad, costo_unitario, motivo, responsable, venta_id
    ) values (
      v_pendiente.producto_id, 'salida', -v_pendiente.cantidad,
      interno.costo_promedio_producto(v_pendiente.producto_id),
      'Venta #' || v_pendiente.consecutivo || ' (cargada a lavador — cuenta: ' || v_cuenta.titular || ')',
      v_responsable,
      v_pendiente.id
    );
  end loop;

  insert into public.deudas_lavador (lavador_id, tipo, monto, cuenta_id, motivo, registrado_por)
  values (
    p_lavador_id, 'consumo', v_total, p_cuenta_id,
    'Consumo cargado a liquidación — cuenta "' || v_cuenta.titular || '"', v_responsable
  );

  return next v_cuenta;
end;
$$;

revoke execute on function public.cargar_cuenta_a_lavador(uuid, uuid, text) from public, anon;
grant execute on function public.cargar_cuenta_a_lavador(uuid, uuid, text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- Bitácora (0044) — mismo patrón que ventas/cuentas/compras.
-- ─────────────────────────────────────────────────────────────────────────────────────────────

create trigger bitacora_deudas_lavador_insert after insert on public.deudas_lavador
  for each row execute function interno.bitacora_trigger('crear');

create trigger bitacora_deudas_lavador_update after update on public.deudas_lavador
  for each row execute function interno.bitacora_trigger(
    'editar', 'estado', 'motivo_anulacion', 'anulada_por'
  );

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- anular_liquidacion (0049) gana la reversa de la deuda que hubiera descontado — si no, anular
-- una liquidación con deuda_descontada > 0 le regalaría esa parte de la deuda al lavador (las
-- órdenes vuelven a pendientes para volver a cobrarse, pero la deuda ya quedó reducida sin que él
-- haya recibido esa plata realmente). Se reescribe completa (create or replace conserva grants).
-- ─────────────────────────────────────────────────────────────────────────────────────────────

create or replace function public.anular_liquidacion(p_id uuid, p_motivo text, p_anulada_por text)
returns setof public.liquidaciones
language plpgsql security definer set search_path = public
as $$
declare
  v_liq public.liquidaciones;
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

  select * into v_liq from public.liquidaciones where id = p_id for update;
  if not found then raise exception 'La liquidación no existe'; end if;
  if v_liq.pagada then raise exception 'Una liquidación pagada no se puede anular'; end if;
  if v_liq.anulada then raise exception 'La liquidación ya está anulada'; end if;

  update public.ordenes set liquidacion_id = null where liquidacion_id = p_id;
  update public.ordenes set liquidacion_id_2 = null where liquidacion_id_2 = p_id;

  -- Nuevo (0065): la deuda que este corte hubiera descontado vuelve a quedar pendiente.
  update public.deudas_lavador set
    estado = 'anulado', motivo_anulacion = v_motivo, anulada_por = v_por, anulada_en = now()
  where liquidacion_id = p_id and tipo = 'liquidacion' and estado = 'activo';

  update public.liquidaciones set
    anulada = true, motivo_anulacion = v_motivo, anulada_por = v_por, anulada_en = now()
  where id = p_id
  returning * into v_liq;

  return next v_liq;
end;
$$;

-- Nota de advisor: `registrar_prestamo_lavador`/`cargar_cuenta_a_lavador` salen como WARN
-- "Signed-In Users Can Execute SECURITY DEFINER Function" — intencional, mismo criterio que
-- 0032/0041/0060/0064: necesitan definer para escribir en `deudas_lavador`/`movimientos_inventario`
-- saltándose el RLS por rol; el candado es el chequeo de rol y de estado del turno al entrar.
