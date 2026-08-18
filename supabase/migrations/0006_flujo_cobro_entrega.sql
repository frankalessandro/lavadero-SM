-- El cobro pasa de "al registrar" a "al entregar" (M2/M3 reales): el jefe de zona registra
-- el vehículo sin cobrar, lo marca listo cuando el lavador termina, y el cobro + entrega
-- ocurren juntos en caja. metodo_pago ya no se conoce al crear la orden.
alter table ordenes alter column metodo_pago drop not null;
alter table ordenes add column lista_en timestamptz;
alter table ordenes add column entregada_en timestamptz;
