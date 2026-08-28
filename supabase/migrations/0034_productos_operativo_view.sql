-- productos.costo (0033) es dato sensible: jefe_zona no debe ver costos (CLAUDE.md §Roles) y RLS
-- es por fila, no por columna. jefe_zona ya tenía SELECT sobre `productos` para leer precio_venta
-- al vender; esta vista le da las mismas filas sin la columna `costo`. Mismo patrón que
-- movimientos_inventario_operativo (0029), pero con security_invoker = true para que las policies
-- de la tabla base sigan aplicando por fila (admin + jefe_zona sí, vigilante no) — la vista solo
-- recorta la columna, no cambia quién ve qué filas.
--
-- El frontend de jefe_zona (/jefe-zona/ventas, /jefe-zona/inventario) lee esta vista vía
-- fetchProductosOperativo(); admin sigue leyendo la tabla base (que sí incluye `costo`) vía
-- fetchProductos(). Al agregar otra columna sensible a `productos`, dejarla fuera de este select.
create view public.productos_operativo with (security_invoker = true) as
select id, nombre, unidad_medida, stock_minimo, activo, precio_venta
from public.productos;

alter view public.productos_operativo owner to postgres;
revoke all on public.productos_operativo from anon, public;
grant select on public.productos_operativo to authenticated;
