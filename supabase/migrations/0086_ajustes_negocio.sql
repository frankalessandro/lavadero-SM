-- 0086 — Ajustes del negocio: datos para los tiquetes y reglas de rotación de lavadores.
--
-- Hasta hoy los tiquetes llevaban el nombre, el NIT, el correo de facturación y el mensaje de pie
-- escritos en el código, y las reglas de la cola de rotación (Plan M1) estaban fijas. Ahora viven
-- en una sola fila editable por gerencia. Todos los roles operativos la LEEN (los tiquetes los
-- imprimen el jefe de patio y el vigilante); solo gerencia la cambia. Cada cambio queda en la
-- bitácora (0044).
--
-- Reglas de rotación:
--   · rotacion_criterio = 'ultima_asignacion' (lo de siempre): el siguiente es quien lleva más
--     tiempo sin recibir un vehículo hoy; desempata la hora de llegada.
--                       = 'menos_vehiculos': el siguiente es quien lleva menos vehículos hoy
--     (regla 16: se mide en cantidad, no en ingresos); desempata la hora de llegada.
--   · rotacion_ocupado  = 'saltar' (lo de siempre): al lavador con un vehículo en proceso se le salta
--     y conserva su lugar para la siguiente ronda.
--                       = 'permitir': no se le salta; algunos lavan dos vehículos a la vez.

create table public.ajustes_negocio (
  id boolean primary key default true check (id),
  negocio_nombre text not null default 'Carwash SM' check (length(trim(negocio_nombre)) > 0),
  negocio_actividad text not null default 'Lavadero · Parqueadero',
  negocio_nit text,
  negocio_direccion text,
  negocio_telefono text,
  negocio_correo_factura text,
  tiquete_mensaje_pie text not null default 'Gracias por su visita',
  rotacion_criterio text not null default 'ultima_asignacion'
    check (rotacion_criterio in ('ultima_asignacion', 'menos_vehiculos')),
  rotacion_ocupado text not null default 'saltar' check (rotacion_ocupado in ('saltar', 'permitir')),
  actualizado_en timestamptz not null default now(),
  actualizado_por uuid default auth.uid()
);

-- Lo que antes estaba escrito en los tiquetes.
insert into public.ajustes_negocio (negocio_nit, negocio_correo_factura)
values ('1113661734-4', 'gerencia@carwashsm.com');

alter table public.ajustes_negocio enable row level security;
create policy ajustes_negocio_select on public.ajustes_negocio
  for select to authenticated
  using (interno.rol_actual() in ('admin', 'jefe_zona', 'vigilante') and interno.es_activo());
create policy ajustes_negocio_admin_update on public.ajustes_negocio
  for update to authenticated
  using (interno.es_admin() and interno.es_activo())
  with check (interno.es_admin() and interno.es_activo());
grant select, update on public.ajustes_negocio to authenticated;

create function interno.ajustes_negocio_sello() returns trigger
language plpgsql set search_path = public
as $$
begin
  NEW.actualizado_en := now();
  NEW.actualizado_por := auth.uid();
  return NEW;
end;
$$;

create trigger ajustes_negocio_sello before update on public.ajustes_negocio
  for each row execute function interno.ajustes_negocio_sello();

create trigger bitacora_ajustes_negocio_update after update on public.ajustes_negocio
  for each row execute function interno.bitacora_trigger(
    'cambiar_configuracion',
    'negocio_nombre', 'negocio_actividad', 'negocio_nit', 'negocio_direccion', 'negocio_telefono',
    'negocio_correo_factura', 'tiquete_mensaje_pie', 'rotacion_criterio', 'rotacion_ocupado'
  );
