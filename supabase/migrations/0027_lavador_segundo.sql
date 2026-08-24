-- Lavar entre 2 (a criterio de recepción/jefe de zona, caso a caso): una orden puede tener un
-- segundo lavador además del principal. `lavador_id_2` es el segundo lavador asignado a la orden
-- (regla de negocio 3 sigue vigente para el principal: un vehículo puede lavarse entre dos, pero
-- sigue siendo UNA orden). `liquidacion_id_2` es independiente de `liquidacion_id` porque cada
-- lavador puede liquidarse en un momento distinto: la comisión total de la orden se reparte
-- 50/50 entre ambos (ver comisionParaLavador en src/data/liquidaciones.ts), y cada mitad se marca
-- como liquidada por separado sin afectar la liquidación del otro.
alter table ordenes
  add column lavador_id_2 uuid references lavadores(id),
  add column liquidacion_id_2 uuid references liquidaciones(id);
