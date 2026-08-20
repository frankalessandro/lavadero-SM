-- Responsable de turno compartido entre Caja y Asistencia (ambas pantallas de jefe de zona):
-- `responsable` sigue siendo quién ABRIÓ el turno (inmutable, como hoy); `responsable_actual`
-- es quién está a cargo AHORA — normalmente el mismo, pero se puede transferir a mitad de turno
-- (ej. el jefe de zona se ausenta y deja a alguien más a cargo) sin cerrar y reabrir turno.
alter table turnos_caja add column responsable_actual text;
update turnos_caja set responsable_actual = responsable where responsable_actual is null;

-- Log append-only de traspasos — ningún rol tiene grant de DELETE en este proyecto (ver
-- db/postgrest-roles.local.sql), así que la trazabilidad de "quién le pasó la responsabilidad a
-- quién y cuándo" queda completa sin necesidad de guardar históricos en la propia fila del turno.
create table traspasos_turno (
  id uuid primary key default gen_random_uuid(),
  turno_id uuid not null references turnos_caja(id),
  de text not null,
  a text not null,
  hecho_en timestamptz not null default now()
);

-- RLS espejo de turnos_caja (0012_rls_policies.sql): admin CRUD (sin delete/update, es un log),
-- jefe_zona/vigilante select+insert solo sobre traspasos de turnos de su propio rol.
-- Los helpers ya NO viven en `public` (movidos a `interno` en 0017_endurecer_advisor_seguridad.sql)
-- — hay que referenciarlos con ese schema, no `public.es_admin()` como en las migraciones viejas.
alter table traspasos_turno enable row level security;
create policy traspasos_admin_select on traspasos_turno for select to authenticated using (interno.es_admin() and interno.es_activo());
create policy traspasos_admin_insert on traspasos_turno for insert to authenticated with check (interno.es_admin() and interno.es_activo());
create policy traspasos_jefe_zona_select on traspasos_turno for select to authenticated using (
  interno.rol_actual() = 'jefe_zona' and interno.es_activo()
  and exists (select 1 from turnos_caja t where t.id = traspasos_turno.turno_id and t.rol = 'jefe_zona')
);
create policy traspasos_jefe_zona_insert on traspasos_turno for insert to authenticated with check (
  interno.rol_actual() = 'jefe_zona' and interno.es_activo()
  and exists (select 1 from turnos_caja t where t.id = traspasos_turno.turno_id and t.rol = 'jefe_zona')
);
create policy traspasos_vigilante_select on traspasos_turno for select to authenticated using (
  interno.rol_actual() = 'vigilante' and interno.es_activo()
  and exists (select 1 from turnos_caja t where t.id = traspasos_turno.turno_id and t.rol = 'vigilante')
);
create policy traspasos_vigilante_insert on traspasos_turno for insert to authenticated with check (
  interno.rol_actual() = 'vigilante' and interno.es_activo()
  and exists (select 1 from turnos_caja t where t.id = traspasos_turno.turno_id and t.rol = 'vigilante')
);
