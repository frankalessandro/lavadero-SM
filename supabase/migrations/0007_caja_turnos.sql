-- M5 — Caja y turnos. Cada responsable (jefe de zona / vigilante) abre y cierra su propio
-- turno, con base inicial, arqueo ciego al cierre y justificación obligatoria de diferencias
-- (reglas de negocio 12, 14, 15). Los movimientos de dinero (órdenes, estancias, gastos en
-- caja) se etiquetan con el turno abierto al momento de registrarse, para poder calcular el
-- valor esperado del arqueo — si no hay turno abierto, el movimiento queda sin turno asociado
-- (no se bloquea la operación, solo no entra en ningún arqueo).

create table turnos_caja (
  id uuid primary key default gen_random_uuid(),
  rol text not null check (rol in ('jefe_zona', 'vigilante')),
  responsable text not null,
  base_inicial integer not null check (base_inicial >= 0),
  abierto_en timestamptz not null default now(),
  cerrado boolean not null default false,
  conteo_fisico integer,
  valor_esperado integer,
  diferencia integer,
  justificacion_diferencia text,
  cerrado_por text,
  cerrado_en timestamptz,
  recibido_por text
);
-- Un solo turno abierto por rol a la vez.
create unique index turnos_caja_un_abierto_por_rol on turnos_caja (rol) where not cerrado;

alter table ordenes add column turno_id uuid references turnos_caja(id);
alter table estancias_parqueadero add column turno_id uuid references turnos_caja(id);
alter table gastos add column turno_id uuid references turnos_caja(id);
