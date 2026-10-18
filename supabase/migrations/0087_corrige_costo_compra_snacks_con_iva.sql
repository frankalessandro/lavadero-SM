-- Corrección de costo de la factura FV-4007-3430576 (Comercializadora Nacional, 16-oct-2026).
--
-- Los snacks de esa factura se ingresaron el 17-oct al valor ANTES de IVA (2.898 / 4.985 / 5.555) y
-- parte se ingresó dos veces (compra #6 + entradas sueltas). Decisión de gerencia: el costo del
-- negocio se cuenta CON IVA (3.449 / 5.932 / 6.610, el precio unitario que muestra el pedido del
-- proveedor). `interno.costo_promedio_producto` promedia todas las `entrada` con costo, así que
-- las entradas a costo sin IVA bajaban el promedio de cada producto (p. ej. Choclitos a 3.098).
--
-- Solo cambia `costo_unitario` (y el total de la compra); no toca cantidades ni stock. Idempotente:
-- cada UPDATE filtra por el costo viejo, así que re-ejecutarla no cambia nada.
-- La entrada de 3 × Margarita Pollo Bolsaza a 5.555 fue un error de producto (se reversó con una
-- salida y se reingresó en Pollo BBQ): se le quita el costo para que no pese en el promedio.

do $$
declare
  v_compra uuid;
  v_ayer_desde timestamptz := timestamp '2026-10-17' at time zone 'America/Bogota';
  v_ayer_hasta timestamptz := timestamp '2026-10-18' at time zone 'America/Bogota';
  n integer;
begin
  select id into v_compra from public.compras where consecutivo = 6 and numero_factura = 'FV-4007-3430576';
  if v_compra is null then raise exception 'No existe la compra #6 de la factura FV-4007-3430576'; end if;

  -- 1. Compra #6: líneas y total.
  update public.compras_items set costo_unitario = 3449
  where compra_id = v_compra and costo_unitario = 2898;
  update public.compras set total = (select sum(cantidad * costo_unitario) from public.compras_items where compra_id = v_compra)
  where id = v_compra;

  -- 2. Entradas de la compra #6 y las reingresadas a mano por Laura Montealegre (a 2.898).
  update public.movimientos_inventario set costo_unitario = 3449
  where tipo = 'entrada' and costo_unitario = 2898
    and creado_en >= v_ayer_desde and creado_en < v_ayer_hasta
    and (compra_id = v_compra or (compra_id is null and responsable = 'Laura Montealegre'));
  get diagnostics n = row_count;
  if n not in (0, 12) then raise exception 'Se esperaban 12 entradas a 2.898 y se encontraron %', n; end if;

  -- 3. Las 4 Margarita grandes que vienen en la misma factura, con IVA.
  update public.movimientos_inventario m set costo_unitario = 5932
  from public.productos p
  where p.id = m.producto_id and p.nombre in ('Margarita Mayonea', 'Margarita Tomate')
    and m.tipo = 'entrada' and m.costo_unitario = 4985
    and m.creado_en >= v_ayer_desde and m.creado_en < v_ayer_hasta;
  get diagnostics n = row_count;
  if n not in (0, 2) then raise exception 'Se esperaban 2 entradas a 4.985 y se encontraron %', n; end if;

  update public.movimientos_inventario m set costo_unitario = 6610
  from public.productos p
  where p.id = m.producto_id and p.nombre in ('Margarita Pollo BBQ', 'Margarita  PimientaLimon')
    and m.tipo = 'entrada' and m.costo_unitario = 5555
    and m.creado_en >= v_ayer_desde and m.creado_en < v_ayer_hasta;
  get diagnostics n = row_count;
  if n not in (0, 2) then raise exception 'Se esperaban 2 entradas a 5.555 y se encontraron %', n; end if;

  -- 4. Entrada equivocada en Margarita Pollo Bolsaza (ya reversada con una salida): fuera del promedio.
  update public.movimientos_inventario m set costo_unitario = null
  from public.productos p
  where p.id = m.producto_id and p.nombre = 'Margarita Pollo Bolsaza'
    and m.tipo = 'entrada' and m.costo_unitario = 5555
    and m.creado_en >= v_ayer_desde and m.creado_en < v_ayer_hasta;
  get diagnostics n = row_count;
  if n not in (0, 1) then raise exception 'Se esperaba 1 entrada equivocada a 5.555 y se encontraron %', n; end if;
end $$;
