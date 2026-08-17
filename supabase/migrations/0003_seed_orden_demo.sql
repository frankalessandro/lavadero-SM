-- Orden de ayer, entregada, para poder probar el autocompletado por placa en recepción
-- (buscarPorPlaca busca la última orden de esa placa sin importar el día).
insert into ordenes (
  placa, cliente_nombre, cliente_telefono, tipo_vehiculo_id, combo_id, lavador_id,
  precio, comision_lavador, comision_negocio, metodo_pago, estado, creado_en
)
select
  'AB123CD', 'Julián Vargas', '3001234567',
  (select id from tipos_vehiculo where nombre = 'Automóvil'),
  (select id from combos where nombre = 'Combo 2 — + Brillado' and id in (
    select combo_id from precios where tipo_vehiculo_id = (select id from tipos_vehiculo where nombre = 'Automóvil')
  )),
  (select id from lavadores where nombre = 'Carlos Pérez'),
  22000, 8800, 13200, 'efectivo', 'entregado', now() - interval '1 day';
