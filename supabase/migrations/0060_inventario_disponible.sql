-- Inventario: stock disponible, validación al cargar (no al cobrar) y conteo sin vaivén.
--
-- Cuatro huecos encontrados revisando producción (2026-09-14), todos del cruce entre el stock y
-- las ventas `pendiente` (productos cargados a una orden o a una cuenta abierta, que todavía no
-- descuentan inventario):
--
--  1. El stock "disponible" no restaba lo comprometido. El mostrador (`registrar_venta_carrito`) y
--     el cargo a orden/cuenta validaban contra Σ movimientos, así que se podía vender la última
--     unidad que ya estaba cargada a un vehículo. Después `cobrar_orden`/`cerrar_cuenta`
--     BLOQUEABAN el cobro con "Stock insuficiente" — de algo que el cliente ya se tomó.
--     Decisión del negocio (Alessandro, 2026-09-14): se valida contra el DISPONIBLE al cargar o
--     vender; el cobro/cierre NUNCA se bloquea por stock. Si al cobrar el stock queda negativo, se
--     cobra igual y la alerta de stock negativo lo deja a la vista.
--
--  2. El conteo de apertura ajustaba contra `stock_sistema` (sin restar pendientes) y el de
--     cierre contra `stock − pendientes`. Con productos pendientes que cruzaban de un turno a
--     otro, cada apertura sacaba esas unidades del stock y cada cierre las volvía a meter
--     (Club Colombia 330: cierre +2 / apertura −2 / cierre +2; Coronita −7/+6 = sus pendientes).
--     Además la apertura mostraba "diferencia 0" mientras por debajo escribía el ajuste.
--     Ahora apertura y cierre usan el MISMO esperado (`stock − pendientes`) y el ajuste es
--     exactamente la diferencia que se muestra. El "cazar vacíos entre turnos" se conserva: el
--     cierre anterior dejó el sistema en su conteo físico, así que si nada se movió el esperado
--     de la apertura es ese mismo número; y si entre turnos entró una compra registrada, ahora sí
--     se refleja (antes aparecía como sobrante falso).
--
--  3. `corregir_orden` anulaba la orden vieja y el trigger de 0035/0036 anulaba sus productos
--     pendientes: la orden de reemplazo quedaba sin ellos y había que volver a cargarlos a mano
--     (pasó en las dos correcciones reales con productos). Ahora se trasladan a la orden nueva.
--     Decisión del negocio (Alessandro, 2026-09-14).
--
--  4. El stock se calculaba en el navegador bajando TODOS los movimientos, que Supabase corta en
--     1000 filas. `stock_productos()` / `stock_productos_operativo()` lo agregan en SQL.
--
-- Todo lo demás de las funciones redefinidas se conserva literal de su última versión
-- (registrar_venta 0041, registrar_venta_carrito 0036, cobrar_orden 0037, cerrar_cuenta 0041,
-- esperado_inventario/abrir_conteo_inventario 0048, corregir_orden 0046). Mismas firmas:
-- `create or replace` conserva grants.

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- Helpers
-- ─────────────────────────────────────────────────────────────────────────────────────────────

-- Stock físico del sistema: Σ movimientos (con signo).
create or replace function interno.stock_producto(p_producto_id uuid)
returns integer
language sql stable security definer set search_path = public
as $$
  select coalesce(sum(cantidad), 0)::integer
  from public.movimientos_inventario where producto_id = p_producto_id;
$$;

-- Unidades cargadas a órdenes/cuentas sin cobrar: ya salieron de la nevera, el stock aún no las
-- descontó.
create or replace function interno.comprometido_producto(p_producto_id uuid)
returns integer
language sql stable security definer set search_path = public
as $$
  select coalesce(sum(cantidad), 0)::integer
  from public.ventas where producto_id = p_producto_id and estado = 'pendiente';
$$;

revoke execute on function interno.stock_producto(uuid) from public, anon, authenticated;
revoke execute on function interno.comprometido_producto(uuid) from public, anon, authenticated;

-- Valida que haya disponible (stock − comprometido) para `p_cantidad` y bloquea la fila del
-- producto: dos ventas simultáneas de la última unidad se serializan en vez de pasar las dos.
create or replace function interno.exigir_disponible(p_producto_id uuid, p_cantidad integer)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_nombre text;
  v_disponible integer;
begin
  select nombre into v_nombre from public.productos where id = p_producto_id for update;
  v_disponible := interno.stock_producto(p_producto_id) - interno.comprometido_producto(p_producto_id);
  if v_disponible < p_cantidad then
    raise exception 'No hay suficiente "%": disponibles %, se piden %', v_nombre, greatest(v_disponible, 0), p_cantidad;
  end if;
end;
$$;

revoke execute on function interno.exigir_disponible(uuid, integer) from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- Lectura de stock agregada en SQL
-- ─────────────────────────────────────────────────────────────────────────────────────────────

-- Jefe de zona (y admin): sin costo. Una fila por producto, tenga o no movimientos.
create or replace function public.stock_productos_operativo()
returns table (producto_id uuid, stock integer, comprometido integer, disponible integer)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not interno.es_activo() or interno.rol_actual() not in ('jefe_zona', 'admin') then
    raise exception 'No autorizado';
  end if;
  return query
    with mov as (
      select m.producto_id, sum(m.cantidad)::integer as stock
      from movimientos_inventario m group by m.producto_id
    ), pend as (
      select v.producto_id, sum(v.cantidad)::integer as comprometido
      from ventas v where v.estado = 'pendiente' group by v.producto_id
    )
    select p.id,
      coalesce(mov.stock, 0),
      coalesce(pend.comprometido, 0),
      coalesce(mov.stock, 0) - coalesce(pend.comprometido, 0)
    from productos p
    left join mov on mov.producto_id = p.id
    left join pend on pend.producto_id = p.id;
end;
$$;

-- Admin: además costo promedio (con el fallback a `productos.costo` de 0033, el mismo que usa el
-- snapshot de costo de las ventas — antes la valorización en JS no tenía ese fallback y un
-- producto cargado solo por ajustes se valorizaba en $0) y valorización del stock físico.
create or replace function public.stock_productos()
returns table (
  producto_id uuid, stock integer, comprometido integer, disponible integer,
  costo_promedio integer, valorizacion integer
)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not interno.es_activo() or not interno.es_admin() then
    raise exception 'No autorizado';
  end if;
  return query
    select s.producto_id, s.stock, s.comprometido, s.disponible,
      interno.costo_promedio_producto(s.producto_id),
      s.stock * interno.costo_promedio_producto(s.producto_id)
    from public.stock_productos_operativo() s;
end;
$$;

revoke execute on function public.stock_productos_operativo() from public, anon;
revoke execute on function public.stock_productos() from public, anon;
grant execute on function public.stock_productos_operativo() to authenticated;
grant execute on function public.stock_productos() to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- registrar_venta (0041): valida disponible en los dos caminos (pendiente y venta aparte)
-- ─────────────────────────────────────────────────────────────────────────────────────────────

create or replace function public.registrar_venta(
  p_producto_id uuid,
  p_cantidad integer,
  p_metodo_pago text,
  p_referencia_pago text,
  p_vendido_por text,
  p_orden_id uuid default null,
  p_cuenta_id uuid default null
)
returns setof public.ventas
language plpgsql security definer set search_path = public
as $$
declare
  v_producto record;
  v_turno_id uuid;
  v_venta public.ventas;
  v_orden record;
  v_cuenta record;
  v_responsable text := nullif(trim(p_vendido_por), '');
  v_referencia text := nullif(trim(p_referencia_pago), '');
  v_es_pendiente boolean := p_orden_id is not null or p_cuenta_id is not null;
begin
  if not interno.es_activo() or interno.rol_actual() not in ('jefe_zona', 'admin') then
    raise exception 'No autorizado para registrar ventas';
  end if;
  if p_orden_id is not null and p_cuenta_id is not null then
    raise exception 'Una venta pendiente solo puede ir a una orden o a una cuenta, no ambas';
  end if;
  if p_cantidad is null or p_cantidad <= 0 then
    raise exception 'La cantidad debe ser mayor a cero';
  end if;
  if p_metodo_pago not in ('efectivo', 'transferencia', 'datafono') then
    raise exception 'Método de pago inválido: %', p_metodo_pago;
  end if;
  if not v_es_pendiente
     and p_metodo_pago in ('transferencia', 'datafono') and v_referencia is null then
    raise exception 'La referencia es obligatoria en pagos por transferencia o datáfono';
  end if;
  if v_responsable is null then
    raise exception 'El responsable de la venta es obligatorio';
  end if;

  select nombre, activo, precio_venta into v_producto
  from public.productos where id = p_producto_id;
  if not found then
    raise exception 'El producto seleccionado no existe';
  end if;
  if not v_producto.activo then
    raise exception 'El producto "%" está inactivo — actívalo desde /admin/dinero/inventario antes de venderlo.', v_producto.nombre;
  end if;
  if v_producto.precio_venta is null then
    raise exception 'El producto "%" no tiene precio de venta configurado — defínelo desde /admin/dinero/inventario.', v_producto.nombre;
  end if;

  if p_orden_id is not null then
    select id, estado into v_orden from public.ordenes where id = p_orden_id;
    if not found then
      raise exception 'La orden asociada no existe';
    end if;
    if v_orden.estado not in ('en_proceso', 'listo') then
      raise exception 'Solo se pueden agregar productos a una orden en proceso o lista para cobrar (estado actual: %)', v_orden.estado;
    end if;
  elsif p_cuenta_id is not null then
    select id, estado into v_cuenta from public.cuentas where id = p_cuenta_id;
    if not found then
      raise exception 'La cuenta asociada no existe';
    end if;
    if v_cuenta.estado <> 'abierta' then
      raise exception 'La cuenta ya está % — no se le pueden agregar más productos', v_cuenta.estado;
    end if;
  end if;

  -- Nuevo (0060): el control de existencias vive acá, al cargar o vender — no al cobrar.
  perform interno.exigir_disponible(p_producto_id, p_cantidad);

  if v_es_pendiente then
    insert into public.ventas (
      producto_id, cantidad, precio_unitario, total, metodo_pago, referencia_pago,
      turno_id, vendido_por, estado, orden_id, cuenta_id
    ) values (
      p_producto_id, p_cantidad, v_producto.precio_venta, v_producto.precio_venta * p_cantidad,
      p_metodo_pago, null, null, v_responsable, 'pendiente', p_orden_id, p_cuenta_id
    )
    returning * into v_venta;

    return next v_venta;
    return;
  end if;

  select id into v_turno_id from public.turnos_caja where rol = 'jefe_zona' and not cerrado;
  if v_turno_id is null then
    raise exception 'No hay turno de caja abierto — ábrelo antes de registrar ventas.';
  end if;

  insert into public.ventas (
    producto_id, cantidad, precio_unitario, total, metodo_pago, referencia_pago, turno_id, vendido_por
  ) values (
    p_producto_id, p_cantidad, v_producto.precio_venta, v_producto.precio_venta * p_cantidad,
    p_metodo_pago, v_referencia, v_turno_id, v_responsable
  )
  returning * into v_venta;

  insert into public.movimientos_inventario (
    producto_id, tipo, cantidad, costo_unitario, motivo, responsable, venta_id
  ) values (
    p_producto_id, 'salida', -p_cantidad, interno.costo_promedio_producto(p_producto_id),
    'Venta #' || v_venta.consecutivo, v_responsable, v_venta.id
  );

  return next v_venta;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- registrar_venta_carrito (0036): valida disponible, no stock bruto
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- Cada ítem inserta su salida antes de validar el siguiente, así que un mismo producto repetido
-- en dos líneas del carrito se valida acumulado.

create or replace function public.registrar_venta_carrito(
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

    perform interno.exigir_disponible((v_item->>'producto_id')::uuid, v_cantidad);

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

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- cobrar_orden (0037): sin bloqueo por stock
-- ─────────────────────────────────────────────────────────────────────────────────────────────

create or replace function public.cobrar_orden(
  p_orden_id uuid,
  p_pagos jsonb,
  p_descuento integer default 0,
  p_descuento_pct numeric default null,
  p_descuento_motivo text default null,
  p_descuento_autorizado_por text default null
)
returns setof public.ordenes
language plpgsql security definer set search_path = public
as $$
declare
  v_orden public.ordenes;
  v_turno_id uuid;
  v_pendiente record;
  v_hay_pendientes boolean;
  v_total_pendientes integer;
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
  v_descuento integer := greatest(coalesce(p_descuento, 0), 0);
  v_desc_motivo text := nullif(trim(p_descuento_motivo), '');
  v_desc_autoriza text := nullif(trim(p_descuento_autorizado_por), '');
begin
  if not interno.es_activo() or interno.rol_actual() not in ('jefe_zona', 'admin') then
    raise exception 'No autorizado para cobrar órdenes';
  end if;
  if p_pagos is null or jsonb_typeof(p_pagos) <> 'array' then
    raise exception 'Se requiere el detalle de pago (puede ir vacío solo si el total queda en $0)';
  end if;

  select * into v_orden from public.ordenes where id = p_orden_id for update;
  if not found then
    raise exception 'La orden no existe';
  end if;
  if v_orden.estado not in ('en_proceso', 'listo') then
    raise exception 'La orden ya fue % — no se puede cobrar de nuevo', v_orden.estado;
  end if;

  if v_descuento > v_orden.precio then
    raise exception 'El descuento (%) no puede superar el precio del lavado (%)', v_descuento, v_orden.precio;
  end if;
  if v_descuento > 0 and (v_desc_motivo is null or v_desc_autoriza is null) then
    raise exception 'El descuento exige un motivo y quién lo autoriza';
  end if;

  select
    exists (select 1 from public.ventas where orden_id = p_orden_id and estado = 'pendiente'),
    coalesce((select sum(total) from public.ventas where orden_id = p_orden_id and estado = 'pendiente'), 0)
  into v_hay_pendientes, v_total_pendientes;
  v_total_a_cobrar := (v_orden.precio - v_descuento) + v_total_pendientes;

  v_n_lineas := jsonb_array_length(p_pagos);
  if v_total_a_cobrar = 0 then
    if v_n_lineas <> 0 then
      raise exception 'El total quedó en $0 (cortesía) — no debe haber líneas de pago';
    end if;
  elsif v_n_lineas < 1 or v_n_lineas > 3 then
    raise exception 'El cobro admite entre 1 y 3 líneas de pago (recibidas: %)', v_n_lineas;
  end if;

  if v_total_a_cobrar > 0 then
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
  end if;

  select id into v_turno_id from public.turnos_caja where rol = 'jefe_zona' and not cerrado;
  if v_turno_id is null and v_hay_pendientes then
    raise exception 'No hay turno de caja abierto — ábrelo antes de cobrar productos cargados a la orden.';
  end if;

  v_espera_segundos := greatest(
    0, extract(epoch from (now() - coalesce(v_orden.lista_en, v_orden.creado_en)))::integer
  );

  if array_length(v_metodos, 1) is null then
    v_metodo_resumen := null;
    v_ref_resumen := null;
  elsif (select count(distinct m) from unnest(v_metodos) m) = 1 then
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
    descuento = v_descuento,
    descuento_pct = case when v_descuento > 0 then p_descuento_pct else null end,
    descuento_motivo = case when v_descuento > 0 then v_desc_motivo else null end,
    descuento_autorizado_por = case when v_descuento > 0 then v_desc_autoriza else null end,
    entregada_en = now(),
    tiempo_espera_entrega_segundos = v_espera_segundos,
    turno_id = v_turno_id
  where id = p_orden_id
  returning * into v_orden;

  if v_total_a_cobrar > 0 then
    for v_pago in select value from jsonb_array_elements(p_pagos) as t(value)
    loop
      insert into public.pagos (orden_id, metodo_pago, monto, referencia_pago, turno_id)
      values (
        p_orden_id, v_pago->>'metodo', (v_pago->>'monto')::integer,
        nullif(trim(v_pago->>'referencia'), ''), v_turno_id
      );
    end loop;
  end if;

  -- 0060: sin chequeo de stock. La existencia se validó al cargar el producto; si el stock queda
  -- negativo, lo muestra la alerta de stock negativo, pero el cobro de lo consumido no se frena.
  for v_pendiente in
    select * from public.ventas where orden_id = p_orden_id and estado = 'pendiente' for update
  loop
    update public.ventas set
      estado = 'activa',
      metodo_pago = coalesce(v_metodo_resumen, 'efectivo'),
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

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- cerrar_cuenta (0041): sin bloqueo por stock
-- ─────────────────────────────────────────────────────────────────────────────────────────────

create or replace function public.cerrar_cuenta(
  p_cuenta_id uuid,
  p_pagos jsonb,
  p_cerrada_por text
)
returns setof public.cuentas
language plpgsql security definer set search_path = public
as $$
declare
  v_cuenta public.cuentas;
  v_turno_id uuid;
  v_responsable text := nullif(trim(p_cerrada_por), '');
  v_pendiente record;
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
    raise exception 'No autorizado para cerrar cuentas';
  end if;
  if v_responsable is null then
    raise exception 'Indica quién cierra la cuenta';
  end if;

  select * into v_cuenta from public.cuentas where id = p_cuenta_id for update;
  if not found then
    raise exception 'La cuenta no existe';
  end if;
  if v_cuenta.estado <> 'abierta' then
    raise exception 'La cuenta ya está % — no se puede cerrar de nuevo', v_cuenta.estado;
  end if;

  select coalesce(sum(total), 0) into v_total_a_cobrar
  from public.ventas where cuenta_id = p_cuenta_id and estado = 'pendiente';
  if v_total_a_cobrar <= 0 then
    raise exception 'La cuenta no tiene productos pendientes — usa "Anular cuenta" si no se va a cobrar nada';
  end if;

  if p_pagos is null or jsonb_typeof(p_pagos) <> 'array' then
    raise exception 'Se requiere al menos una línea de pago';
  end if;
  v_n_lineas := jsonb_array_length(p_pagos);
  if v_n_lineas < 1 or v_n_lineas > 3 then
    raise exception 'El cobro admite entre 1 y 3 líneas de pago (recibidas: %)', v_n_lineas;
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

  if v_total_pagos <> v_total_a_cobrar then
    raise exception 'Las líneas de pago suman % pero el total a cobrar es %', v_total_pagos, v_total_a_cobrar;
  end if;

  select id into v_turno_id from public.turnos_caja where rol = 'jefe_zona' and not cerrado;
  if v_turno_id is null then
    raise exception 'No hay turno de caja abierto — ábrelo antes de cerrar la cuenta.';
  end if;

  if (select count(distinct m) from unnest(v_metodos) m) = 1 then
    v_metodo_resumen := v_metodos[1];
    v_ref_resumen := nullif(trim(p_pagos->0->>'referencia'), '');
  else
    v_metodo_resumen := 'mixto';
    v_ref_resumen := null;
  end if;

  update public.cuentas set
    estado = 'cerrada',
    cerrada_en = now(),
    cerrada_por = v_responsable,
    turno_id = v_turno_id
  where id = p_cuenta_id
  returning * into v_cuenta;

  for v_pago in select value from jsonb_array_elements(p_pagos) as t(value)
  loop
    insert into public.pagos (cuenta_id, metodo_pago, monto, referencia_pago, turno_id)
    values (
      p_cuenta_id, v_pago->>'metodo', (v_pago->>'monto')::integer,
      nullif(trim(v_pago->>'referencia'), ''), v_turno_id
    );
  end loop;

  -- 0060: sin chequeo de stock (ver cobrar_orden).
  for v_pendiente in
    select * from public.ventas where cuenta_id = p_cuenta_id and estado = 'pendiente' for update
  loop
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
      'Venta #' || v_pendiente.consecutivo || ' (cuenta: ' || v_cuenta.titular || ')',
      v_responsable,
      v_pendiente.id
    );
  end loop;

  return next v_cuenta;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- Conteo: apertura y cierre con el mismo esperado
-- ─────────────────────────────────────────────────────────────────────────────────────────────

create or replace function interno.esperado_inventario(p_turno_id uuid, p_momento text)
returns table (
  producto_id uuid,
  nombre text,
  unidad_medida text,
  esperado integer,
  stock_sistema integer,
  en_cuentas_pendientes integer
)
language sql stable security definer set search_path = public
as $$
  -- `p_turno_id`/`p_momento` se conservan en la firma (la usan las RPC de 0048), pero desde 0060
  -- el esperado es el mismo en apertura y cierre: lo que el sistema dice que hay en la nevera.
  select
    pr.id,
    pr.nombre,
    pr.unidad_medida,
    interno.stock_producto(pr.id) - interno.comprometido_producto(pr.id),
    interno.stock_producto(pr.id),
    interno.comprometido_producto(pr.id)
  from productos pr
  where pr.activo and pr.precio_venta is not null
  order by pr.nombre;
$$;

create or replace function public.abrir_conteo_inventario(
  p_turno_id uuid,
  p_lineas jsonb,
  p_justificacion text
)
returns setof public.conteos_inventario
language plpgsql security definer set search_path = public
as $$
declare
  v_turno turnos_caja;
  v_conteo conteos_inventario;
  v_justif text := nullif(trim(p_justificacion), '');
  v_prod record;
  v_contado integer;
  v_diff integer;
  v_mov_id uuid;
  v_hay_diferencia boolean := false;
begin
  if not interno.es_activo() or interno.rol_actual() not in ('jefe_zona', 'admin') then
    raise exception 'No autorizado para registrar el conteo de inventario';
  end if;
  if p_lineas is null or jsonb_typeof(p_lineas) <> 'array' then
    raise exception 'Se requiere el conteo de cada producto';
  end if;

  select * into v_turno from turnos_caja where id = p_turno_id for update;
  if not found then raise exception 'El turno no existe'; end if;
  if v_turno.rol <> 'jefe_zona' then raise exception 'El conteo de inventario es solo del turno de jefe de zona'; end if;
  if v_turno.cerrado then raise exception 'El turno ya está cerrado'; end if;
  if exists (select 1 from conteos_inventario where turno_id = p_turno_id and momento = 'apertura') then
    raise exception 'Este turno ya tiene conteo de apertura';
  end if;

  for v_prod in select * from interno.esperado_inventario(p_turno_id, 'apertura')
  loop
    v_contado := (
      select (l->>'contado')::int
      from jsonb_array_elements(p_lineas) l
      where (l->>'producto_id')::uuid = v_prod.producto_id
    );
    if v_contado is null then
      raise exception 'Falta contar: %', v_prod.nombre;
    end if;
    if v_contado <> v_prod.esperado then v_hay_diferencia := true; end if;
  end loop;

  if v_hay_diferencia and v_justif is null then
    raise exception 'Hay diferencias en el conteo — la justificación es obligatoria';
  end if;

  insert into conteos_inventario (turno_id, momento, contado_por, contado_por_persona_id, justificacion)
  values (p_turno_id, 'apertura', v_turno.responsable_actual, v_turno.responsable_actual_persona_id, v_justif)
  returning * into v_conteo;

  for v_prod in select * from interno.esperado_inventario(p_turno_id, 'apertura')
  loop
    v_contado := (
      select (l->>'contado')::int
      from jsonb_array_elements(p_lineas) l
      where (l->>'producto_id')::uuid = v_prod.producto_id
    );
    -- 0060: el ajuste ES la diferencia mostrada (antes era `contado − stock_sistema`, que ignoraba
    -- los pendientes y producía el vaivén apertura/cierre).
    v_diff := v_contado - v_prod.esperado;
    v_mov_id := null;

    if v_diff <> 0 then
      insert into movimientos_inventario (producto_id, tipo, cantidad, motivo, responsable)
      values (
        v_prod.producto_id, 'ajuste', v_diff,
        'Conteo de apertura' || coalesce(' — ' || v_justif, ''),
        v_turno.responsable_actual
      )
      returning id into v_mov_id;
    end if;

    insert into conteos_inventario_lineas (
      conteo_id, producto_id, esperado, contado, en_cuentas_pendientes,
      diferencia, valor_diferencia, ajuste_movimiento_id, estado_faltante
    ) values (
      v_conteo.id, v_prod.producto_id, v_prod.esperado, v_contado, v_prod.en_cuentas_pendientes,
      v_diff, 0, v_mov_id, 'ninguno'
    );
  end loop;

  return next v_conteo;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- corregir_orden (0046): traslada los productos pendientes a la orden de reemplazo
-- ─────────────────────────────────────────────────────────────────────────────────────────────

create or replace function public.corregir_orden(
  p_orden_anterior uuid,
  p_orden_nueva uuid,
  p_motivo text,
  p_corregida_por text
)
returns setof public.ordenes
language plpgsql security definer set search_path = public
as $$
declare
  v_anterior public.ordenes;
  v_nueva public.ordenes;
  v_motivo text := nullif(trim(p_motivo), '');
  v_por text := nullif(trim(p_corregida_por), '');
begin
  if not interno.es_activo() or interno.rol_actual() not in ('jefe_zona', 'admin') then
    raise exception 'No autorizado para corregir órdenes';
  end if;
  if v_motivo is null or length(v_motivo) < 3 then
    raise exception 'El motivo de la corrección es obligatorio (mínimo 3 caracteres)';
  end if;
  if v_por is null then
    raise exception 'Indica quién hace la corrección';
  end if;
  if p_orden_anterior = p_orden_nueva then
    raise exception 'Una orden no se puede corregir a sí misma';
  end if;

  select * into v_anterior from public.ordenes where id = p_orden_anterior for update;
  if not found then raise exception 'La orden que se corrige no existe'; end if;

  select * into v_nueva from public.ordenes where id = p_orden_nueva for update;
  if not found then raise exception 'La orden de reemplazo no existe'; end if;

  if v_anterior.estado = 'anulada' and v_nueva.corrige_a_orden_id = p_orden_anterior then
    return next v_nueva;
    return;
  end if;

  if v_anterior.estado = 'anulada' then
    raise exception 'La orden #% ya estaba anulada por otro motivo: %',
      v_anterior.consecutivo, coalesce(v_anterior.motivo_anulacion, 'sin motivo');
  end if;
  if v_nueva.estado = 'anulada' then
    raise exception 'La orden de reemplazo #% está anulada', v_nueva.consecutivo;
  end if;
  if v_nueva.corrige_a_orden_id is not null then
    raise exception 'La orden #% ya es el reemplazo de otra orden', v_nueva.consecutivo;
  end if;

  -- 0060: los productos cargados y sin cobrar siguen con el vehículo. Se mueven ANTES de anular,
  -- porque el trigger `ordenes_anulada_anula_ventas_pendientes` anula los que queden en la vieja.
  if exists (select 1 from public.ventas where orden_id = p_orden_anterior and estado = 'pendiente') then
    if v_nueva.estado not in ('en_proceso', 'listo') then
      raise exception 'La orden de reemplazo #% ya fue cobrada — no se le pueden pasar los productos pendientes', v_nueva.consecutivo;
    end if;
    update public.ventas set orden_id = p_orden_nueva
    where orden_id = p_orden_anterior and estado = 'pendiente';
  end if;

  update public.ordenes set corrige_a_orden_id = p_orden_anterior
  where id = p_orden_nueva
  returning * into v_nueva;

  update public.ordenes set
    estado = 'anulada',
    motivo_anulacion = v_motivo || ' (reemplazada por #' || v_nueva.consecutivo || ')',
    anulada_por = v_por,
    anulada_en = now()
  where id = p_orden_anterior;

  return next v_nueva;
end;
$$;

-- Nota de advisor: `stock_productos` y `stock_productos_operativo` salen como WARN "Signed-In
-- Users Can Execute SECURITY DEFINER Function" — intencional, mismo criterio que 0032/0036/0048:
-- suman `movimientos_inventario` (admin-only) y el candado es el chequeo de rol al entrar.
