-- KPIs de tiempo (M3/M10): cuánto duró el lavado (creado_en → lista_en) y cuánto se demoró
-- el cliente en reclamar el vehículo ya lavado (lista_en → entregada_en). Se guardan en segundos
-- enteros al momento de cada transición (marcarListo / cobrarYEntregarOrden), no se recalculan
-- después — mismo criterio que el resto de columnas de auditoría de ordenes, quedan fijas.
alter table ordenes add column tiempo_lavado_segundos integer;
alter table ordenes add column tiempo_espera_entrega_segundos integer;
