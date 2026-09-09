-- Correo de una cuenta, para el modal de detalle de "Usuarios del sistema".
--
-- `public.perfiles` no guarda el correo (vive en `auth.users`, que PostgREST no expone). Antes el
-- único momento en que se veía era al crear la cuenta (`createUsuario` lo devuelve una vez, junto
-- con la contraseña desechable) — después no había forma de volver a consultarlo desde el panel.
--
-- Se resuelve con una RPC en vez de una vista sobre `auth.users`: una vista quedaría expuesta a
-- cualquier `select` de PostgREST según las columnas que traiga, mientras que la función controla
-- el acceso fila por fila (nunca revela un correo por accidente si alguien la reusa desde otro
-- lado) y no hay que mantener otro objeto sincronizado con las columnas de una tabla que no es
-- nuestra. Nunca devuelve la contraseña — eso no se persiste desde el primer momento.

create or replace function public.email_de_usuario(p_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  if not interno.es_admin() or not interno.es_activo() then
    raise exception 'Solo un administrador puede ver el correo de una cuenta';
  end if;
  return (select email from auth.users where id = p_id);
end;
$$;

revoke execute on function public.email_de_usuario(uuid) from public, anon;
grant execute on function public.email_de_usuario(uuid) to authenticated;
