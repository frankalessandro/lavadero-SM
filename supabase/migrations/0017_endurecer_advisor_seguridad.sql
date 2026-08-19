-- Corrige los findings del advisor de seguridad de Supabase (`get_advisors`) sobre objetos que
-- ya existían desde 0011/0012 — nada de esto es nuevo de esta sesión, son ajustes de endurecimiento.
-- No aplica en local (docker): 0012-0014 nunca se corrieron ahí (no existe el rol `authenticated`
-- ni las funciones/políticas de RLS todavía — ver notas de esas migraciones), así que este archivo
-- es solo para el proyecto Supabase real.

-- 1) ERROR "Security Definer View" en movimientos_inventario_operativo.
-- La vista corre a propósito con los privilegios de su owner (postgres) para que jefe_zona lea
-- movimientos sin las columnas de costo, saltándose el RLS restrictivo de la tabla base (Opción A,
-- documentada en 0012_rls_policies.sql). El problema real: los GRANT por defecto de un proyecto
-- Supabase nuevo le dan a `anon` (sin login) los mismos privilegios que a cualquier otro rol sobre
-- objetos nuevos del schema public, y como esta vista bypassea RLS por diseño, eso significa que
-- CUALQUIERA sin autenticarse podía leer (y, según cómo resuelva Postgres una vista de una sola
-- tabla, potencialmente escribir) movimientos de inventario. 0012 nunca le dio grants a `anon`
-- explícitamente, pero tampoco se los revocó — se cierra ahora.
revoke all on public.movimientos_inventario_operativo from anon, public;

-- `authenticated` también traía UPDATE/DELETE/TRUNCATE de los grants por defecto del proyecto
-- (0012 solo otorgó select+insert a propósito) — la vista no tiene INSTEAD OF trigger para esas
-- operaciones, así que un update/delete se hubiera resuelto por la vía "vista auto-actualizable"
-- de Postgres, con el mismo riesgo de saltarse el RLS de la tabla base. Se deja solo lo que la
-- vista realmente soporta (select vía el owner, insert vía el trigger de abajo).
revoke update, delete, truncate, references, trigger on public.movimientos_inventario_operativo from authenticated;

-- 2) WARN "Signed-In Users Can Execute SECURITY DEFINER Function" en es_admin/es_activo/rol_actual.
-- Son helpers usados dentro de las políticas RLS de todo el proyecto (evitan recursión al leer el
-- propio perfil, ver 0011_perfiles.sql) — nunca se pensaron para invocarse directo desde el cliente.
-- El advisor los marca porque, al vivir en `public`, PostgREST también los expone como endpoints
-- RPC (`/rest/v1/rpc/es_admin`, etc.). No se puede revocar el EXECUTE de `authenticated` sin romper
-- las ~78 políticas que dependen de ellos (una política corre con los privilegios de quien hace la
-- consulta). Solución sin tocar ninguna política: moverlos a un schema fuera de los "Exposed
-- schemas" de la API (que en este proyecto son solo `public`/`graphql_public`) — `ALTER FUNCTION
-- ... SET SCHEMA` conserva el OID y los grants existentes, así que las políticas ya creadas
-- siguen resolviendo la misma función sin recrearlas.
create schema if not exists interno;
grant usage on schema interno to authenticated;

alter function public.es_admin() set schema interno;
alter function public.es_activo() set schema interno;
alter function public.rol_actual() set schema interno;

-- Único llamador que referenciaba estas funciones por nombre completo en el cuerpo de otra
-- función (no dentro de una política — esas se resuelven por OID y no necesitan tocarse):
-- el trigger de inserción de la vista operativa de inventario.
create or replace function public.movimientos_inventario_operativo_insert()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if interno.rol_actual() <> 'jefe_zona' or not interno.es_activo() then
    raise exception 'No autorizado';
  end if;
  insert into public.movimientos_inventario (producto_id, tipo, cantidad, motivo, responsable)
  values (new.producto_id, new.tipo, new.cantidad, new.motivo, new.responsable);
  return new;
end;
$$;
