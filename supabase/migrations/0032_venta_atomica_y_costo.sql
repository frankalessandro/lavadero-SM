-- Cierra los dos huecos conocidos de la venta de productos (agua, jugos, cerveza):
--
-- 1) ATOMICIDAD. `createVenta`/`anularVenta` hacían dos escrituras sueltas desde el cliente
--    (venta + movimiento de stock). Si la segunda fallaba, la venta quedaba cobrada sin
--    descontar inventario (o anulada sin reponerlo) y solo quedaba un mensaje de error pidiendo
--    revisión manual. Acá las dos escrituras se mueven a funciones plpgsql, que corren dentro de
--    una sola transacción: o quedan ambas o no queda ninguna.
--
-- 2) COSTO DE MERCANCÍA VENDIDA. La venta entraba al "Resultado del día" de /admin como ingreso
--    completo, sin restar lo que costó el producto. Ahora el movimiento de salida de cada venta
--    guarda `costo_unitario` = costo promedio ponderado de las entradas al momento de vender
--    (snapshot inmutable, mismo criterio que `ventas.precio_unitario` y `ordenes.precio`), y el
--    dashboard lo resta.
--
--    El snapshot vive en `movimientos_inventario`, no en `ventas`, a propósito: jefe_zona tiene
--    SELECT sobre `ventas` y no debe ver costos (CLAUDE.md §Roles). RLS es por fila, no por
--    columna, así que una columna de costo en `ventas` sería visible para ese rol. En
--    `movimientos_inventario` el candado ya existe — jefe_zona solo lee la vista
--    `movimientos_inventario_operativo`, que no expone `costo_unitario`.

-- Costo promedio ponderado de las entradas de un producto — misma fórmula que
-- `fetchStockProductos()` en src/data/movimientosInventario.ts, para que la valorización del
-- stock y el costo de lo vendido no se contradigan. Vive en `interno` (no en `public`) para que
-- PostgREST no la exponga como RPC, mismo criterio de 0017.
create or replace function interno.costo_promedio_producto(p_producto_id uuid)
returns integer
language sql stable security definer set search_path = public
as $$
  select coalesce(
    round(sum(cantidad::numeric * costo_unitario) / nullif(sum(cantidad), 0)),
    0
  )::integer
  from public.movimientos_inventario
  where producto_id = p_producto_id
    and tipo = 'entrada'
    and costo_unitario is not null;
$$;

revoke execute on function interno.costo_promedio_producto(uuid) from public, anon, authenticated;

-- Registro + cobro + descuento de stock, atómico. Reemplaza la secuencia insert-ventas →
-- insert-movimiento que hacía `createVenta` en el cliente; todas las validaciones que estaban en
-- el data layer se repiten acá porque este es el borde de confianza real (el cliente puede
-- llamar la RPC directo).
create or replace function public.registrar_venta(
  p_producto_id uuid,
  p_cantidad integer,
  p_metodo_pago text,
  p_referencia_pago text,
  p_vendido_por text
)
returns setof public.ventas
language plpgsql security definer set search_path = public
as $$
declare
  v_producto record;
  v_turno_id uuid;
  v_venta public.ventas;
  v_responsable text := nullif(trim(p_vendido_por), '');
  v_referencia text := nullif(trim(p_referencia_pago), '');
begin
  -- Mismo par de roles que las policies de `ventas` en 0029 (admin + jefe_zona; vigilante no).
  if not interno.es_activo() or interno.rol_actual() not in ('jefe_zona', 'admin') then
    raise exception 'No autorizado para registrar ventas';
  end if;
  if p_cantidad is null or p_cantidad <= 0 then
    raise exception 'La cantidad debe ser mayor a cero';
  end if;
  if p_metodo_pago not in ('efectivo', 'transferencia', 'datafono') then
    raise exception 'Método de pago inválido: %', p_metodo_pago;
  end if;
  if p_metodo_pago in ('transferencia', 'datafono') and v_referencia is null then
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

  -- Una venta se cobra en el acto, así que el turno se fija acá mismo (a diferencia de
  -- ordenes.turno_id, que se fija al cobrar). El índice único de 0007 garantiza que hay a lo
  -- sumo un turno abierto por rol, por eso el select no necesita desempate.
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

revoke execute on function public.registrar_venta(uuid, integer, text, text, text) from public, anon;
grant execute on function public.registrar_venta(uuid, integer, text, text, text) to authenticated;

-- Anulación + reposición de stock, atómico (regla de negocio 13: no se elimina, se anula con
-- motivo obligatorio y queda visible en reportes).
--
-- La entrada compensatoria va SIN `costo_unitario` a propósito: el costo promedio ponderado se
-- calcula solo sobre entradas con costo, así que dejarla nula devuelve el stock sin mover el
-- promedio. El costo de la venta anulada sigue guardado en su movimiento de salida, pero no se
-- cuenta como costo de mercancía vendida porque el reporte parte de las ventas activas.
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
  v_motivo text := nullif(trim(p_motivo), '');
  v_responsable text := nullif(trim(p_anulada_por), '');
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

  -- El filtro por estado hace la operación idempotente: anular dos veces no duplica el reverso
  -- de stock, falla explícito.
  update public.ventas set
    estado = 'anulada',
    motivo_anulacion = v_motivo,
    anulada_por = v_responsable,
    anulada_en = now()
  where id = p_venta_id and estado = 'activa'
  returning * into v_venta;

  if not found then
    raise exception 'La venta no existe o ya estaba anulada';
  end if;

  insert into public.movimientos_inventario (
    producto_id, tipo, cantidad, motivo, responsable, venta_id
  ) values (
    v_venta.producto_id, 'entrada', v_venta.cantidad,
    'Reverso por anulación de venta #' || v_venta.consecutivo, v_responsable, v_venta.id
  );

  return next v_venta;
end;
$$;

revoke execute on function public.anular_venta(uuid, text, text) from public, anon;
grant execute on function public.anular_venta(uuid, text, text) to authenticated;

-- Nota de advisor: las dos RPC quedan como WARN "Signed-In Users Can Execute SECURITY DEFINER
-- Function". Es intencional y no se puede evitar — son justamente el camino que el frontend
-- autenticado debe llamar, y necesitan SECURITY DEFINER para escribir en movimientos_inventario
-- (jefe_zona no tiene policy sobre la tabla base). El candado no es el grant sino el chequeo de
-- rol al inicio de cada función. Mismo criterio y mismo WARN que interno.rol_actual/es_admin/
-- es_activo desde 0017.
