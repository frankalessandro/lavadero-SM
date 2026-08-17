-- Soporte de schema para completar el panel admin: M1 restante (tarifas de parqueadero,
-- configuración), M6 (gastos), M8 (liquidación de lavadores) y el terreno para M11
-- (anulación de órdenes como insumo de control/auditoría).

create table tarifas_parqueadero (
  id uuid primary key default gen_random_uuid(),
  modalidad text not null unique check (modalidad in ('noche', 'mensualidad', 'fijo')),
  precio integer check (precio is null or precio > 0) -- NULL = tarifa aún sin definir
);
insert into tarifas_parqueadero (modalidad, precio) values
  ('noche', 8000), -- Plan §5, valor confirmado
  ('mensualidad', null),
  ('fijo', null);

create table categorias_gasto (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  activo boolean not null default true
);
insert into categorias_gasto (nombre) values
  ('Insumos de lavado'), ('Servicios públicos'), ('Mantenimiento'), ('Nómina/comisiones'), ('Otros');

create table gastos (
  id uuid primary key default gen_random_uuid(),
  fecha date not null default current_date,
  categoria_id uuid not null references categorias_gasto(id),
  descripcion text not null,
  monto integer not null check (monto > 0),
  responsable text not null,
  origen text not null default 'caja' check (origen in ('caja', 'otro')),
  creado_en timestamptz not null default now()
);
create index gastos_fecha_idx on gastos (fecha);

create table liquidaciones (
  id uuid primary key default gen_random_uuid(),
  lavador_id uuid not null references lavadores(id),
  periodo_inicio date not null,
  periodo_fin date not null,
  monto integer not null,
  pagada boolean not null default false,
  pagada_en timestamptz,
  creado_en timestamptz not null default now()
);
create index liquidaciones_lavador_idx on liquidaciones (lavador_id);

-- Una orden liquidada queda marcada para no contarla dos veces en la siguiente liquidación.
alter table ordenes add column liquidacion_id uuid references liquidaciones(id);

-- Anulación (regla de negocio 13: nada se borra, se anula con motivo y queda visible).
alter table ordenes drop constraint ordenes_estado_check;
alter table ordenes add constraint ordenes_estado_check
  check (estado in ('en_proceso', 'listo', 'entregado', 'anulada'));
alter table ordenes add column motivo_anulacion text;
alter table ordenes add column anulada_en timestamptz;
alter table ordenes add column anulada_por text;

-- Configuración global de comisión — fila única (patrón singleton: id fijo boolean true).
create table configuracion (
  id boolean primary key default true check (id),
  comision_lavador_porcentaje numeric not null default 0.4 check (comision_lavador_porcentaje > 0 and comision_lavador_porcentaje < 1),
  comision_base text not null default 'lista' check (comision_base in ('lista', 'cobrado'))
);
insert into configuracion default values;
