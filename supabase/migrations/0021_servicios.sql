-- Servicios individuales como entidad propia (Plan §4: "los servicios de lavado se venden
-- como combos" pasa a "los combos se arman con servicios"). El precio del combo deja de
-- escribirse a mano: se calcula sumando el precio de cada servicio que lo compone para el
-- tipo de vehículo. Cada servicio tiene DOS precios por tipo de vehículo — confirmado con la
-- lista real del cliente (imagen de precios): el precio "de combo" (lo que aporta al total
-- cuando es parte de un combo) es $5.000 más barato que el precio "individual" (cuando se
-- vende solo o se agrega suelto encima de un combo). Una orden ya no requiere combo: puede
-- ser un combo (+ opcionalmente servicios individuales encima), o solo servicios individuales
-- sin ningún combo. Decisión de negocio confirmada explícitamente con Alessandro (reglas 1 y 2).

create table servicios (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  descripcion text,
  categoria text not null check (categoria in ('auto', 'moto')),
  activo boolean not null default true
);

-- Precio del servicio cuando es parte de un combo — de aquí sale el total del combo
-- (suma de estos precios para los servicios que lo componen, ver combo_servicios).
create table precios_servicios_combo (
  id uuid primary key default gen_random_uuid(),
  servicio_id uuid not null references servicios(id),
  tipo_vehiculo_id uuid not null references tipos_vehiculo(id),
  precio integer not null check (precio > 0),
  unique (servicio_id, tipo_vehiculo_id)
);

-- Precio del servicio vendido solo (orden sin combo) o agregado suelto encima de un combo —
-- normalmente $5.000 más que el precio de combo del mismo servicio, pero son catálogos
-- independientes (confirmado con el cliente: no siempre seguía ese patrón al centavo).
create table precios_servicios_individual (
  id uuid primary key default gen_random_uuid(),
  servicio_id uuid not null references servicios(id),
  tipo_vehiculo_id uuid not null references tipos_vehiculo(id),
  precio integer not null check (precio > 0),
  unique (servicio_id, tipo_vehiculo_id)
);

-- Composición de cada combo: de qué servicios se arma. El precio del combo ya no vive aquí,
-- se calcula sumando precios_servicios_combo de estos servicios para el tipo de vehículo.
create table combo_servicios (
  id uuid primary key default gen_random_uuid(),
  combo_id uuid not null references combos(id),
  servicio_id uuid not null references servicios(id),
  unique (combo_id, servicio_id)
);

-- Servicios individuales de una orden concreta — sea porque la orden no lleva combo, o porque
-- se agregaron sueltos encima de uno. Precio snapshot al crear la orden (siempre el precio
-- "individual", nunca el de combo), mismo criterio de inmutabilidad que ordenes.precio.
create table orden_servicios (
  id uuid primary key default gen_random_uuid(),
  orden_id uuid not null references ordenes(id),
  servicio_id uuid not null references servicios(id),
  tipo_vehiculo_id uuid not null references tipos_vehiculo(id),
  precio integer not null check (precio > 0),
  creado_en timestamptz not null default now(),
  unique (orden_id, servicio_id)
);

-- El combo deja de ser obligatorio: una orden puede ser solo servicios individuales, sin
-- combo. El precio y la comisión igual quedan fijados al crear (regla de negocio 1) — la
-- validación de "algo se vendió" (combo o al menos un servicio) vive en la app, no en un
-- constraint de esta tabla (orden_servicios es una tabla aparte).
alter table ordenes alter column combo_id drop not null;

-- Retira el mecanismo viejo de precio de combo (matriz combo×tipo escrita a mano) — reemplazado
-- por precios_servicios_combo + combo_servicios. No es dato de auditoría de negocio (eso vive
-- en ordenes.precio, que no se toca), es catálogo de configuración reemplazado.
drop table precios;

-- RLS: mismo patrón que combos/tipos_vehiculo (0012_rls_policies.sql) — admin CRUD sin delete,
-- staff jefe_zona/vigilante solo select. orden_servicios sigue el patrón de ordenes: admin +
-- jefe_zona select/insert (se escribe una sola vez al crear la orden, nunca se actualiza ni
-- se borra — regla de negocio 13).

alter table public.servicios enable row level security;
create policy servicios_admin_select on public.servicios for select to authenticated using (interno.es_admin() and interno.es_activo());
create policy servicios_admin_insert on public.servicios for insert to authenticated with check (interno.es_admin() and interno.es_activo());
create policy servicios_admin_update on public.servicios for update to authenticated using (interno.es_admin() and interno.es_activo()) with check (interno.es_admin() and interno.es_activo());
create policy servicios_select_staff on public.servicios for select to authenticated using (interno.rol_actual() in ('jefe_zona', 'vigilante') and interno.es_activo());

alter table public.precios_servicios_combo enable row level security;
create policy precios_servicios_combo_admin_select on public.precios_servicios_combo for select to authenticated using (interno.es_admin() and interno.es_activo());
create policy precios_servicios_combo_admin_insert on public.precios_servicios_combo for insert to authenticated with check (interno.es_admin() and interno.es_activo());
create policy precios_servicios_combo_admin_update on public.precios_servicios_combo for update to authenticated using (interno.es_admin() and interno.es_activo()) with check (interno.es_admin() and interno.es_activo());
create policy precios_servicios_combo_select_staff on public.precios_servicios_combo for select to authenticated using (interno.rol_actual() in ('jefe_zona', 'vigilante') and interno.es_activo());

alter table public.precios_servicios_individual enable row level security;
create policy precios_servicios_individual_admin_select on public.precios_servicios_individual for select to authenticated using (interno.es_admin() and interno.es_activo());
create policy precios_servicios_individual_admin_insert on public.precios_servicios_individual for insert to authenticated with check (interno.es_admin() and interno.es_activo());
create policy precios_servicios_individual_admin_update on public.precios_servicios_individual for update to authenticated using (interno.es_admin() and interno.es_activo()) with check (interno.es_admin() and interno.es_activo());
create policy precios_servicios_individual_select_staff on public.precios_servicios_individual for select to authenticated using (interno.rol_actual() in ('jefe_zona', 'vigilante') and interno.es_activo());

alter table public.combo_servicios enable row level security;
create policy combo_servicios_admin_select on public.combo_servicios for select to authenticated using (interno.es_admin() and interno.es_activo());
create policy combo_servicios_admin_insert on public.combo_servicios for insert to authenticated with check (interno.es_admin() and interno.es_activo());
create policy combo_servicios_admin_update on public.combo_servicios for update to authenticated using (interno.es_admin() and interno.es_activo()) with check (interno.es_admin() and interno.es_activo());
create policy combo_servicios_select_staff on public.combo_servicios for select to authenticated using (interno.rol_actual() in ('jefe_zona', 'vigilante') and interno.es_activo());

alter table public.orden_servicios enable row level security;
create policy orden_servicios_admin_select on public.orden_servicios for select to authenticated using (interno.es_admin() and interno.es_activo());
create policy orden_servicios_admin_insert on public.orden_servicios for insert to authenticated with check (interno.es_admin() and interno.es_activo());
create policy orden_servicios_jefe_zona_select on public.orden_servicios for select to authenticated using (interno.rol_actual() = 'jefe_zona' and interno.es_activo());
create policy orden_servicios_jefe_zona_insert on public.orden_servicios for insert to authenticated with check (interno.rol_actual() = 'jefe_zona' and interno.es_activo());
