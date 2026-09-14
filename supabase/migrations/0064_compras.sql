-- Compras de inventario: entidad propia con proveedor/factura, en vez de "entrada" suelta del
-- formulario de movimientos.
--
-- Fase 3 del análisis de inventario (2026-09-14). Hoy una compra real (agua, cerveza, mecato,
-- insumos de lavado) se registraba como una `entrada` cualquiera del formulario de movimientos:
-- proveedor y costo_unitario son campos opcionales sueltos, sin nada que agrupe "esto fue UNA
-- compra de N productos" ni que la distinga de un ajuste de conteo. Eso ya causó un doble
-- registro real en producción (Julián, 30-ago: 3 entradas + un ajuste "-72 subí de más sin
-- querer" en Coronita) porque no había una sola pantalla pensada para "acabo de comprar esto".
--
-- Decisiones de Alessandro (2026-09-14):
--  1. Una compra se paga con la caja del turno O con plata de gerencia (aparte) — depende del
--     caso, no una regla fija. Si es con caja, se resta del efectivo esperado del arqueo (mismo
--     mecanismo que `gastos.origen = 'caja'`, 0042); si es con gerencia, no toca el arqueo para
--     nada, solo registra el costo para inventario.
--  2. El jefe de patio SÍ ve/escribe el costo unitario al registrar SU PROPIA compra — es quien
--     fue a comprar y sabe cuánto pagó. Esto NO cambia la regla general de que el costo es
--     sensible (CLAUDE.md §Roles): `productos.costo` y `movimientos_inventario.costo_unitario`
--     siguen fuera del alcance de jefe_zona en cualquier OTRA pantalla — la excepción es
--     puntual, acotada a la tabla `compras`/`compras_items` de esta migración.
--
-- Cada compra genera sus entradas de `movimientos_inventario` CON costo (a diferencia de los
-- ajustes de conteo, que nunca llevan costo — 0048) — así el costo promedio ponderado y el
-- snapshot de costo de mercancía vendida (0032/0033) se alimentan de compras de verdad, no de
-- ajustes que estaban tapando compras sin registrar.

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- Esquema
-- ─────────────────────────────────────────────────────────────────────────────────────────────

create table public.compras (
  id uuid primary key default gen_random_uuid(),
  consecutivo integer generated always as identity,
  proveedor text not null,
  numero_factura text,
  fecha date not null default current_date,
  origen_pago text not null check (origen_pago in ('caja', 'gerencia')),
  -- Turno de jefe_zona cuya caja pagó la compra — obligatorio si origen_pago = 'caja', null si
  -- 'gerencia' (no toca ningún arqueo).
  turno_id uuid references public.turnos_caja(id),
  total integer not null default 0 check (total >= 0),
  registrado_por text not null,
  estado text not null default 'activa' check (estado in ('activa', 'anulada')),
  motivo_anulacion text,
  anulada_por text,
  anulada_en timestamptz,
  creado_en timestamptz not null default now(),
  constraint compras_turno_requerido_si_caja check (origen_pago <> 'caja' or turno_id is not null)
);
create index compras_turno_idx on public.compras (turno_id) where turno_id is not null;
create index compras_fecha_idx on public.compras (fecha desc);

create table public.compras_items (
  id uuid primary key default gen_random_uuid(),
  compra_id uuid not null references public.compras(id) on delete cascade,
  producto_id uuid not null references public.productos(id),
  cantidad integer not null check (cantidad > 0),
  -- A propósito SIN el fallback de `interno.costo_promedio_producto` — acá se guarda literalmente
  -- lo que la persona escribió que pagó, no un cálculo.
  costo_unitario integer not null check (costo_unitario >= 0)
);
create index compras_items_compra_idx on public.compras_items (compra_id);

-- Traza hacia atrás desde el movimiento de inventario, mismo patrón que `venta_id`.
alter table public.movimientos_inventario add column compra_id uuid references public.compras(id);
create index movimientos_compra_idx on public.movimientos_inventario (compra_id) where compra_id is not null;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- RLS
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- Admin y jefe_zona leen las dos tablas COMPLETAS, costo_unitario incluido — es la excepción
-- puntual explicada arriba, no un descuido: jefe_zona ve el costo de lo que ÉL MISMO compró (o
-- cualquier compra del negocio, igual que ya ve las ventas/cuentas de cualquiera). Distinto de
-- `conteos_inventario_lineas` (admin-only, valor a costo pero calculado por el sistema, no
-- tecleado por la persona). La escritura solo pasa por las RPC de abajo.

alter table public.compras enable row level security;
create policy compras_admin_select on public.compras
  for select to authenticated using (interno.es_admin() and interno.es_activo());
create policy compras_jefe_zona_select on public.compras
  for select to authenticated using (interno.rol_actual() = 'jefe_zona' and interno.es_activo());
grant select on public.compras to authenticated;

alter table public.compras_items enable row level security;
create policy compras_items_admin_select on public.compras_items
  for select to authenticated using (interno.es_admin() and interno.es_activo());
create policy compras_items_jefe_zona_select on public.compras_items
  for select to authenticated using (interno.rol_actual() = 'jefe_zona' and interno.es_activo());
grant select on public.compras_items to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- registrar_compra
-- ─────────────────────────────────────────────────────────────────────────────────────────────

create function public.registrar_compra(
  p_proveedor text,
  p_numero_factura text,
  p_fecha date,
  p_origen_pago text,
  p_turno_id uuid,
  p_items jsonb,       -- [{ "producto_id": uuid, "cantidad": int, "costo_unitario": int }]
  p_registrado_por text
)
returns setof public.compras
language plpgsql security definer set search_path = public
as $$
declare
  v_compra public.compras;
  v_item jsonb;
  v_producto record;
  v_cantidad integer;
  v_costo integer;
  v_total integer := 0;
  v_proveedor text := nullif(trim(p_proveedor), '');
  v_factura text := nullif(trim(p_numero_factura), '');
  v_responsable text := nullif(trim(p_registrado_por), '');
  v_turno public.turnos_caja;
begin
  if not interno.es_activo() or interno.rol_actual() not in ('jefe_zona', 'admin') then
    raise exception 'No autorizado para registrar compras';
  end if;
  if v_proveedor is null then
    raise exception 'El proveedor es obligatorio';
  end if;
  if v_responsable is null then
    raise exception 'Indica quién registra la compra';
  end if;
  if p_origen_pago not in ('caja', 'gerencia') then
    raise exception 'Origen de pago inválido: %', p_origen_pago;
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'La compra no tiene productos';
  end if;

  if p_origen_pago = 'caja' then
    if p_turno_id is null then
      raise exception 'Indica el turno cuya caja paga la compra';
    end if;
    select * into v_turno from public.turnos_caja where id = p_turno_id for update;
    if not found then
      raise exception 'El turno no existe';
    end if;
    if v_turno.rol <> 'jefe_zona' then
      raise exception 'Solo la caja de jefe de zona paga compras';
    end if;
    if v_turno.cerrado then
      raise exception 'Ese turno ya está cerrado — no se le puede cargar una compra (regla 14)';
    end if;
  end if;

  for v_item in select value from jsonb_array_elements(p_items) as t(value)
  loop
    v_cantidad := nullif(v_item->>'cantidad', '')::integer;
    v_costo := nullif(v_item->>'costo_unitario', '')::integer;
    if v_cantidad is null or v_cantidad <= 0 then
      raise exception 'La cantidad debe ser mayor a cero';
    end if;
    if v_costo is null or v_costo < 0 then
      raise exception 'El costo unitario debe ser mayor o igual a cero';
    end if;
    select nombre into v_producto from public.productos where id = (v_item->>'producto_id')::uuid;
    if not found then
      raise exception 'El producto seleccionado no existe';
    end if;
    v_total := v_total + v_cantidad * v_costo;
  end loop;

  insert into public.compras (
    proveedor, numero_factura, fecha, origen_pago, turno_id, total, registrado_por
  ) values (
    v_proveedor, v_factura, coalesce(p_fecha, current_date), p_origen_pago,
    case when p_origen_pago = 'caja' then p_turno_id else null end, v_total, v_responsable
  )
  returning * into v_compra;

  for v_item in select value from jsonb_array_elements(p_items) as t(value)
  loop
    v_cantidad := (v_item->>'cantidad')::integer;
    v_costo := (v_item->>'costo_unitario')::integer;

    insert into public.compras_items (compra_id, producto_id, cantidad, costo_unitario)
    values (v_compra.id, (v_item->>'producto_id')::uuid, v_cantidad, v_costo);

    insert into public.movimientos_inventario (
      producto_id, tipo, cantidad, costo_unitario, proveedor, motivo, responsable, compra_id
    ) values (
      (v_item->>'producto_id')::uuid, 'entrada', v_cantidad, v_costo, v_proveedor,
      'Compra #' || v_compra.consecutivo || coalesce(' — factura ' || v_factura, ''),
      v_responsable, v_compra.id
    );
  end loop;

  return next v_compra;
end;
$$;

revoke execute on function public.registrar_compra(text, text, date, text, uuid, jsonb, text) from public, anon;
grant execute on function public.registrar_compra(text, text, date, text, uuid, jsonb, text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- anular_compra — regla 13: motivo obligatorio, no se borra. Repone el stock con una salida SIN
-- costo (mismo criterio que `anular_venta`/la entrada compensatoria de 0048: la reversa no es una
-- venta ni una compra real, no debe mover el costo promedio ponderado).
-- ─────────────────────────────────────────────────────────────────────────────────────────────

create function public.anular_compra(
  p_compra_id uuid,
  p_motivo text,
  p_anulada_por text
)
returns setof public.compras
language plpgsql security definer set search_path = public
as $$
declare
  v_compra public.compras;
  v_item record;
  v_motivo text := nullif(trim(p_motivo), '');
  v_responsable text := nullif(trim(p_anulada_por), '');
begin
  if not interno.es_activo() or interno.rol_actual() not in ('jefe_zona', 'admin') then
    raise exception 'No autorizado para anular compras';
  end if;
  if v_motivo is null or length(v_motivo) < 3 then
    raise exception 'El motivo de anulación es obligatorio';
  end if;
  if v_responsable is null then
    raise exception 'Indica quién anula la compra';
  end if;

  select * into v_compra from public.compras where id = p_compra_id for update;
  if not found then
    raise exception 'La compra no existe';
  end if;
  if v_compra.estado = 'anulada' then
    raise exception 'La compra ya está anulada';
  end if;

  for v_item in select * from public.compras_items where compra_id = p_compra_id
  loop
    insert into public.movimientos_inventario (
      producto_id, tipo, cantidad, motivo, responsable, compra_id
    ) values (
      v_item.producto_id, 'salida', -v_item.cantidad,
      'Reverso por anulación de compra #' || v_compra.consecutivo, v_responsable, v_compra.id
    );
  end loop;

  update public.compras set
    estado = 'anulada', motivo_anulacion = v_motivo, anulada_por = v_responsable, anulada_en = now()
  where id = p_compra_id
  returning * into v_compra;

  return next v_compra;
end;
$$;

revoke execute on function public.anular_compra(uuid, text, text) from public, anon;
grant execute on function public.anular_compra(uuid, text, text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- Bitácora (0044): creación y anulación, mismo patrón que ventas/cuentas.
-- ─────────────────────────────────────────────────────────────────────────────────────────────

create trigger bitacora_compras_insert after insert on public.compras
  for each row execute function interno.bitacora_trigger('crear');

create trigger bitacora_compras_update after update on public.compras
  for each row execute function interno.bitacora_trigger(
    'editar', 'estado', 'motivo_anulacion', 'anulada_por'
  );

-- Nota: los `movimientos_inventario` que genera una compra ya quedan auditados por el trigger
-- `bitacora_movimientos_insert` existente (0044) — no hace falta nada nuevo ahí.

-- Nota de advisor: `registrar_compra`/`anular_compra` salen como WARN "Signed-In Users Can
-- Execute SECURITY DEFINER Function" — intencional, mismo criterio que 0032/0035/0036/0041/0060:
-- necesitan definer para escribir en `compras_items`/`movimientos_inventario` saltándose el RLS
-- por rol; el candado es el chequeo de rol y de estado del turno al entrar.
