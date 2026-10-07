-- Moto eléctrica: tipo de vehículo (categoría moto) SIN precio de lista. El jefe de patio digita el
-- valor acordado al registrar la orden; las comisiones siguen la misma regla de siempre (lavador
-- 40 % sobre el total, jefe de patio por la tarifa de servicios, negocio el resto).
-- `precio_abierto` marca los tipos que se cotizan a mano; no tienen filas en precios_combo_fijo ni
-- en precios de servicios, así que cambiar_tipo_orden ya los rechaza (no hay precio que recalcular).

alter table public.tipos_vehiculo
  add column if not exists precio_abierto boolean not null default false;

insert into public.tipos_vehiculo (nombre, categoria, precio_abierto)
select 'Moto eléctrica', 'moto', true
where not exists (select 1 from public.tipos_vehiculo where nombre = 'Moto eléctrica');
