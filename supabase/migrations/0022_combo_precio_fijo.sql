-- No todos los combos se arman sumando servicios: los combos de moto se venden a un precio
-- fijo por bloque (confirmado con Alessandro — "funciona diferente a los carros"), no como
-- suma de servicios individuales. Un combo puede ser de dos tipos:
--   - calculado (precio_fijo = false, default): precio = suma de precios_servicios_combo de
--     los servicios en combo_servicios, como ya funciona para autos/camionetas.
--   - fijo (precio_fijo = true): precio directo por tipo de vehículo en precios_combo_fijo,
--     sin composición de servicios.
-- En ambos casos se le pueden agregar servicios individuales sueltos encima en la orden
-- (orden_servicios, sin cambios) — confirmado explícitamente que aplica igual a los dos.

alter table combos add column precio_fijo boolean not null default false;

create table precios_combo_fijo (
  id uuid primary key default gen_random_uuid(),
  combo_id uuid not null references combos(id),
  tipo_vehiculo_id uuid not null references tipos_vehiculo(id),
  precio integer not null check (precio > 0),
  unique (combo_id, tipo_vehiculo_id)
);

alter table public.precios_combo_fijo enable row level security;
create policy precios_combo_fijo_admin_select on public.precios_combo_fijo for select to authenticated using (interno.es_admin() and interno.es_activo());
create policy precios_combo_fijo_admin_insert on public.precios_combo_fijo for insert to authenticated with check (interno.es_admin() and interno.es_activo());
create policy precios_combo_fijo_admin_update on public.precios_combo_fijo for update to authenticated using (interno.es_admin() and interno.es_activo()) with check (interno.es_admin() and interno.es_activo());
create policy precios_combo_fijo_select_staff on public.precios_combo_fijo for select to authenticated using (interno.rol_actual() in ('jefe_zona', 'vigilante') and interno.es_activo());
