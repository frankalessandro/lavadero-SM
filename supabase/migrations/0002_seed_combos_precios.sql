-- Catálogo semilla (Plan de Alcance §5) y precios de ejemplo — pendientes de la lista
-- real que debe suministrar el cliente (Plan §11). No usar estos valores como referencia de negocio.
--
-- Los nombres de combo se repiten entre categorías ("Combo 2 — + Brillado" existe para auto
-- y para moto), así que cada bloque hace el insert + join de precios dentro del mismo CTE
-- para no cruzar accidentalmente con la fila de la otra categoría.

with auto_combos as (
  insert into combos (nombre)
  values
    ('Combo 1 — Lavado y aspirado'),
    ('Combo 2 — + Brillado'),
    ('Combo 3 — + Lavado de motor'),
    ('Combo 4 — + Brillado + lavado de motor'),
    ('Combo 5 — + Rasqueteada'),
    ('Combo 6 — + Lavado de cojinería')
  returning id, nombre
)
insert into precios (combo_id, tipo_vehiculo_id, precio)
select ac.id, t.id, v.precio
from (values
  ('Combo 1 — Lavado y aspirado', 'Automóvil', 15000),
  ('Combo 1 — Lavado y aspirado', 'Camioneta', 18000),
  ('Combo 2 — + Brillado', 'Automóvil', 22000),
  ('Combo 2 — + Brillado', 'Camioneta', 26000),
  ('Combo 3 — + Lavado de motor', 'Automóvil', 25000),
  ('Combo 3 — + Lavado de motor', 'Camioneta', 29000),
  ('Combo 4 — + Brillado + lavado de motor', 'Automóvil', 32000),
  ('Combo 4 — + Brillado + lavado de motor', 'Camioneta', 37000),
  ('Combo 5 — + Rasqueteada', 'Automóvil', 28000),
  ('Combo 5 — + Rasqueteada', 'Camioneta', 32000),
  ('Combo 6 — + Lavado de cojinería', 'Automóvil', 30000),
  ('Combo 6 — + Lavado de cojinería', 'Camioneta', 35000)
) as v(combo_nombre, tipo_nombre, precio)
join auto_combos ac on ac.nombre = v.combo_nombre
join tipos_vehiculo t on t.nombre = v.tipo_nombre;

with moto_combos as (
  insert into combos (nombre)
  values
    ('Combo 1 — Lavado y desengrasada'),
    ('Combo 2 — + Brillado'),
    ('Combo 3 — Lavado y grafitada'),
    ('Combo 4 — + Desengrasada + brillado + grafitada')
  returning id, nombre
),
moto_tipo as (
  select id from tipos_vehiculo where nombre = 'Motocicleta'
)
insert into precios (combo_id, tipo_vehiculo_id, precio)
select mc.id, mt.id, v.precio
from (values
  ('Combo 1 — Lavado y desengrasada', 8000),
  ('Combo 2 — + Brillado', 12000),
  ('Combo 3 — Lavado y grafitada', 10000),
  ('Combo 4 — + Desengrasada + brillado + grafitada', 16000)
) as v(combo_nombre, precio)
join moto_combos mc on mc.nombre = v.combo_nombre
cross join moto_tipo mt;
