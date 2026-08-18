-- RLS por rol en las 14 tablas del schema, según la matriz de Roles y visibilidad (CLAUDE.md
-- §Roles). Ninguna política otorga DELETE — regla de negocio 13 ("nada se elimina") se aplica
-- también a nivel de base de datos, no solo de UI: sin policy de delete, el comando queda
-- denegado por defecto para todos los roles (incluido admin), igual que ya hacía
-- db/postgrest-roles.local.sql localmente (solo grant de select/insert/update, nunca delete).

-- === Catálogos de solo lectura para staff (tipos_vehiculo, combos, precios, configuracion,
-- === categorias_gasto, tarifas_parqueadero): admin CRUD (sin delete), jefe_zona/vigilante SELECT.

alter table public.tipos_vehiculo enable row level security;
create policy tipos_vehiculo_admin_select on public.tipos_vehiculo for select to authenticated using (public.es_admin() and public.es_activo());
create policy tipos_vehiculo_admin_insert on public.tipos_vehiculo for insert to authenticated with check (public.es_admin() and public.es_activo());
create policy tipos_vehiculo_admin_update on public.tipos_vehiculo for update to authenticated using (public.es_admin() and public.es_activo()) with check (public.es_admin() and public.es_activo());
create policy tipos_vehiculo_select_staff on public.tipos_vehiculo for select to authenticated using (public.rol_actual() in ('jefe_zona', 'vigilante') and public.es_activo());

alter table public.combos enable row level security;
create policy combos_admin_select on public.combos for select to authenticated using (public.es_admin() and public.es_activo());
create policy combos_admin_insert on public.combos for insert to authenticated with check (public.es_admin() and public.es_activo());
create policy combos_admin_update on public.combos for update to authenticated using (public.es_admin() and public.es_activo()) with check (public.es_admin() and public.es_activo());
create policy combos_select_staff on public.combos for select to authenticated using (public.rol_actual() in ('jefe_zona', 'vigilante') and public.es_activo());

alter table public.precios enable row level security;
create policy precios_admin_select on public.precios for select to authenticated using (public.es_admin() and public.es_activo());
create policy precios_admin_insert on public.precios for insert to authenticated with check (public.es_admin() and public.es_activo());
create policy precios_admin_update on public.precios for update to authenticated using (public.es_admin() and public.es_activo()) with check (public.es_admin() and public.es_activo());
create policy precios_select_staff on public.precios for select to authenticated using (public.rol_actual() in ('jefe_zona', 'vigilante') and public.es_activo());

alter table public.configuracion enable row level security;
create policy configuracion_admin_select on public.configuracion for select to authenticated using (public.es_admin() and public.es_activo());
create policy configuracion_admin_update on public.configuracion for update to authenticated using (public.es_admin() and public.es_activo()) with check (public.es_admin() and public.es_activo());
create policy configuracion_select_staff on public.configuracion for select to authenticated using (public.rol_actual() in ('jefe_zona', 'vigilante') and public.es_activo());

alter table public.categorias_gasto enable row level security;
create policy categorias_gasto_admin_select on public.categorias_gasto for select to authenticated using (public.es_admin() and public.es_activo());
create policy categorias_gasto_admin_insert on public.categorias_gasto for insert to authenticated with check (public.es_admin() and public.es_activo());
create policy categorias_gasto_admin_update on public.categorias_gasto for update to authenticated using (public.es_admin() and public.es_activo()) with check (public.es_admin() and public.es_activo());
create policy categorias_gasto_select_jefe_zona on public.categorias_gasto for select to authenticated using (public.rol_actual() = 'jefe_zona' and public.es_activo());

alter table public.tarifas_parqueadero enable row level security;
create policy tarifas_parqueadero_admin_select on public.tarifas_parqueadero for select to authenticated using (public.es_admin() and public.es_activo());
create policy tarifas_parqueadero_admin_update on public.tarifas_parqueadero for update to authenticated using (public.es_admin() and public.es_activo()) with check (public.es_admin() and public.es_activo());
create policy tarifas_parqueadero_select_vigilante on public.tarifas_parqueadero for select to authenticated using (public.rol_actual() = 'vigilante' and public.es_activo());

-- === lavadores: admin CRUD (sin delete), jefe_zona SELECT + UPDATE (cola de rotación), vigilante sin acceso.

alter table public.lavadores enable row level security;
create policy lavadores_admin_select on public.lavadores for select to authenticated using (public.es_admin() and public.es_activo());
create policy lavadores_admin_insert on public.lavadores for insert to authenticated with check (public.es_admin() and public.es_activo());
create policy lavadores_admin_update on public.lavadores for update to authenticated using (public.es_admin() and public.es_activo()) with check (public.es_admin() and public.es_activo());
create policy lavadores_select_jefe_zona on public.lavadores for select to authenticated using (public.rol_actual() = 'jefe_zona' and public.es_activo());
create policy lavadores_update_jefe_zona on public.lavadores for update to authenticated using (public.rol_actual() = 'jefe_zona' and public.es_activo()) with check (public.rol_actual() = 'jefe_zona' and public.es_activo());

-- === ordenes: admin CRUD (sin delete), jefe_zona SELECT/INSERT/UPDATE, vigilante sin acceso.

alter table public.ordenes enable row level security;
create policy ordenes_admin_select on public.ordenes for select to authenticated using (public.es_admin() and public.es_activo());
create policy ordenes_admin_insert on public.ordenes for insert to authenticated with check (public.es_admin() and public.es_activo());
create policy ordenes_admin_update on public.ordenes for update to authenticated using (public.es_admin() and public.es_activo()) with check (public.es_admin() and public.es_activo());
create policy ordenes_jefe_zona_select on public.ordenes for select to authenticated using (public.rol_actual() = 'jefe_zona' and public.es_activo());
create policy ordenes_jefe_zona_insert on public.ordenes for insert to authenticated with check (public.rol_actual() = 'jefe_zona' and public.es_activo());
create policy ordenes_jefe_zona_update on public.ordenes for update to authenticated using (public.rol_actual() = 'jefe_zona' and public.es_activo()) with check (public.rol_actual() = 'jefe_zona' and public.es_activo());

-- === estancias_parqueadero: admin CRUD (sin delete), vigilante SELECT/INSERT/UPDATE. jefe_zona
-- === no tiene nav de Parqueadero (NAV_ITEMS de /jefe-zona no lo incluye) → sin acceso.

alter table public.estancias_parqueadero enable row level security;
create policy estancias_admin_select on public.estancias_parqueadero for select to authenticated using (public.es_admin() and public.es_activo());
create policy estancias_admin_insert on public.estancias_parqueadero for insert to authenticated with check (public.es_admin() and public.es_activo());
create policy estancias_admin_update on public.estancias_parqueadero for update to authenticated using (public.es_admin() and public.es_activo()) with check (public.es_admin() and public.es_activo());
create policy estancias_vigilante_select on public.estancias_parqueadero for select to authenticated using (public.rol_actual() = 'vigilante' and public.es_activo());
create policy estancias_vigilante_insert on public.estancias_parqueadero for insert to authenticated with check (public.rol_actual() = 'vigilante' and public.es_activo());
create policy estancias_vigilante_update on public.estancias_parqueadero for update to authenticated using (public.rol_actual() = 'vigilante' and public.es_activo()) with check (public.rol_actual() = 'vigilante' and public.es_activo());

-- === turnos_caja: admin CRUD (sin delete) sobre todos; jefe_zona/vigilante CRUD (sin delete)
-- === solo sobre turnos de su propio rol (columna `rol` ya existe en la tabla).

alter table public.turnos_caja enable row level security;
create policy turnos_admin_select on public.turnos_caja for select to authenticated using (public.es_admin() and public.es_activo());
create policy turnos_admin_insert on public.turnos_caja for insert to authenticated with check (public.es_admin() and public.es_activo());
create policy turnos_admin_update on public.turnos_caja for update to authenticated using (public.es_admin() and public.es_activo()) with check (public.es_admin() and public.es_activo());
create policy turnos_jefe_zona_select on public.turnos_caja for select to authenticated using (public.rol_actual() = 'jefe_zona' and public.es_activo() and rol = 'jefe_zona');
create policy turnos_jefe_zona_insert on public.turnos_caja for insert to authenticated with check (public.rol_actual() = 'jefe_zona' and public.es_activo() and rol = 'jefe_zona');
create policy turnos_jefe_zona_update on public.turnos_caja for update to authenticated using (public.rol_actual() = 'jefe_zona' and public.es_activo() and rol = 'jefe_zona') with check (public.rol_actual() = 'jefe_zona' and public.es_activo() and rol = 'jefe_zona');
create policy turnos_vigilante_select on public.turnos_caja for select to authenticated using (public.rol_actual() = 'vigilante' and public.es_activo() and rol = 'vigilante');
create policy turnos_vigilante_insert on public.turnos_caja for insert to authenticated with check (public.rol_actual() = 'vigilante' and public.es_activo() and rol = 'vigilante');
create policy turnos_vigilante_update on public.turnos_caja for update to authenticated using (public.rol_actual() = 'vigilante' and public.es_activo() and rol = 'vigilante') with check (public.rol_actual() = 'vigilante' and public.es_activo() and rol = 'vigilante');

-- === gastos: admin CRUD (sin delete), jefe_zona SELECT + INSERT (caja diurna), vigilante sin acceso.

alter table public.gastos enable row level security;
create policy gastos_admin_select on public.gastos for select to authenticated using (public.es_admin() and public.es_activo());
create policy gastos_admin_insert on public.gastos for insert to authenticated with check (public.es_admin() and public.es_activo());
create policy gastos_admin_update on public.gastos for update to authenticated using (public.es_admin() and public.es_activo()) with check (public.es_admin() and public.es_activo());
create policy gastos_jefe_zona_select on public.gastos for select to authenticated using (public.rol_actual() = 'jefe_zona' and public.es_activo());
create policy gastos_jefe_zona_insert on public.gastos for insert to authenticated with check (public.rol_actual() = 'jefe_zona' and public.es_activo());

-- === liquidaciones: admin CRUD (sin delete), jefe_zona SELECT, vigilante sin acceso.

alter table public.liquidaciones enable row level security;
create policy liquidaciones_admin_select on public.liquidaciones for select to authenticated using (public.es_admin() and public.es_activo());
create policy liquidaciones_admin_insert on public.liquidaciones for insert to authenticated with check (public.es_admin() and public.es_activo());
create policy liquidaciones_admin_update on public.liquidaciones for update to authenticated using (public.es_admin() and public.es_activo()) with check (public.es_admin() and public.es_activo());
create policy liquidaciones_jefe_zona_select on public.liquidaciones for select to authenticated using (public.rol_actual() = 'jefe_zona' and public.es_activo());

-- === productos: admin CRUD (sin delete), jefe_zona SELECT, vigilante sin acceso.

alter table public.productos enable row level security;
create policy productos_admin_select on public.productos for select to authenticated using (public.es_admin() and public.es_activo());
create policy productos_admin_insert on public.productos for insert to authenticated with check (public.es_admin() and public.es_activo());
create policy productos_admin_update on public.productos for update to authenticated using (public.es_admin() and public.es_activo()) with check (public.es_admin() and public.es_activo());
create policy productos_jefe_zona_select on public.productos for select to authenticated using (public.rol_actual() = 'jefe_zona' and public.es_activo());

-- === movimientos_inventario: SOLO admin accede a la tabla base (incluye costo_unitario/proveedor).
-- === jefe_zona pasa por la vista movimientos_inventario_operativo (sin esas dos columnas).

alter table public.movimientos_inventario enable row level security;
create policy movimientos_admin_select on public.movimientos_inventario for select to authenticated using (public.es_admin() and public.es_activo());
create policy movimientos_admin_insert on public.movimientos_inventario for insert to authenticated with check (public.es_admin() and public.es_activo());
create policy movimientos_admin_update on public.movimientos_inventario for update to authenticated using (public.es_admin() and public.es_activo()) with check (public.es_admin() and public.es_activo());

create view public.movimientos_inventario_operativo as
select id, producto_id, tipo, cantidad, motivo, responsable, creado_en
from public.movimientos_inventario;

alter view public.movimientos_inventario_operativo owner to postgres;
grant select, insert on public.movimientos_inventario_operativo to authenticated;

create or replace function public.movimientos_inventario_operativo_insert()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if public.rol_actual() <> 'jefe_zona' or not public.es_activo() then
    raise exception 'No autorizado';
  end if;
  insert into public.movimientos_inventario (producto_id, tipo, cantidad, motivo, responsable)
  values (new.producto_id, new.tipo, new.cantidad, new.motivo, new.responsable);
  return new;
end;
$$;

create trigger movimientos_inventario_operativo_insert_trigger
  instead of insert on public.movimientos_inventario_operativo
  for each row execute function public.movimientos_inventario_operativo_insert();

-- La vista no tiene RLS propia (es un objeto sin storage); su SELECT ya está limitado por el
-- GRANT de arriba + porque su función/owner (postgres) puede leer la tabla base sin las
-- políticas de `authenticated`. Para que jefe_zona pueda hacer SELECT sobre la vista sin heredar
-- el RLS restrictivo de la tabla base, la vista corre con los privilegios de su owner (postgres),
-- que sí puede leer movimientos_inventario directamente (dueño de la tabla). El advisor de
-- seguridad de Supabase marca esto como "Security Definer View" — es el comportamiento
-- intencional (Opción A, aprobada explícitamente): el candado de costo_unitario/proveedor
-- vive en Postgres, no en el frontend.
