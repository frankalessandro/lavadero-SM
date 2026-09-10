-- Sección de inventario: separar el catálogo vendible en 'bebida' y 'snack'.
--
-- Desde el 2026-09-09 hay mecato (papas), y el conteo de apertura/cierre (0048) los debe listar
-- aparte de las bebidas. Se sigue contando TODO a diario, en cada turno de jefe de zona — lo
-- único que cambia es el agrupamiento visual del conteo.
--
-- `seccion` es nullable: null = insumo de uso interno (no vendible, no entra al conteo — mismo
-- criterio que `precio_venta is null`). Hoy todas las filas de `productos` son vendibles y son
-- bebidas, así que el backfill es directo.

alter table public.productos
  add column seccion text check (seccion is null or seccion in ('bebida', 'snack'));

update public.productos set seccion = 'bebida' where precio_venta is not null;

-- productos_operativo (0034) recorta `costo` para jefe_zona. Hay que reexponerla con la columna
-- nueva — una vista no hereda columnas agregadas a la tabla base. CREATE OR REPLACE admite
-- agregar una columna al final sin tocar grants ni el flag security_invoker.
create or replace view public.productos_operativo with (security_invoker = true) as
select id, nombre, unidad_medida, stock_minimo, activo, precio_venta, seccion
from public.productos;

-- Mecato nuevo — 6 "bolsazas". Compra del 2026-09-09: $165.534 por 48 unidades ≈ $3.449 c/u
-- (costo oficial), precio de venta $4.000. Carga inicial de 8 unidades por producto, responsable
-- Frank Roldán.
with nuevos as (
  insert into public.productos (nombre, unidad_medida, stock_minimo, activo, precio_venta, costo, seccion)
  values
    ('Doritos Bolsaza',         'unidad', 2, true, 4000, 3449, 'snack'),
    ('De Todito BBQ Bolsaza',   'unidad', 2, true, 4000, 3449, 'snack'),
    ('De Todito Mix Bolsaza',   'unidad', 2, true, 4000, 3449, 'snack'),
    ('Margarita Limón Bolsaza', 'unidad', 2, true, 4000, 3449, 'snack'),
    ('Margarita Pollo Bolsaza', 'unidad', 2, true, 4000, 3449, 'snack'),
    ('Choclitos Bolsaza',       'unidad', 2, true, 4000, 3449, 'snack')
  returning id
)
insert into public.movimientos_inventario (producto_id, tipo, cantidad, costo_unitario, responsable, motivo, creado_en)
select id, 'entrada', 8, 3449, 'Frank Roldán', 'Carga inicial de mecato', '2026-09-09T12:00:00-05:00'
from nuevos;
