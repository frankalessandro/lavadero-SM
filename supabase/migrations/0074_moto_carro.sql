-- Moto carro / moto con remolque: tipo de vehículo nuevo (categoría moto) que se cobra a un
-- precio único de $40.000 (confirmado con Alessandro). Se modela como un combo de precio fijo
-- habilitado solo para ese tipo, así no aparece en los combos de moto normales.
-- Con guards NOT EXISTS para poder re-aplicarse.

insert into tipos_vehiculo (nombre, categoria)
select 'Moto carro / moto con remolque', 'moto'
where not exists (select 1 from tipos_vehiculo where nombre = 'Moto carro / moto con remolque');

insert into combos (nombre, descripcion, categoria, precio_fijo)
select 'Moto carro', 'Moto carro o moto con remolque', 'moto', true
where not exists (select 1 from combos where nombre = 'Moto carro' and categoria = 'moto');

insert into precios_combo_fijo (combo_id, tipo_vehiculo_id, precio)
select c.id, t.id, 40000
from combos c, tipos_vehiculo t
where c.nombre = 'Moto carro' and c.categoria = 'moto'
  and t.nombre = 'Moto carro / moto con remolque'
on conflict (combo_id, tipo_vehiculo_id) do nothing;
