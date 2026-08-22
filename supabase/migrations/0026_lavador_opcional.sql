-- Permite registrar un vehículo sin lavador asignado (todos ocupados, cliente hace cola) — se
-- asigna después desde el tablero de seguimiento con la misma acción que ya existía de
-- reasignar. No cambia la regla de negocio 3 (un vehículo = un solo lavador, una vez asignado).
alter table ordenes
  alter column lavador_id drop not null;
