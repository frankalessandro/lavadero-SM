-- Ventas de productos de inventario (agua, cerveza, etc.) — jefe de zona cobra en el mostrador,
-- el stock se descuenta automáticamente, y el dinero se suma al arqueo de caja (junto con los
-- lavados en efectivo, ver calcularValorEsperado en src/data/turnos.ts). Sin comisión: 100% va
-- al negocio, no toca liquidaciones de lavadores (M8).
--
-- Nota: rol_actual/es_admin/es_activo viven en el schema `interno` desde 0017 (movidos fuera de
-- `public` para que PostgREST no los exponga como RPC) — este archivo ya usa `interno.*`, no
-- `public.*`, para esas tres.

-- Precio de venta al público, distinto de `costo_unitario` (que solo vive en las entradas de
-- movimientos_inventario). Nullable a propósito, mismo criterio "Sin definir" que
-- tarifas_parqueadero cuando el precio no se ha confirmado — un producto sin precio_venta no
-- aparece como vendible en /jefe-zona/inventario.
alter table productos add column precio_venta integer check (precio_venta is null or precio_venta >= 0);

create table ventas (
  id uuid primary key default gen_random_uuid(),
  consecutivo integer generated always as identity,
  producto_id uuid not null references productos(id),
  cantidad integer not null check (cantidad > 0),
  -- Snapshot del precio de venta al momento de vender — igual criterio de inmutabilidad que
  -- ordenes.precio (no se recalcula si después cambia el precio_venta del producto).
  precio_unitario integer not null check (precio_unitario >= 0),
  total integer not null check (total >= 0),
  metodo_pago text not null check (metodo_pago in ('efectivo', 'transferencia')),
  referencia_pago text,
  -- Se fija en la creación misma (a diferencia de ordenes.turno_id, que se fija al cobrar) —
  -- una venta se cobra en el acto, no hay "entregar después".
  turno_id uuid references turnos_caja(id),
  vendido_por text not null,
  estado text not null default 'activa' check (estado in ('activa', 'anulada')),
  motivo_anulacion text,
  anulada_por text,
  anulada_en timestamptz,
  creado_en timestamptz not null default now()
);
create index ventas_turno_idx on ventas (turno_id);
create index ventas_producto_idx on ventas (producto_id);

-- Traza qué movimiento de stock vino de qué venta — necesario para reversar exacto en
-- anularVenta (no por texto de `motivo`). Nullable: los movimientos manuales de /admin/inventario
-- no tienen venta asociada.
alter table movimientos_inventario add column venta_id uuid references ventas(id);

-- === ventas: admin CRUD (sin delete), jefe_zona SELECT/INSERT/UPDATE (mismo molde que ordenes),
-- === vigilante sin acceso.

alter table public.ventas enable row level security;
create policy ventas_admin_select on public.ventas for select to authenticated using (interno.es_admin() and interno.es_activo());
create policy ventas_admin_insert on public.ventas for insert to authenticated with check (interno.es_admin() and interno.es_activo());
create policy ventas_admin_update on public.ventas for update to authenticated using (interno.es_admin() and interno.es_activo()) with check (interno.es_admin() and interno.es_activo());
create policy ventas_jefe_zona_select on public.ventas for select to authenticated using (interno.rol_actual() = 'jefe_zona' and interno.es_activo());
create policy ventas_jefe_zona_insert on public.ventas for insert to authenticated with check (interno.rol_actual() = 'jefe_zona' and interno.es_activo());
create policy ventas_jefe_zona_update on public.ventas for update to authenticated using (interno.rol_actual() = 'jefe_zona' and interno.es_activo()) with check (interno.rol_actual() = 'jefe_zona' and interno.es_activo());

-- La vista/trigger operativos de movimientos_inventario (0012 + endurecidos en 0017) son el único
-- camino de jefe_zona para insertar movimientos de stock (no tiene policy directa sobre la tabla
-- base). Se recrean acá para aceptar/pasar venta_id, reaplicando el mismo endurecimiento de 0017
-- (revocar de anon/public, dejar solo select+insert a authenticated) porque DROP VIEW se lleva
-- los grants existentes consigo.
drop trigger movimientos_inventario_operativo_insert_trigger on public.movimientos_inventario_operativo;
drop view public.movimientos_inventario_operativo;

create view public.movimientos_inventario_operativo as
select id, producto_id, tipo, cantidad, motivo, responsable, creado_en, venta_id
from public.movimientos_inventario;

alter view public.movimientos_inventario_operativo owner to postgres;
revoke all on public.movimientos_inventario_operativo from anon, public;
grant select, insert on public.movimientos_inventario_operativo to authenticated;

create or replace function public.movimientos_inventario_operativo_insert()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if interno.rol_actual() <> 'jefe_zona' or not interno.es_activo() then
    raise exception 'No autorizado';
  end if;
  insert into public.movimientos_inventario (producto_id, tipo, cantidad, motivo, responsable, venta_id)
  values (new.producto_id, new.tipo, new.cantidad, new.motivo, new.responsable, new.venta_id);
  return new;
end;
$$;

create trigger movimientos_inventario_operativo_insert_trigger
  instead of insert on public.movimientos_inventario_operativo
  for each row execute function public.movimientos_inventario_operativo_insert();

-- Mismo endurecimiento que 0014 (revocar PUBLIC/anon EXECUTE de la función de trigger — solo la
-- invoca el trigger, que corre con privilegios del owner sin necesitar EXECUTE de nadie más).
revoke execute on function public.movimientos_inventario_operativo_insert() from public, anon, authenticated;
