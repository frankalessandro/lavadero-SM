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
create schema if not exists interno;
grant usage on schema interno to web_anon, authenticated, anon;

create or replace function interno.rol_actual() returns text
  language sql stable as $$ select 'jefe_zona'::text $$;
create or replace function interno.es_activo() returns boolean
  language sql stable as $$ select true $$;
create or replace function interno.es_admin() returns boolean
  language sql stable as $$ select false $$;
