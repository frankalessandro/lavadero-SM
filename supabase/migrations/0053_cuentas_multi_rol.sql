-- Cuentas individuales y acceso multi-rol.
--
-- Hasta acá: una cuenta de Auth compartida por rol (Gerencia / Jefe de patio / Vigilante) y un
-- solo `perfiles.rol` por cuenta. Se pasa a una cuenta por persona con 1-3 roles. La persona real
-- del roster (`personal_operativo`, 0043) sigue siendo la fuente para turnos/liquidaciones/
-- bitácora — acá solo se agrega el enlace `persona_id`, sin recablear esos consumidores.
--
-- Clave del diseño: las ~78 políticas RLS cuelgan de `interno.rol_actual()` / `interno.es_admin()`.
-- No se toca ninguna política — solo cambia QUÉ devuelven esos helpers: el rol *activo* (el módulo
-- que la persona eligió tras login), no un rol único. Un multi-rol dentro del panel de jefe de
-- zona tiene `rol_activo = 'jefe_zona'`, así que `es_admin()` es falso y ve exactamente lo de ese
-- rol.

alter table public.perfiles
  add column roles text[] not null default '{}',
  add column rol_activo text,
  add column debe_cambiar_password boolean not null default true,
  add column persona_id uuid references public.personal_operativo(id);

-- Backfill: las cuentas actuales ya tienen clave funcional y (a lo sumo) un rol.
update public.perfiles set
  roles = case when rol is null then '{}'::text[] else array[rol] end,
  rol_activo = rol,
  debe_cambiar_password = false;

alter table public.perfiles
  add constraint perfiles_roles_validos
    check (roles <@ array['admin', 'jefe_zona', 'vigilante']::text[]),
  add constraint perfiles_rol_activo_valido
    check (rol_activo is null or rol_activo = any(roles));

-- La columna vieja se va con su propio `check (rol in (...))`. Ninguna política la referencia
-- (las de `turnos_caja` usan `turnos_caja.rol`, otra tabla).
alter table public.perfiles drop column rol;

-- Helpers RLS: ahora leen `rol_activo`. `create or replace` conserva OID y grants (moved a schema
-- `interno` en 0017), así que las ~78 políticas siguen resolviendo la misma función sin recrearse.
create or replace function interno.rol_actual()
returns text
language sql stable security definer set search_path = public
as $$
  select rol_activo from public.perfiles where id = auth.uid();
$$;

create or replace function interno.es_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce((select rol_activo from public.perfiles where id = auth.uid()) = 'admin', false);
$$;

-- interno.es_activo() no cambia (sigue leyendo `perfiles.activo`).

-- Escrituras a `perfiles` que el propio usuario dispara. NO como política `id = auth.uid()` — eso
-- lo dejaría cambiarse `roles`. RPC acotadas en `public` (expuesto por PostgREST) para poder
-- llamarlas con `db.rpc(...)`. Generan el WARN de advisor "Signed-In Users Can Execute SECURITY
-- DEFINER Function" — intencional, mismo criterio que 0032/0035/0036.

-- Fija el módulo activo. `p_rol` NULL limpia (lo hace `signOut` para que un bookmark viejo no
-- salte el selector entre sesiones). Solo deja poner un rol realmente concedido y con cuenta activa.
create function public.set_rol_activo(p_rol text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if p_rol is null then
    update public.perfiles set rol_activo = null where id = auth.uid();
    return;
  end if;
  update public.perfiles
     set rol_activo = p_rol
   where id = auth.uid()
     and p_rol = any(roles)
     and activo;
  if not found then
    raise exception 'Rol no disponible para esta cuenta';
  end if;
end;
$$;

create function public.marcar_password_cambiada()
returns void
language sql security definer set search_path = public
as $$
  update public.perfiles set debe_cambiar_password = false where id = auth.uid();
$$;

revoke execute on function public.set_rol_activo(text) from public, anon;
revoke execute on function public.marcar_password_cambiada() from public, anon;
grant execute on function public.set_rol_activo(text) to authenticated;
grant execute on function public.marcar_password_cambiada() to authenticated;
