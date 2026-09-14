-- Fecha real de cobro para las ventas — no la fecha de cuándo se cargó el carrito/orden/cuenta.
--
-- Fase 2 del análisis de inventario (2026-09-14). rentabilidad.ts y el dashboard fechaban el
-- ingreso de una venta por `creado_en`, pero un producto cargado a una orden o a una cuenta
-- abierta se registra `pendiente` cuando se mete al carrito y solo se COBRA cuando se entrega la
-- orden o se cierra la cuenta — que puede ser al día siguiente si el vehículo se queda toda la
-- noche. Mismo problema estructural que las 6 órdenes huérfanas de 0061 ("fecha de que se hizo
-- algo" ≠ "fecha de que entró la plata"), esta vez del lado de los productos: el ingreso caía en
-- el día en que se cargó el producto, no en el día en que de verdad se cobró.
--
-- `cobrada_en` = el momento real de cobro. Para una venta aparte o un carrito de mostrador es
-- inmediato (igual a `creado_en`, se cobra en el acto). Para un producto cargado a una orden o
-- cuenta es cuándo esa orden se entrega o esa cuenta se cierra. NULL mientras la venta sigue
-- `pendiente` — todavía no ha entrado ni un peso por ella.
--
-- `fetchVentasHoy`/`fetchVentasEnRango` (src/data/ventas.ts) pasan a filtrar por esta columna en
-- vez de `creado_en`; rentabilidad.ts fecha cada venta por `cobradaEn` (con `creadoEn` como
-- resguardo solo para una fila vieja que el backfill no pudiera resolver). El arqueo de caja
-- (`pagos`) no se toca — ya fechaba correctamente porque cada `pagos` se inserta en el momento
-- real del cobro, nunca antes.

alter table public.ventas add column cobrada_en timestamptz;

-- Backfill: `turno_id is not null` es la señal de "esta venta llegó a cobrarse en algún momento"
-- — lo fija `registrar_venta`/`registrar_venta_carrito` al insertar (camino inmediato) y
-- `cobrar_orden`/`cerrar_cuenta` al pasar una `pendiente` a `activa`. Cubre tanto las `activa`
-- vigentes como una `anulada` que ya había sido cobrada antes de anularse (anular_venta no borra
-- `turno_id`) — para esas el reverso de stock ya las excluye de cualquier suma de ingresos, pero
-- conviene que su fecha también quede correcta si algún reporte las lista.
update public.ventas v set cobrada_en = coalesce(
  (select o.entregada_en from public.ordenes o where o.id = v.orden_id),
  (select c.cerrada_en from public.cuentas c where c.id = v.cuenta_id),
  v.creado_en
)
where v.turno_id is not null;

create index ventas_cobrada_en_idx on public.ventas (cobrada_en) where cobrada_en is not null;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- registrar_venta: cobrada_en = now() en el camino de cobro inmediato (venta aparte, sin
-- orden_id/cuenta_id). El camino `pendiente` no cambia — cobrada_en queda NULL hasta que se cobre.
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
    producto_id, cantidad, precio_unitario, total, metodo_pago, referencia_pago, turno_id, vendido_por, cobrada_en
  ) values (
    p_producto_id, p_cantidad, v_producto.precio_venta, v_producto.precio_venta * p_cantidad,
    p_metodo_pago, v_referencia, v_turno_id, v_responsable, now()
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
-- registrar_venta_carrito: cobrada_en = now() (mostrador, cobro inmediato).
-- ─────────────────────────────────────────────────────────────────────────────────────────────

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
      turno_id, vendido_por, estado, venta_grupo_id, cobrada_en
    ) values (
      (v_item->>'producto_id')::uuid, v_cantidad, v_producto.precio_venta,
      v_producto.precio_venta * v_cantidad, v_metodo_resumen, v_ref_resumen,
      v_turno_id, v_responsable, 'activa', v_grupo, now()
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
-- cobrar_orden: al pasar cada venta pendiente de la orden a 'activa', fija cobrada_en = now().
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

  for v_pendiente in
    select * from public.ventas where orden_id = p_orden_id and estado = 'pendiente' for update
  loop
    update public.ventas set
      estado = 'activa',
      metodo_pago = coalesce(v_metodo_resumen, 'efectivo'),
      referencia_pago = v_ref_resumen,
      turno_id = v_turno_id,
      cobrada_en = now()
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
-- cerrar_cuenta: mismo criterio — cobrada_en = now() al activar cada pendiente.
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

  for v_pendiente in
    select * from public.ventas where cuenta_id = p_cuenta_id and estado = 'pendiente' for update
  loop
    update public.ventas set
      estado = 'activa',
      metodo_pago = v_metodo_resumen,
      referencia_pago = v_ref_resumen,
      turno_id = v_turno_id,
      cobrada_en = now()
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
