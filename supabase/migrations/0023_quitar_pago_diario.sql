-- Regla de negocio 4: la excepción de "pago diario" por lavador ya no es necesaria — admin puede
-- generar liquidación diaria o semanal para CUALQUIER lavador desde /admin/liquidaciones (ver
-- 0022 en adelante / generarLiquidacion), así que no hace falta marcar de antemano quién queda
-- fuera de la liquidación semanal general. Se decide y se hace, sin bandera persistida.
alter table lavadores drop column pago_diario;
