-- 0082 — Cronograma mensual de lavadores: quién entra a las 7am y lava el baño, quién sale a las
-- 7pm, seguimiento de si el baño se hizo, y permisos.
--
-- Contexto: `dias_descanso` (0016) ya guarda quién descansa cada lunes-jueves, generado por la
-- rotación fija. El cronograma de la jefa (Excel, sep-dic 2026) suma dos turnos que se derivan de
-- ese descanso: "entra 7am + lava baño" = quien descansó el día anterior (martes a viernes) y
-- "sale 7pm" = quien descansa al día siguiente (el viernes sale quien entró). Eso se calcula en el
-- cliente desde `dias_descanso`; esta tabla solo guarda lo que NO se deriva:
--   · el cambio a mano ("entre los muchachos se cambiaron"): bano_lavador_id / sale_lavador_id,
--   · el seguimiento: si el baño se hizo, cuándo y quién lo marcó.
-- Una fila por fecha, creada la primera vez que alguien cambia o marca algo ese día.
--
-- `permisos_lavadores`: un lavador con permiso ese día no trabaja y NO se le marca asistencia (ni
-- cuenta como falta). Se anula con la columna `anulado`, nunca se borra (regla 13).
--
-- Todo queda en la bitácora (0044). `dias_descanso` solo registra UPDATE (el INSERT lo hace la
-- generación automática de la rotación y llenaría la bitácora de ruido).

create table public.cronograma_dias (
  id uuid primary key default gen_random_uuid(),
  fecha date not null unique,
  bano_lavador_id uuid references public.lavadores(id),
  sale_lavador_id uuid references public.lavadores(id),
  bano_hecho_en timestamptz,
  bano_hecho_por text,
  actualizado_en timestamptz not null default now(),
  actualizado_por text
);

create table public.permisos_lavadores (
  id uuid primary key default gen_random_uuid(),
  lavador_id uuid not null references public.lavadores(id),
  fecha date not null,
  motivo text not null check (length(trim(motivo)) >= 3),
  registrado_por text not null,
  anulado boolean not null default false,
  creado_en timestamptz not null default now(),
  unique (lavador_id, fecha)
);
create index permisos_lavadores_fecha_idx on public.permisos_lavadores (fecha);

-- ── RLS: gerencia y jefe de patio (quien coordina el cronograma); vigilante sin acceso ───────
alter table public.cronograma_dias enable row level security;
create policy cronograma_dias_select on public.cronograma_dias
  for select to authenticated
  using ((interno.es_admin() or interno.rol_actual() = 'jefe_zona') and interno.es_activo());
create policy cronograma_dias_insert on public.cronograma_dias
  for insert to authenticated
  with check ((interno.es_admin() or interno.rol_actual() = 'jefe_zona') and interno.es_activo());
create policy cronograma_dias_update on public.cronograma_dias
  for update to authenticated
  using ((interno.es_admin() or interno.rol_actual() = 'jefe_zona') and interno.es_activo())
  with check ((interno.es_admin() or interno.rol_actual() = 'jefe_zona') and interno.es_activo());
grant select, insert, update on public.cronograma_dias to authenticated;

alter table public.permisos_lavadores enable row level security;
create policy permisos_lavadores_select on public.permisos_lavadores
  for select to authenticated
  using ((interno.es_admin() or interno.rol_actual() = 'jefe_zona') and interno.es_activo());
create policy permisos_lavadores_insert on public.permisos_lavadores
  for insert to authenticated
  with check ((interno.es_admin() or interno.rol_actual() = 'jefe_zona') and interno.es_activo());
create policy permisos_lavadores_update on public.permisos_lavadores
  for update to authenticated
  using ((interno.es_admin() or interno.rol_actual() = 'jefe_zona') and interno.es_activo())
  with check ((interno.es_admin() or interno.rol_actual() = 'jefe_zona') and interno.es_activo());
grant select, insert, update on public.permisos_lavadores to authenticated;

-- ── Bitácora ─────────────────────────────────────────────────────────────────────────────────
create trigger bitacora_cronograma_dias_insert after insert on public.cronograma_dias
  for each row execute function interno.bitacora_trigger('crear');
create trigger bitacora_cronograma_dias_update after update on public.cronograma_dias
  for each row execute function interno.bitacora_trigger(
    'editar', 'bano_lavador_id', 'sale_lavador_id', 'bano_hecho_por'
  );

create trigger bitacora_permisos_lavadores_insert after insert on public.permisos_lavadores
  for each row execute function interno.bitacora_trigger('crear');
create trigger bitacora_permisos_lavadores_update after update on public.permisos_lavadores
  for each row execute function interno.bitacora_trigger('editar', 'anulado', 'motivo');

create trigger bitacora_dias_descanso_update after update on public.dias_descanso
  for each row execute function interno.bitacora_trigger('editar', 'lavador_id');
