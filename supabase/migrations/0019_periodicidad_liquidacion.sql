-- Regla de negocio 4 (parametrizable): periodicidad normal de liquidación de comisiones,
-- diaria o semanal, elegida por el negocio en Configuración. No reemplaza la excepción de
-- pago diario por lavador (lavadores.pago_diario) ni obliga a liquidar — el botón de generar
-- liquidación sigue siendo manual/opcional, esto solo fija el rango que propone por defecto.
alter table configuracion
  add column periodicidad_liquidacion text not null default 'diaria'
    check (periodicidad_liquidacion in ('diaria', 'semanal'));
