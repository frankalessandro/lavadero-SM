-- Margarita Mayonesa y Tomate: la compra anterior (28-sep) eran las chicas; la factura FV-4007-3430576
-- trajo las grandes de 105 g, y las chicas ya se vendieron/ajustaron por completo, así que el
-- producto pasa a representar la grande (mismo producto, sin mover movimientos).
--
-- Costo CON IVA (decisión de gerencia, ver 0087). Las 3 entradas viejas a 1.983 se dejan sin costo para
-- que no arrastren el costo promedio ponderado (`interno.costo_promedio_producto`); las ventas de las
-- chicas conservan su propio snapshot de costo y no cambian.
-- Precios de venta definidos por gerencia: Mayonesa/Tomate 7.000, Pollo BBQ/Pimienta Limón 8.000.

do $$
declare n integer;
begin
  update public.productos set nombre = 'Margarita Mayonesa Grande 105g', costo = 5932, precio_venta = 7000
  where nombre in ('Margarita Mayonea', 'Margarita Mayonesa Grande 105g');
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'Se esperaba 1 producto Margarita Mayonesa y se encontraron %', n; end if;

  update public.productos set nombre = 'Margarita Tomate Grande 105g', costo = 5932, precio_venta = 7000
  where nombre in ('Margarita Tomate', 'Margarita Tomate Grande 105g');
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'Se esperaba 1 producto Margarita Tomate y se encontraron %', n; end if;

  update public.productos set costo = 6610, precio_venta = 8000
  where nombre in ('Margarita Pollo BBQ', 'Margarita  PimientaLimon');
  get diagnostics n = row_count;
  if n <> 2 then raise exception 'Se esperaban 2 productos premium y se encontraron %', n; end if;

  update public.movimientos_inventario m set costo_unitario = null
  from public.productos p
  where p.id = m.producto_id and p.nombre in ('Margarita Mayonesa Grande 105g', 'Margarita Tomate Grande 105g')
    and m.tipo = 'entrada' and m.costo_unitario = 1983
    and m.creado_en < timestamp '2026-10-17' at time zone 'America/Bogota';
  get diagnostics n = row_count;
  if n not in (0, 2) then raise exception 'Se esperaban 2 entradas viejas a 1.983 y se encontraron %', n; end if;
end $$;
