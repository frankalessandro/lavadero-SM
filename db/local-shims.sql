-- Shims SOLO para el sandbox de Docker (PostgREST suelto, sin Supabase Auth). NO portar a
-- Supabase — allá el schema `interno` y los roles `anon`/`authenticated` ya existen (0011/0017 +
-- GoTrue). Igual que `db/postgrest-roles.local.sql`, esto vive fuera de `supabase/migrations/`.
--
-- Por qué hace falta: las migraciones 0032+ (RPCs de ventas) llaman `interno.es_activo()` /
-- `interno.rol_actual()` y hacen `grant ... to authenticated`. En el sandbox nunca se corrieron
-- 0011-0017 (son Supabase-only, ver sus comentarios), así que sin esto las migraciones fallan.

-- Roles que las migraciones de Supabase dan por sentado. Stubs vacíos; el acceso real en el
-- sandbox lo tiene `web_anon` (ver postgrest-roles.local.sql). `web_anon` hereda de
-- `authenticated` para que los `grant execute ... to authenticated` de las RPCs le apliquen.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  -- Varias migraciones hacen `alter ... owner to postgres` / `grant ... to postgres` (patrón
  -- Supabase). En el sandbox el superusuario se llama distinto, así que se crea un alias.
  if not exists (select 1 from pg_roles where rolname = 'postgres') then create role postgres superuser login; end if;
end $$;
grant authenticated to web_anon;
grant anon to web_anon;

-- `interno` + helpers. En el sandbox no hay sesión real: se asume jefe_zona activo, que pasa
-- todos los chequeos de rol de las RPCs (`in ('jefe_zona','admin')` y el `= 'jefe_zona'` del
-- trigger de movimientos_inventario_operativo).
--
-- OJO: 0053_cuentas_multi_rol.sql reescribe interno.rol_actual()/es_admin() para leer
-- `perfiles.rol_activo` por `auth.uid()`. En el sandbox `auth.uid()` es NULL, así que tras
-- aplicar 0053 esos helpers devolverían NULL y las RPCs de ventas fallarían el chequeo de rol.
-- Este archivo es idempotente (`create or replace`): re-ejecútalo después de 0053 para restaurar
-- los stubs hardcodeados de abajo.
create schema if not exists interno;
grant usage on schema interno to web_anon, authenticated, anon;

create or replace function interno.rol_actual() returns text
  language sql stable as $$ select 'jefe_zona'::text $$;
create or replace function interno.es_activo() returns boolean
  language sql stable as $$ select true $$;
create or replace function interno.es_admin() returns boolean
  language sql stable as $$ select false $$;

-- `auth.uid()` — lo usa `interno.actor()` (0044_bitacora_auditoria.sql) para saber con qué cuenta
-- se hizo cada cosa. En el sandbox no hay GoTrue ni schema `auth`, así que sin este stub las
-- migraciones de la bitácora fallan al crearse y cualquier insert con trigger revienta. Devuelve
-- NULL: en el log local queda "sin usuario", que es la verdad — no hay sesión que registrar. La
-- persona (`persona_id`) sí se resuelve normal, porque sale del turno abierto, no del JWT.
create schema if not exists auth;
grant usage on schema auth to web_anon, authenticated, anon;
create or replace function auth.uid() returns uuid
  language sql stable as $$ select null::uuid $$;

-- `public.perfiles` la crea 0011 (Supabase-only, nunca se corrió acá) pero `interno.actor()` de
-- 0044 la consulta — y como es `language sql`, Postgres valida el cuerpo al CREAR la función, así
-- que sin la tabla la migración de la bitácora ni siquiera se puede aplicar en el sandbox. Stub
-- vacío: en local `auth.uid()` es NULL, así que nunca hace match y la bitácora queda con usuario
-- nulo (la verdad — no hay sesión). La persona sí se resuelve, sale del turno abierto.
create table if not exists public.perfiles (
  id uuid primary key,
  nombre text,
  rol text,
  activo boolean not null default true,
  creado_en timestamptz not null default now()
);
-- Columnas de 0053 (multi-rol). `add column if not exists` para volúmenes viejos.
alter table public.perfiles add column if not exists roles text[] not null default '{}';
alter table public.perfiles add column if not exists rol_activo text;
alter table public.perfiles add column if not exists debe_cambiar_password boolean not null default false;
alter table public.perfiles add column if not exists persona_id uuid;
grant select on public.perfiles to web_anon, authenticated, anon;
