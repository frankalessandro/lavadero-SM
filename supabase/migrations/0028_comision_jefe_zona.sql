-- Comisión de jefe de patio (3% del total, configurable) — se suma a la comisión de lavador
-- (40%) y negocio (el resto, ya no fijo en 60%: 100% - lavador% - jefeZona%). "El jefe de patio
-- en turno" se identifica por el responsable ACTUAL del turno de caja (jefe_zona) que está
-- abierto al momento de REGISTRAR el vehículo — createOrden ya exige ese turno abierto, así que
-- siempre hay alguien a quien atribuirle la comisión. Identificación por texto libre (responsable)
-- a propósito por ahora, no por una tabla de "jefes de zona" con id propio — puede refinarse más
-- adelante sin romper lo ya liquidado, porque liquidaciones_jefe_zona vive aparte y también usa
-- texto en vez de una FK.
alter table configuracion
  add column comision_jefe_zona_porcentaje numeric not null default 0.03
    check (comision_jefe_zona_porcentaje >= 0 and comision_jefe_zona_porcentaje < 1);

create table liquidaciones_jefe_zona (
  id uuid primary key default gen_random_uuid(),
  responsable text not null,
  periodo_inicio date not null,
  periodo_fin date not null,
  monto integer not null,
  pagada boolean not null default false,
  pagada_en timestamptz,
  creado_en timestamptz not null default now()
);
create index liquidaciones_jefe_zona_responsable_idx on liquidaciones_jefe_zona (responsable);

alter table ordenes
  add column jefe_zona_responsable text,
  add column comision_jefe_zona integer not null default 0,
  add column liquidacion_jefe_zona_id uuid references liquidaciones_jefe_zona(id);
