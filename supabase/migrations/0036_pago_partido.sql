-- Pago partido + corrección auditable del reparto.
--
-- 1) PAGO PARTIDO. Un cobro —el lavado con sus productos, o un carrito de mostrador— se puede
--    repartir en 1 a 3 líneas por método de pago (efectivo / transferencia / datáfono) que deben
--    sumar EXACTO el total. Antes cada orden/venta guardaba un único `metodo_pago`. Ahora el
--    detalle real vive en `pagos` (una fila por línea); `ordenes.metodo_pago` / `ventas.metodo_pago`
--    quedan como etiqueta-resumen ('mixto' cuando hubo más de un método) — la plata por método
--    para arqueo y dashboards sale SIEMPRE de `pagos`, nunca de esa columna.
--
-- 2) CORRECCIÓN DEL REPARTO. Si el reparto se registró mal (se anotó "$30k efectivo" y en
--    realidad fue "$20k efectivo + $10k transferencia"), `corregir_pagos` marca las líneas
--    vigentes como anuladas con motivo/quién/cuándo (regla 13: no se borran) e inserta las
--    correctas. SOLO cambia el reparto: la suma nueva debe igualar la vigente. La corrección se
--    imputa al MISMO turno del cobro original; si ese turno ya está cerrado, sus columnas de
--    arqueo NO se recalculan (regla 14) y la corrección solo se ve en los reportes de admin.
--
-- Permiso (confirmado con el negocio): jefe de zona y admin, turno abierto o cerrado, sin PIN.
--
-- Limitación conocida y aceptada para esta iteración: anular UNA línea de producto de una orden
-- ya cobrada (no un carrito de mostrador, sino un producto suelto cargado a un lavado ya pagado)
-- repone su stock pero no ajusta `pagos` — habría que corregir el reparto a mano. No es un flujo
-- que la UI ofrezca hoy.

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- Esquema
-- ─────────────────────────────────────────────────────────────────────────────────────────────

create table public.pagos (
  id uuid primary key default gen_random_uuid(),
  -- Exactamente uno de los dos (constraint abajo): a qué cobro pertenece esta línea.
  orden_id uuid references public.ordenes(id),
  venta_grupo_id uuid,
  metodo_pago text not null check (metodo_pago in ('efectivo', 'transferencia', 'datafono')),
  monto integer not null check (monto > 0),
  referencia_pago text,
  -- Turno de jefe_zona en que se registró el cobro — alimenta el arqueo (calcularValorEsperado).
  turno_id uuid references public.turnos_caja(id),
  -- Línea reemplazada por una corrección de reparto: sigue visible en auditoría, no suma a nada.
  anulado boolean not null default false,
  -- Línea nacida de una corrección (reemplaza a otra anulada del mismo cobro).
  es_correccion boolean not null default false,
  motivo_correccion text,
  corregido_por text,
  corregido_en timestamptz,
  creado_en timestamptz not null default now(),
  constraint pagos_target_check check (num_nonnulls(orden_id, venta_grupo_id) = 1)
);
create index pagos_orden_idx on public.pagos (orden_id);
create index pagos_venta_grupo_idx on public.pagos (venta_grupo_id);
create index pagos_turno_metodo_idx on public.pagos (turno_id, metodo_pago) where not anulado;

-- Agrupa las filas `ventas` de un mismo carrito de mostrador — el pago partido es a nivel de
-- carrito, no de producto. Null para productos cargados a una orden (usan `orden_id`) y filas
-- anteriores a esta migración.
alter table public.ventas add column venta_grupo_id uuid;
create index ventas_venta_grupo_idx on public.ventas (venta_grupo_id);

-- 'mixto' = el cobro tuvo más de un método. Etiqueta-resumen únicamente.
alter table public.ordenes drop constraint ordenes_metodo_pago_check;
alter table public.ordenes add constraint ordenes_metodo_pago_check
  check (metodo_pago is null or metodo_pago in ('efectivo', 'transferencia', 'datafono', 'mixto'));

alter table public.ventas drop constraint ventas_metodo_pago_check;
alter table public.ventas add constraint ventas_metodo_pago_check
  check (metodo_pago in ('efectivo', 'transferencia', 'datafono', 'mixto'));

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- RLS: mismo molde que `ventas` (0029) — admin y jefe_zona leen; vigilante sin acceso. La
-- escritura pasa solo por las RPC SECURITY DEFINER de abajo (corren como owner, saltan RLS), así
-- que no hacen falta policies de insert/update.
-- ─────────────────────────────────────────────────────────────────────────────────────────────

alter table public.pagos enable row level security;
create policy pagos_admin_select on public.pagos
  for select to authenticated using (interno.es_admin() and interno.es_activo());
create policy pagos_jefe_zona_select on public.pagos
  for select to authenticated using (interno.rol_actual() = 'jefe_zona' and interno.es_activo());
grant select on public.pagos to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- Trigger existente (0035): al anular una orden, sus ventas pendientes se anulan solas. Se
-- amplía para anular también sus líneas de pago — dejan de contar para el arqueo.
-- ─────────────────────────────────────────────────────────────────────────────────────────────

create or replace function public.anular_ventas_pendientes_de_orden()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  update public.ventas set
    estado = 'anulada',
    motivo_anulacion = coalesce(nullif(trim(new.motivo_anulacion), ''), 'Orden anulada'),
    anulada_por = coalesce(new.anulada_por, 'sistema'),
    anulada_en = now()
  where orden_id = new.id and estado = 'pendiente';

  update public.pagos set anulado = true
  where orden_id = new.id and anulado = false;

  return new;
end;
$$;

revoke execute on function public.anular_ventas_pendientes_de_orden() from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- cobrar_orden: ahora recibe el reparto (`p_pagos` jsonb: [{metodo, monto, referencia}]) en vez
-- de un método suelto. Se DROPea la firma vieja (uuid,text,text) para no dejar overloads.
-- ─────────────────────────────────────────────────────────────────────────────────────────────

drop function if exists public.cobrar_orden(uuid, text, text);

create function public.cobrar_orden(p_orden_id uuid, p_pagos jsonb)
returns setof public.ordenes
language plpgsql security definer set search_path = public
as $$
declare
  v_orden public.ordenes;
  v_turno_id uuid;
  v_pendiente record;
  v_stock integer;
  v_hay_pendientes boolean;
  v_espera_segundos integer;
  v_total_a_cobrar integer;
  v_total_pagos integer := 0;
  v_n_lineas integer;
  v_pago jsonb;
  v_metodo text;
  v_monto integer;
  v_ref text;
  v_metodos text[] := array[]::text[];
  v_metodo_resumen text;
  v_ref_resumen text;
begin
  if not interno.es_activo() or interno.rol_actual() not in ('jefe_zona', 'admin') then
    raise exception 'No autorizado para cobrar órdenes';
  end if;
  if p_pagos is null or jsonb_typeof(p_pagos) <> 'array' then
    raise exception 'Se requiere al menos una línea de pago';
  end if;
  v_n_lineas := jsonb_array_length(p_pagos);
  if v_n_lineas < 1 or v_n_lineas > 3 then
    raise exception 'El cobro admite entre 1 y 3 líneas de pago (recibidas: %)', v_n_lineas;
  end if;

  select * into v_orden from public.ordenes where id = p_orden_id for update;
  if not found then
    raise exception 'La orden no existe';
  end if;
  if v_orden.estado not in ('en_proceso', 'listo') then
    raise exception 'La orden ya fue % — no se puede cobrar de nuevo', v_orden.estado;
  end if;

  select
    exists (select 1 from public.ventas where orden_id = p_orden_id and estado = 'pendiente'),
    coalesce((select sum(total) from public.ventas where orden_id = p_orden_id and estado = 'pendiente'), 0)
  into v_hay_pendientes, v_total_a_cobrar;
  v_total_a_cobrar := v_orden.precio + v_total_a_cobrar;

  for v_pago in select value from jsonb_array_elements(p_pagos) as t(value)
  loop
    v_metodo := v_pago->>'metodo';
    v_monto := nullif(v_pago->>'monto', '')::integer;
    v_ref := nullif(trim(v_pago->>'referencia'), '');
    if v_metodo not in ('efectivo', 'transferencia', 'datafono') then
      raise exception 'Método de pago inválido: %', v_metodo;
    end if;
    if v_monto is null or v_monto <= 0 then
      raise exception 'Cada línea de pago debe tener un monto mayor a cero';
    end if;
    if v_metodo in ('transferencia', 'datafono') and v_ref is null then
      raise exception 'La referencia es obligatoria en pagos por transferencia o datáfono';
    end if;
    v_total_pagos := v_total_pagos + v_monto;
    v_metodos := v_metodos || v_metodo;
  end loop;

  if v_total_pagos <> v_total_a_cobrar then
    raise exception 'Las líneas de pago suman % pero el total a cobrar es %', v_total_pagos, v_total_a_cobrar;
  end if;

  select id into v_turno_id from public.turnos_caja where rol = 'jefe_zona' and not cerrado;
  if v_turno_id is null and v_hay_pendientes then
    raise exception 'No hay turno de caja abierto — ábrelo antes de cobrar productos cargados a la orden.';
  end if;

  v_espera_segundos := greatest(
    0, extract(epoch from (now() - coalesce(v_orden.lista_en, v_orden.creado_en)))::integer
  );

  if (select count(distinct m) from unnest(v_metodos) m) = 1 then
    v_metodo_resumen := v_metodos[1];
    v_ref_resumen := nullif(trim(p_pagos->0->>'referencia'), '');
  else
    v_metodo_resumen := 'mixto';
    v_ref_resumen := null;
  end if;

  update public.ordenes set
    estado = 'entregado',
    metodo_pago = v_metodo_resumen,
    referencia_pago = v_ref_resumen,
    entregada_en = now(),
    tiempo_espera_entrega_segundos = v_espera_segundos,
    turno_id = v_turno_id
  where id = p_orden_id
  returning * into v_orden;

  for v_pago in select value from jsonb_array_elements(p_pagos) as t(value)
  loop
    insert into public.pagos (orden_id, metodo_pago, monto, referencia_pago, turno_id)
    values (
      p_orden_id, v_pago->>'metodo', (v_pago->>'monto')::integer,
      nullif(trim(v_pago->>'referencia'), ''), v_turno_id
    );
  end loop;

  for v_pendiente in
    select * from public.ventas where orden_id = p_orden_id and estado = 'pendiente' for update
  loop
    select coalesce(sum(cantidad), 0) into v_stock
    from public.movimientos_inventario where producto_id = v_pendiente.producto_id;
    if v_stock < v_pendiente.cantidad then
      raise exception 'Stock insuficiente de "%": quedan %, la orden pide %',
        (select nombre from public.productos where id = v_pendiente.producto_id),
        v_stock, v_pendiente.cantidad;
    end if;

    update public.ventas set
      estado = 'activa',
      metodo_pago = v_metodo_resumen,
      referencia_pago = v_ref_resumen,
      turno_id = v_turno_id
    where id = v_pendiente.id;

    insert into public.movimientos_inventario (
      producto_id, tipo, cantidad, costo_unitario, motivo, responsable, venta_id
    ) values (
      v_pendiente.producto_id, 'salida', -v_pendiente.cantidad,
      interno.costo_promedio_producto(v_pendiente.producto_id),
      'Venta #' || v_pendiente.consecutivo || ' (orden #' || v_orden.consecutivo || ')',
      coalesce(nullif(trim(v_orden.jefe_zona_responsable), ''), v_pendiente.vendido_por),
      v_pendiente.id
    );
  end loop;

  return next v_orden;
end;
$$;

revoke execute on function public.cobrar_orden(uuid, jsonb) from public, anon;
grant execute on function public.cobrar_orden(uuid, jsonb) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- registrar_venta_carrito: venta aparte de mostrador con varias líneas de producto y pago
-- partido, en una sola transacción. `registrar_venta` (0035, 6 args) queda solo para el camino
-- de un producto cargado a una orden (sin pago, `pendiente`).
-- ─────────────────────────────────────────────────────────────────────────────────────────────

create function public.registrar_venta_carrito(
  p_items jsonb,
  p_pagos jsonb,
  p_vendido_por text
)
returns setof public.ventas
language plpgsql security definer set search_path = public
as $$
declare
  v_grupo uuid := gen_random_uuid();
  v_turno_id uuid;
  v_responsable text := nullif(trim(p_vendido_por), '');
  v_item jsonb;
  v_pago jsonb;
  v_producto record;
  v_venta public.ventas;
  v_cantidad integer;
  v_stock integer;
  v_total_items integer := 0;
  v_total_pagos integer := 0;
  v_n_pagos integer;
  v_metodo text;
  v_monto integer;
  v_ref text;
  v_metodos text[] := array[]::text[];
  v_metodo_resumen text;
  v_ref_resumen text;
begin
  if not interno.es_activo() or interno.rol_actual() not in ('jefe_zona', 'admin') then
    raise exception 'No autorizado para registrar ventas';
  end if;
  if v_responsable is null then
    raise exception 'El responsable de la venta es obligatorio';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'El carrito no tiene productos';
  end if;
  if p_pagos is null or jsonb_typeof(p_pagos) <> 'array' then
    raise exception 'Se requiere al menos una línea de pago';
  end if;
  v_n_pagos := jsonb_array_length(p_pagos);
  if v_n_pagos < 1 or v_n_pagos > 3 then
    raise exception 'El cobro admite entre 1 y 3 líneas de pago (recibidas: %)', v_n_pagos;
  end if;

  select id into v_turno_id from public.turnos_caja where rol = 'jefe_zona' and not cerrado;
  if v_turno_id is null then
    raise exception 'No hay turno de caja abierto — ábrelo antes de registrar ventas.';
  end if;

  for v_pago in select value from jsonb_array_elements(p_pagos) as t(value)
  loop
    v_metodo := v_pago->>'metodo';
    v_monto := nullif(v_pago->>'monto', '')::integer;
    v_ref := nullif(trim(v_pago->>'referencia'), '');
    if v_metodo not in ('efectivo', 'transferencia', 'datafono') then
      raise exception 'Método de pago inválido: %', v_metodo;
    end if;
    if v_monto is null or v_monto <= 0 then
      raise exception 'Cada línea de pago debe tener un monto mayor a cero';
    end if;
    if v_metodo in ('transferencia', 'datafono') and v_ref is null then
      raise exception 'La referencia es obligatoria en pagos por transferencia o datáfono';
    end if;
    v_total_pagos := v_total_pagos + v_monto;
    v_metodos := v_metodos || v_metodo;
  end loop;

  if (select count(distinct m) from unnest(v_metodos) m) = 1 then
    v_metodo_resumen := v_metodos[1];
    v_ref_resumen := nullif(trim(p_pagos->0->>'referencia'), '');
  else
    v_metodo_resumen := 'mixto';
    v_ref_resumen := null;
  end if;

  for v_item in select value from jsonb_array_elements(p_items) as t(value)
  loop
    v_cantidad := nullif(v_item->>'cantidad', '')::integer;
    if v_cantidad is null or v_cantidad <= 0 then
      raise exception 'La cantidad debe ser mayor a cero';
    end if;

    select nombre, activo, precio_venta into v_producto
    from public.productos where id = (v_item->>'producto_id')::uuid;
    if not found then
      raise exception 'El producto seleccionado no existe';
    end if;
    if not v_producto.activo then
      raise exception 'El producto "%" está inactivo — actívalo desde /admin/dinero/inventario antes de venderlo.', v_producto.nombre;
    end if;
    if v_producto.precio_venta is null then
      raise exception 'El producto "%" no tiene precio de venta configurado — defínelo desde /admin/dinero/inventario.', v_producto.nombre;
    end if;

    select coalesce(sum(cantidad), 0) into v_stock
    from public.movimientos_inventario where producto_id = (v_item->>'producto_id')::uuid;
    if v_stock < v_cantidad then
      raise exception 'Stock insuficiente de "%": quedan %, se piden %', v_producto.nombre, v_stock, v_cantidad;
    end if;

    insert into public.ventas (
      producto_id, cantidad, precio_unitario, total, metodo_pago, referencia_pago,
      turno_id, vendido_por, estado, venta_grupo_id
    ) values (
      (v_item->>'producto_id')::uuid, v_cantidad, v_producto.precio_venta,
      v_producto.precio_venta * v_cantidad, v_metodo_resumen, v_ref_resumen,
      v_turno_id, v_responsable, 'activa', v_grupo
    )
    returning * into v_venta;

    insert into public.movimientos_inventario (
      producto_id, tipo, cantidad, costo_unitario, motivo, responsable, venta_id
    ) values (
      v_venta.producto_id, 'salida', -v_venta.cantidad,
      interno.costo_promedio_producto(v_venta.producto_id),
      'Venta #' || v_venta.consecutivo, v_responsable, v_venta.id
    );

    v_total_items := v_total_items + v_venta.total;
    return next v_venta;
  end loop;

  if v_total_pagos <> v_total_items then
    raise exception 'Las líneas de pago suman % pero el carrito totaliza %', v_total_pagos, v_total_items;
  end if;

  for v_pago in select value from jsonb_array_elements(p_pagos) as t(value)
  loop
    insert into public.pagos (venta_grupo_id, metodo_pago, monto, referencia_pago, turno_id)
    values (
      v_grupo, v_pago->>'metodo', (v_pago->>'monto')::integer,
      nullif(trim(v_pago->>'referencia'), ''), v_turno_id
    );
  end loop;
end;
$$;

revoke execute on function public.registrar_venta_carrito(jsonb, jsonb, text) from public, anon;
grant execute on function public.registrar_venta_carrito(jsonb, jsonb, text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- anular_venta: si la venta pertenece a un carrito de mostrador (venta_grupo_id), se anula el
-- carrito COMPLETO (todas sus líneas) y sus líneas de pago — el pago partido es a nivel de
-- carrito, no se puede dejar medio anulado. Filas sueltas (orden o legado) se comportan como en
-- 0035. Idempotente: anular dos veces falla explícito.
-- ─────────────────────────────────────────────────────────────────────────────────────────────

create or replace function public.anular_venta(
  p_venta_id uuid,
  p_motivo text,
  p_anulada_por text
)
returns setof public.ventas
language plpgsql security definer set search_path = public
as $$
declare
  v_venta public.ventas;
  v_row record;
  v_grupo uuid;
  v_motivo text := nullif(trim(p_motivo), '');
  v_responsable text := nullif(trim(p_anulada_por), '');
  v_anulo_objetivo boolean := false;
begin
  if not interno.es_activo() or interno.rol_actual() not in ('jefe_zona', 'admin') then
    raise exception 'No autorizado para anular ventas';
  end if;
  if v_motivo is null or length(v_motivo) < 3 then
    raise exception 'El motivo de anulación es obligatorio';
  end if;
  if v_responsable is null then
    raise exception 'Indica quién anula la venta';
  end if;

  select * into v_venta from public.ventas where id = p_venta_id for update;
  if not found then
    raise exception 'La venta no existe';
  end if;
  v_grupo := v_venta.venta_grupo_id;

  for v_row in
    select * from public.ventas
    where (id = p_venta_id or (v_grupo is not null and venta_grupo_id = v_grupo))
      and estado in ('activa', 'pendiente')
    for update
  loop
    update public.ventas set
      estado = 'anulada', motivo_anulacion = v_motivo,
      anulada_por = v_responsable, anulada_en = now()
    where id = v_row.id;

    -- Solo se repone stock si la venta ya lo había descontado (una `pendiente` nunca lo movió).
    if v_row.estado = 'activa' then
      insert into public.movimientos_inventario (
        producto_id, tipo, cantidad, motivo, responsable, venta_id
      ) values (
        v_row.producto_id, 'entrada', v_row.cantidad,
        'Reverso por anulación de venta #' || v_row.consecutivo, v_responsable, v_row.id
      );
    end if;

    if v_row.id = p_venta_id then
      v_anulo_objetivo := true;
    end if;
  end loop;

  if not v_anulo_objetivo then
    raise exception 'La venta ya estaba anulada';
  end if;

  -- Anula las líneas de pago del carrito (si la venta era parte de uno) — fuera del arqueo.
  if v_grupo is not null then
    update public.pagos set anulado = true where venta_grupo_id = v_grupo and anulado = false;
  end if;

  select * into v_venta from public.ventas where id = p_venta_id;
  return next v_venta;
end;
$$;

revoke execute on function public.anular_venta(uuid, text, text) from public, anon;
grant execute on function public.anular_venta(uuid, text, text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- corregir_pagos: reescribe el REPARTO de un cobro (por orden o por carrito). La suma nueva debe
-- igualar la vigente — no cambia el total, solo cómo se repartió. Regla 13: las líneas viejas se
-- marcan anuladas con motivo/quién/cuándo, no se borran. Regla 14: se imputa al turno del cobro
-- original; si está cerrado, sus columnas de arqueo no se tocan.
-- ─────────────────────────────────────────────────────────────────────────────────────────────

create function public.corregir_pagos(
  p_target jsonb,
  p_pagos jsonb,
  p_motivo text,
  p_corregido_por text
)
returns setof public.pagos
language plpgsql security definer set search_path = public
as $$
declare
  v_orden_id uuid := nullif(p_target->>'orden_id', '')::uuid;
  v_grupo_id uuid := nullif(p_target->>'venta_grupo_id', '')::uuid;
  v_motivo text := nullif(trim(p_motivo), '');
  v_responsable text := nullif(trim(p_corregido_por), '');
  v_total_actual integer;
  v_total_nuevo integer := 0;
  v_turno_id uuid;
  v_n integer;
  v_pago jsonb;
  v_metodo text;
  v_monto integer;
  v_ref text;
  v_metodos text[] := array[]::text[];
  v_metodo_resumen text;
  v_ahora timestamptz := now();
begin
  if not interno.es_activo() or interno.rol_actual() not in ('jefe_zona', 'admin') then
    raise exception 'No autorizado para corregir pagos';
  end if;
  if (v_orden_id is null) = (v_grupo_id is null) then
    raise exception 'Indica exactamente una orden o un grupo de venta a corregir';
  end if;
  if v_motivo is null or length(v_motivo) < 3 then
    raise exception 'El motivo de la corrección es obligatorio';
  end if;
  if v_responsable is null then
    raise exception 'Indica quién hace la corrección';
  end if;
  if p_pagos is null or jsonb_typeof(p_pagos) <> 'array' then
    raise exception 'Se requiere al menos una línea de pago';
  end if;
  v_n := jsonb_array_length(p_pagos);
  if v_n < 1 or v_n > 3 then
    raise exception 'El reparto admite entre 1 y 3 líneas (recibidas: %)', v_n;
  end if;

  select coalesce(sum(monto), 0) into v_total_actual
  from public.pagos
  where anulado = false
    and ((v_orden_id is not null and orden_id = v_orden_id)
      or (v_grupo_id is not null and venta_grupo_id = v_grupo_id));
  if v_total_actual = 0 then
    raise exception 'No hay un cobro vigente para corregir';
  end if;

  -- Turno del cobro original — la corrección se le imputa (aunque esté cerrado: sus columnas de
  -- arqueo no se recalculan, la corrección solo vive en el reporte).
  select turno_id into v_turno_id
  from public.pagos
  where anulado = false
    and ((v_orden_id is not null and orden_id = v_orden_id)
      or (v_grupo_id is not null and venta_grupo_id = v_grupo_id))
  order by creado_en
  limit 1;

  for v_pago in select value from jsonb_array_elements(p_pagos) as t(value)
  loop
    v_metodo := v_pago->>'metodo';
    v_monto := nullif(v_pago->>'monto', '')::integer;
    v_ref := nullif(trim(v_pago->>'referencia'), '');
    if v_metodo not in ('efectivo', 'transferencia', 'datafono') then
      raise exception 'Método de pago inválido: %', v_metodo;
    end if;
    if v_monto is null or v_monto <= 0 then
      raise exception 'Cada línea debe tener un monto mayor a cero';
    end if;
    if v_metodo in ('transferencia', 'datafono') and v_ref is null then
      raise exception 'La referencia es obligatoria en pagos por transferencia o datáfono';
    end if;
    v_total_nuevo := v_total_nuevo + v_monto;
    v_metodos := v_metodos || v_metodo;
  end loop;

  if v_total_nuevo <> v_total_actual then
    raise exception 'El nuevo reparto suma % pero el total cobrado es % — solo se puede corregir cómo se reparte, no el total', v_total_nuevo, v_total_actual;
  end if;

  update public.pagos set
    anulado = true, motivo_correccion = v_motivo,
    corregido_por = v_responsable, corregido_en = v_ahora
  where anulado = false
    and ((v_orden_id is not null and orden_id = v_orden_id)
      or (v_grupo_id is not null and venta_grupo_id = v_grupo_id));

  for v_pago in select value from jsonb_array_elements(p_pagos) as t(value)
  loop
    return query
    insert into public.pagos (
      orden_id, venta_grupo_id, metodo_pago, monto, referencia_pago, turno_id,
      es_correccion, motivo_correccion, corregido_por, corregido_en
    ) values (
      v_orden_id, v_grupo_id, v_pago->>'metodo', (v_pago->>'monto')::integer,
      nullif(trim(v_pago->>'referencia'), ''), v_turno_id,
      true, v_motivo, v_responsable, v_ahora
    )
    returning *;
  end loop;

  -- Refresca la etiqueta-resumen del cobro corregido.
  if (select count(distinct m) from unnest(v_metodos) m) = 1 then
    v_metodo_resumen := v_metodos[1];
  else
    v_metodo_resumen := 'mixto';
  end if;
  if v_orden_id is not null then
    update public.ordenes set metodo_pago = v_metodo_resumen where id = v_orden_id;
  else
    update public.ventas set metodo_pago = v_metodo_resumen where venta_grupo_id = v_grupo_id;
  end if;
end;
$$;

revoke execute on function public.corregir_pagos(jsonb, jsonb, text, text) from public, anon;
grant execute on function public.corregir_pagos(jsonb, jsonb, text, text) to authenticated;

-- Nota de advisor: cobrar_orden, registrar_venta_carrito y corregir_pagos quedan como WARN
-- "Signed-In Users Can Execute SECURITY DEFINER Function". Intencional, mismo criterio que 0032/
-- 0035 — son el camino que el frontend autenticado debe llamar y necesitan SECURITY DEFINER para
-- escribir en pagos/movimientos_inventario/ordenes; el candado es el chequeo de rol al entrar.
