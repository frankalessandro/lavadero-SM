-- M7 — Inventario. Catálogo de productos/insumos + histórico de movimientos (entrada, salida,
-- ajuste). El stock actual y la valorización se calculan en el cliente sumando `movimientos_inventario`
-- (cantidad con signo: entrada/ajuste positivo suman, salida/ajuste negativo restan) — no se
-- guarda un "stock actual" desnormalizado para no arriesgar que se desincronice.

create table productos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  unidad_medida text not null,
  stock_minimo integer not null default 0 check (stock_minimo >= 0),
  activo boolean not null default true
);

create table movimientos_inventario (
  id uuid primary key default gen_random_uuid(),
  producto_id uuid not null references productos(id),
  tipo text not null check (tipo in ('entrada', 'salida', 'ajuste')),
  cantidad integer not null check (cantidad <> 0), -- con signo: negativo resta del stock
  costo_unitario integer check (costo_unitario is null or costo_unitario >= 0), -- solo aplica a entradas
  proveedor text, -- solo aplica a entradas
  motivo text, -- obligatorio para 'ajuste' (validado en el data layer, no en el constraint)
  responsable text not null,
  creado_en timestamptz not null default now()
);
create index movimientos_inventario_producto_idx on movimientos_inventario (producto_id);
