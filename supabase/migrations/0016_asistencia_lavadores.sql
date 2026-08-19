-- M9: asistencia y cronograma de descansos de lavadores.
--
-- dias_descanso: una fila reservada por fecha (regla operativa actual — 4 lavadores, uno
-- descansa cada lunes-jueves, viernes-domingo trabajan todos por ser los días de más
-- movimiento; ver Cronograma_Descanso_Ago-Dic_2026.xlsx). `unique(fecha)` es intencional:
-- un cambio entre trabajadores (swap) es un UPDATE de `lavador_id` sobre la fila existente
-- de esa fecha, nunca un insert/delete — ningún rol tiene grant de DELETE en este proyecto
-- (ver db/postgrest-roles.local.sql), así que el historial de quién descansó cada día queda
-- siempre como una fila viva que se corrige, no se borra.
create table dias_descanso (
  id uuid primary key default gen_random_uuid(),
  fecha date not null unique,
  lavador_id uuid not null references lavadores(id),
  motivo text,
  actualizado_en timestamptz not null default now(),
  actualizado_por text
);

-- asistencias_lavadores: marca de llegada, registrada una sola vez por el jefe de zona
-- (sin salida — ver CLAUDE.md M9). `unique(lavador_id, fecha)` evita marcar la misma
-- asistencia dos veces el mismo día.
create table asistencias_lavadores (
  id uuid primary key default gen_random_uuid(),
  lavador_id uuid not null references lavadores(id),
  fecha date not null,
  hora_entrada timestamptz not null default now(),
  registrado_por text not null,
  creado_en timestamptz not null default now(),
  unique (lavador_id, fecha)
);

-- RLS: mismo patrón que `lavadores`/`ordenes` en 0012_rls_policies.sql — admin CRUD (sin
-- delete), jefe_zona select/insert/update (es quien opera el cronograma y marca asistencia
-- en el día a día), vigilante sin acceso.
alter table dias_descanso enable row level security;
create policy dias_descanso_admin_select on dias_descanso for select to authenticated using (public.es_admin() and public.es_activo());
create policy dias_descanso_admin_insert on dias_descanso for insert to authenticated with check (public.es_admin() and public.es_activo());
create policy dias_descanso_admin_update on dias_descanso for update to authenticated using (public.es_admin() and public.es_activo()) with check (public.es_admin() and public.es_activo());
create policy dias_descanso_jefe_zona_select on dias_descanso for select to authenticated using (public.rol_actual() = 'jefe_zona' and public.es_activo());
create policy dias_descanso_jefe_zona_insert on dias_descanso for insert to authenticated with check (public.rol_actual() = 'jefe_zona' and public.es_activo());
create policy dias_descanso_jefe_zona_update on dias_descanso for update to authenticated using (public.rol_actual() = 'jefe_zona' and public.es_activo()) with check (public.rol_actual() = 'jefe_zona' and public.es_activo());

alter table asistencias_lavadores enable row level security;
create policy asistencias_lavadores_admin_select on asistencias_lavadores for select to authenticated using (public.es_admin() and public.es_activo());
create policy asistencias_lavadores_admin_insert on asistencias_lavadores for insert to authenticated with check (public.es_admin() and public.es_activo());
create policy asistencias_lavadores_admin_update on asistencias_lavadores for update to authenticated using (public.es_admin() and public.es_activo()) with check (public.es_admin() and public.es_activo());
create policy asistencias_lavadores_jefe_zona_select on asistencias_lavadores for select to authenticated using (public.rol_actual() = 'jefe_zona' and public.es_activo());
create policy asistencias_lavadores_jefe_zona_insert on asistencias_lavadores for insert to authenticated with check (public.rol_actual() = 'jefe_zona' and public.es_activo());
create policy asistencias_lavadores_jefe_zona_update on asistencias_lavadores for update to authenticated using (public.rol_actual() = 'jefe_zona' and public.es_activo()) with check (public.rol_actual() = 'jefe_zona' and public.es_activo());
