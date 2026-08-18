-- M1/M2/M4 — esquema inicial. Portable a Supabase (supabase db push): sin roles ni grants aquí,
-- eso vive en db/postgrest-roles.local.sql porque es exclusivo del PostgREST suelto de desarrollo local.

create extension if not exists pgcrypto;

create table tipos_vehiculo (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  activo boolean not null default true
);

create table combos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  activo boolean not null default true
);

-- Matriz de precios: la existencia de la fila combo+tipo es lo que habilita esa combinación
-- en recepción (regla de negocio 1 — precio siempre desde la lista, nunca hardcodeado).
create table precios (
  id uuid primary key default gen_random_uuid(),
  combo_id uuid not null references combos(id),
  tipo_vehiculo_id uuid not null references tipos_vehiculo(id),
  precio integer not null check (precio > 0),
  unique (combo_id, tipo_vehiculo_id)
);

create table lavadores (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  activo boolean not null default true,
  pago_diario boolean not null default false, -- excepción parametrizable, regla de negocio 4
  -- Cola de rotación persistida (regla 9): NULL = nunca asignado, va primero.
  -- Orden de la cola = activos ordenados por ultima_asignacion NULLS FIRST.
  ultima_asignacion timestamptz
);

create table ordenes (
  id uuid primary key default gen_random_uuid(),
  consecutivo integer generated always as identity, -- consecutivo continuo, control antifraude
  placa text not null,
  cliente_nombre text not null,
  cliente_telefono text,
  tipo_vehiculo_id uuid not null references tipos_vehiculo(id),
  combo_id uuid not null references combos(id),
  lavador_id uuid not null references lavadores(id),
  precio integer not null,
  comision_lavador integer not null,
  comision_negocio integer not null,
  metodo_pago text not null check (metodo_pago in ('efectivo', 'transferencia')),
  referencia_pago text,
  observaciones text,
  estado text not null default 'en_proceso' check (estado in ('en_proceso', 'listo', 'entregado')),
  creado_en timestamptz not null default now()
);
create unique index ordenes_consecutivo_key on ordenes (consecutivo);
create index ordenes_placa_idx on ordenes (placa);

create table estancias_parqueadero (
  id uuid primary key default gen_random_uuid(),
  placa text not null,
  modalidad text not null check (modalidad in ('noche', 'mensualidad', 'fijo')),
  hora_ingreso timestamptz not null default now(),
  hora_salida timestamptz,
  cobro integer,
  metodo_pago text check (metodo_pago in ('efectivo', 'transferencia')),
  estado text not null default 'adentro' check (estado in ('adentro', 'fuera'))
);
create index estancias_placa_idx on estancias_parqueadero (placa);

insert into tipos_vehiculo (nombre) values ('Motocicleta'), ('Automóvil'), ('Camioneta');

insert into lavadores (nombre, pago_diario) values
  ('Carlos Pérez', false),
  ('Luis Gómez', false),
  ('Andrés Ruiz', false),
  ('Miguel Torres', true);
