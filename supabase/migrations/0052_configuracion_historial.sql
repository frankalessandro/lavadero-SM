-- Historial de `configuracion` — poder responder "qué % de comisión / qué base regía el 20 de
-- agosto".
--
-- `configuracion` es una sola fila que se sobrescribe. La comisión queda bien fotografiada por
-- orden al crearla (regla 1), pero no se puede reconstruir el estado de la config en una fecha
-- pasada. La bitácora (0044) registra el EVENTO de cambio (quién, cuándo, antes→después); esto
-- guarda el ESTADO puntual como una línea de tiempo consultable.
--
-- Modelo: log append-only. Cada fila = "esta config rige desde `vigente_desde`". El estado en
-- una fecha X = la fila con el mayor `vigente_desde <= X`.

create table public.configuracion_historial (
  id bigint generated always as identity primary key,
  comision_lavador_porcentaje numeric not null,
  comision_jefe_zona_porcentaje numeric not null,
  comision_base text not null,
  recargo_alto_cilindraje integer not null,
  periodicidad_liquidacion text not null,
  vigente_desde timestamptz not null default now(),
  cambiado_por uuid default auth.uid()
);
create index configuracion_historial_vigente_idx on public.configuracion_historial (vigente_desde desc);

alter table public.configuracion_historial enable row level security;
create policy configuracion_historial_admin_select on public.configuracion_historial
  for select to authenticated using (interno.es_admin() and interno.es_activo());
grant select on public.configuracion_historial to authenticated;
-- Sin policies de escritura: lo llena el trigger (definer) y la fila semilla de abajo.

-- Fila semilla con el estado actual. `vigente_desde` = ahora: antes de esta migración no hay
-- historial y la bitácora cubre los cambios recientes.
insert into public.configuracion_historial (
  comision_lavador_porcentaje, comision_jefe_zona_porcentaje, comision_base,
  recargo_alto_cilindraje, periodicidad_liquidacion
)
select comision_lavador_porcentaje, comision_jefe_zona_porcentaje, comision_base,
       recargo_alto_cilindraje, periodicidad_liquidacion
from public.configuracion;

-- Cada UPDATE de `configuracion` agrega una fila con el estado NUEVO.
create function interno.configuracion_snapshot()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if NEW is distinct from OLD then
    insert into public.configuracion_historial (
      comision_lavador_porcentaje, comision_jefe_zona_porcentaje, comision_base,
      recargo_alto_cilindraje, periodicidad_liquidacion
    ) values (
      NEW.comision_lavador_porcentaje, NEW.comision_jefe_zona_porcentaje, NEW.comision_base,
      NEW.recargo_alto_cilindraje, NEW.periodicidad_liquidacion
    );
  end if;
  return NEW;
end;
$$;

revoke execute on function interno.configuracion_snapshot() from public, anon, authenticated;

create trigger configuracion_snapshot_trigger
  after update on public.configuracion
  for each row execute function interno.configuracion_snapshot();
