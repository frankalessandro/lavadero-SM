-- Lista de precios real de combos suministrada por el cliente (reemplaza los combos de
-- ejemplo de 0002_seed_combos_precios.sql). Automóvil/Camioneta/Motocicleta ya existen desde
-- el catálogo semilla de 0001_init_schema.sql — solo falta "Camioneta de platón" (categoría
-- auto). Escrita con guards NOT EXISTS para poder aplicarse tanto sobre una base fresca donde
-- 0001..0009 corrieron en orden (combos de ejemplo de 0002 ya insertados) como sobre la base
-- de desarrollo actual, donde el catálogo de combos fue limpiado manualmente y está vacío.

insert into tipos_vehiculo (nombre, categoria)
select 'Camioneta de platón', 'auto'
where not exists (select 1 from tipos_vehiculo where nombre = 'Camioneta de platón');

-- Los combos de ejemplo de 0002 (si existen) quedan inactivos en vez de borrados —
-- filosofía "nunca se elimina" (regla de negocio 5) aplicada también a maestros de combos.
update combos set activo = false
where categoria = 'auto' and nombre in (
  'Combo 1 — Lavado y aspirado', 'Combo 2 — + Brillado', 'Combo 3 — + Lavado de motor',
  'Combo 4 — + Brillado + lavado de motor', 'Combo 5 — + Rasqueteada', 'Combo 6 — + Lavado de cojinería'
);
update combos set activo = false
where categoria = 'moto' and nombre in (
  'Combo 1 — Lavado y desengrasada', 'Combo 2 — + Brillado',
  'Combo 3 — Lavado y grafitada', 'Combo 4 — + Desengrasada + brillado + grafitada'
);

with auto_combos as (
  insert into combos (nombre, descripcion, categoria)
  select v.nombre, v.descripcion, 'auto'
  from (values
    ('Combo 1', 'Lavado y aspirado'),
    ('Combo 2', 'Lavado + aspirado + brillado'),
    ('Combo 3', 'Lavado + aspirado + rasqueteada'),
    ('Combo 4', 'Lavado + aspirado + lavado de motor'),
    ('Combo 5', 'Lavado + aspirado + brillado + lavado de motor'),
    ('Combo 6', 'Lavado + aspirado + brillado + lavado de motor + rasqueteada')
  ) as v(nombre, descripcion)
  where not exists (
    select 1 from combos c where c.nombre = v.nombre and c.categoria = 'auto' and c.activo
  )
  returning id, nombre
)
insert into precios (combo_id, tipo_vehiculo_id, precio)
select ac.id, t.id, v.precio
from (values
  ('Combo 1', 'Automóvil', 30000),
  ('Combo 1', 'Camioneta', 40000),
  ('Combo 1', 'Camioneta de platón', 50000),
  ('Combo 2', 'Automóvil', 60000),
  ('Combo 2', 'Camioneta', 70000),
  ('Combo 2', 'Camioneta de platón', 80000),
  ('Combo 3', 'Automóvil', 60000),
  ('Combo 3', 'Camioneta', 70000),
  ('Combo 3', 'Camioneta de platón', 80000),
  ('Combo 4', 'Automóvil', 90000),
  ('Combo 4', 'Camioneta', 100000),
  ('Combo 4', 'Camioneta de platón', 110000),
  ('Combo 5', 'Automóvil', 120000),
  ('Combo 5', 'Camioneta', 130000),
  ('Combo 5', 'Camioneta de platón', 140000),
  ('Combo 6', 'Automóvil', 150000),
  ('Combo 6', 'Camioneta', 160000),
  ('Combo 6', 'Camioneta de platón', 170000)
) as v(combo_nombre, tipo_nombre, precio)
join auto_combos ac on ac.nombre = v.combo_nombre
join tipos_vehiculo t on t.nombre = v.tipo_nombre;

with moto_combos as (
  insert into combos (nombre, descripcion, categoria)
  select v.nombre, v.descripcion, 'moto'
  from (values
    ('Combo 1', 'Lavado y desengrasada'),
    ('Combo 2', 'Lavado + desengrasada + brillado + grafitada')
  ) as v(nombre, descripcion)
  where not exists (
    select 1 from combos c where c.nombre = v.nombre and c.categoria = 'moto' and c.activo
  )
  returning id, nombre
),
moto_tipo as (
  select id from tipos_vehiculo where nombre = 'Motocicleta'
)
insert into precios (combo_id, tipo_vehiculo_id, precio)
select mc.id, mt.id, v.precio
from (values
  ('Combo 1', 25000),
  ('Combo 2', 35000)
) as v(combo_nombre, precio)
join moto_combos mc on mc.nombre = v.combo_nombre
cross join moto_tipo mt;
