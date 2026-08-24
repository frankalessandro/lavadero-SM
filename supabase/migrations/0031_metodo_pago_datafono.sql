-- Agrega 'datafono' (pago con tarjeta en el POS físico) como tercer método de pago, junto a
-- 'efectivo' y 'transferencia', en las tres tablas que lo usan. No es efectivo físico para el
-- arqueo (calcularValorEsperado en src/data/turnos.ts ya solo cuenta 'efectivo', así que datáfono
-- queda excluido automáticamente, igual que transferencia) pero sí cuenta como ingreso/ganancia
-- del día. Cuánto de lo cobrado por datáfono llega neto a la cuenta (descuento de la pasarela) es
-- una configuración pendiente, todavía no modelada.

alter table ordenes drop constraint ordenes_metodo_pago_check;
alter table ordenes add constraint ordenes_metodo_pago_check check (metodo_pago in ('efectivo', 'transferencia', 'datafono'));

alter table ventas drop constraint ventas_metodo_pago_check;
alter table ventas add constraint ventas_metodo_pago_check check (metodo_pago in ('efectivo', 'transferencia', 'datafono'));

alter table estancias_parqueadero drop constraint estancias_parqueadero_metodo_pago_check;
alter table estancias_parqueadero add constraint estancias_parqueadero_metodo_pago_check check (metodo_pago in ('efectivo', 'transferencia', 'datafono'));
