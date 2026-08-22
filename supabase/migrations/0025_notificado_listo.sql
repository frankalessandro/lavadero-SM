-- Check manual en el tablero de seguimiento (jefe de zona): "ya le avisamos al cliente que su
-- vehículo está listo" — puro control operativo, no dispara ningún efecto de negocio.
alter table ordenes
  add column notificado_listo boolean not null default false;
