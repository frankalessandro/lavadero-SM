-- Costo oficial del producto (precio de compra de referencia). Hasta ahora el costo solo vivía
-- en las entradas de movimientos_inventario (costo promedio ponderado); esto agrega un costo
-- fijo por producto para ver el margen de cada uno sin depender de que exista una entrada, y
-- como fallback del costo de mercancía vendida cuando el producto todavía no tiene entradas con
-- costo capturado (decisión "costo oficial del producto" confirmada con el negocio).
--
-- `costo` es dato sensible: jefe de zona no debe verlo (CLAUDE.md §Roles). Como RLS es por fila
-- y no por columna, el candado real es la vista productos_operativo (0034) — el frontend de
-- jefe_zona lee esa vista, no la tabla base.
alter table productos add column costo integer check (costo is null or costo >= 0);

-- costo_promedio_producto ahora cae a `productos.costo` cuando no hay ninguna entrada con costo.
-- Así el snapshot que registrar_venta guarda en el movimiento de salida (y por lo tanto el
-- "Resultado del día" de /admin) refleja el costo oficial desde la primera venta, sin esperar a
-- que se registre una compra. Si ya hay entradas con costo, sigue mandando el promedio ponderado
-- (misma fórmula que fetchStockProductos, para no contradecir la valorización del stock).
create or replace function interno.costo_promedio_producto(p_producto_id uuid)
returns integer
language sql stable security definer set search_path = public
as $$
  select coalesce(
    (
      select round(sum(cantidad::numeric * costo_unitario) / nullif(sum(cantidad), 0))
      from public.movimientos_inventario
      where producto_id = p_producto_id
        and tipo = 'entrada'
        and costo_unitario is not null
    ),
    (select costo from public.productos where id = p_producto_id),
    0
  )::integer;
$$;

revoke execute on function interno.costo_promedio_producto(uuid) from public, anon, authenticated;
