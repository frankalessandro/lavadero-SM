-- CORRIGE UN HUECO DE SEGURIDAD DE 0028: esa migración creó `liquidaciones_jefe_zona` sin
-- habilitarle RLS ni darle policies. Una tabla del schema `public` sin RLS queda expuesta por
-- PostgREST a cualquiera con la anon key (que viaja en el bundle del frontend), así que los
-- montos de liquidación del jefe de patio quedaban legibles Y escribibles por cualquiera.
-- Se arregla acá, en una migración aparte, porque 0028 ya está aplicada al sandbox local y la
-- regla del proyecto es no editar migraciones ya aplicadas.
--
-- >>> APLICAR SIEMPRE INMEDIATAMENTE DESPUÉS DE 0028 <<<
-- Si 0028 se aplica sola a producción, la tabla queda expuesta hasta que llegue esta.
--
-- SOLO PARA SUPABASE — NO APLICAR AL SANDBOX LOCAL DE DOCKER, igual que 0012/0013/0014/0017.
-- El sandbox corre con `web_anon`, que no es el rol `authenticated` al que apuntan estas
-- policies y no tiene BYPASSRLS: habilitar RLS allá dejaría a web_anon sin acceso a la tabla y
-- rompería las pruebas locales. Por eso `liquidaciones` tampoco tiene RLS en el sandbox hoy
-- (verificado: pg_class.relrowsecurity = false) y sí la tiene en Supabase desde 0012.
--
-- Modelo de acceso, calcado del de `liquidaciones` en 0012 (tabla equivalente para lavadores),
-- con dos diferencias deliberadas:
--   1. `interno.es_admin()` / `interno.es_activo()` en vez de `public.*` — 0017 movió esas
--      funciones al schema `interno` para que PostgREST no las exponga como RPC.
--   2. SIN policy de SELECT para jefe_zona, a diferencia de `liquidaciones`. Ninguna pantalla de
--      /jefe-zona lee esta tabla (solo /admin/dinero/liquidaciones), y la tabla de roles del
--      CLAUDE.md dice que jefe de zona no ve histórico financiero. Si el negocio decide que el
--      jefe de patio debe poder consultar sus propias liquidaciones, eso es una regla nueva y se
--      agrega explícitamente — no se hereda por descuido.
-- Sin policy de DELETE para nadie: los registros históricos son inmutables (regla de negocio 13).

alter table public.liquidaciones_jefe_zona enable row level security;

create policy liquidaciones_jefe_zona_admin_select on public.liquidaciones_jefe_zona
  for select to authenticated using (interno.es_admin() and interno.es_activo());
create policy liquidaciones_jefe_zona_admin_insert on public.liquidaciones_jefe_zona
  for insert to authenticated with check (interno.es_admin() and interno.es_activo());
create policy liquidaciones_jefe_zona_admin_update on public.liquidaciones_jefe_zona
  for update to authenticated using (interno.es_admin() and interno.es_activo())
  with check (interno.es_admin() and interno.es_activo());

-- Mismo endurecimiento explícito de 0017: los grants por defecto del proyecto Supabase le dan
-- privilegios a `anon` y `authenticated` sobre cada tabla nueva de `public`. RLS ya bloquea a
-- `anon` (no hay policy para ese rol), pero se revoca igual para no depender de una sola capa, y
-- se le quitan a `authenticated` los verbos que ninguna policy debería poder ejercer.
revoke all on public.liquidaciones_jefe_zona from anon, public;
revoke delete, truncate, references, trigger on public.liquidaciones_jefe_zona from authenticated;
