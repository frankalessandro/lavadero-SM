-- Perfiles de usuario (Supabase Auth) — rol y estado de cada cuenta real. El admin crea el
-- usuario en Supabase Studio (email+password); este trigger crea la fila perfiles automática
-- con rol NULL ("pendiente") hasta que el admin se lo asigne en /admin/usuarios.

create table public.perfiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nombre text,
  rol text check (rol in ('admin', 'jefe_zona', 'vigilante')),
  activo boolean not null default true,
  creado_en timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.perfiles (id, nombre)
  values (new.id, new.raw_user_meta_data ->> 'nombre');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- security definer helpers — evitan recursión de RLS al leer el propio rol dentro de policies
-- sobre perfiles y permiten reusar la condición en todas las demás tablas.
create or replace function public.rol_actual()
returns text
language sql stable security definer set search_path = public
as $$
  select rol from public.perfiles where id = auth.uid();
$$;

create or replace function public.es_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce((select rol from public.perfiles where id = auth.uid()) = 'admin', false);
$$;

create or replace function public.es_activo()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce((select activo from public.perfiles where id = auth.uid()), false);
$$;

alter table public.perfiles enable row level security;

-- Cualquier usuario autenticado y activo puede leer todos los perfiles (se necesita para
-- resolver nombres de responsables en UI); solo admin puede editar rol/nombre/activo de otros.
create policy perfiles_select on public.perfiles
  for select to authenticated
  using (public.es_activo() or id = auth.uid());

create policy perfiles_update_admin on public.perfiles
  for update to authenticated
  using (public.es_admin())
  with check (public.es_admin());
