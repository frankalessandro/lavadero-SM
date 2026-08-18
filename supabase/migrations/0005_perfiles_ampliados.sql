-- Perfiles más completos para los formularios de creación de M1/M8 — no solo un nombre.

-- Categoría explícita (auto/moto) en vez de inferirla de qué precios existen: "Combo 2" del
-- catálogo de autos y el de motos comparten nombre pero son catálogos distintos (Plan §5).
alter table tipos_vehiculo add column categoria text;
update tipos_vehiculo set categoria = case when nombre = 'Motocicleta' then 'moto' else 'auto' end;
alter table tipos_vehiculo alter column categoria set not null;
alter table tipos_vehiculo add constraint tipos_vehiculo_categoria_check check (categoria in ('auto', 'moto'));

alter table combos add column descripcion text;
alter table combos add column categoria text;
update combos set categoria = case
  when id in (
    select p.combo_id from precios p
    join tipos_vehiculo t on t.id = p.tipo_vehiculo_id
    where t.categoria = 'moto'
  ) then 'moto'
  else 'auto'
end;
alter table combos alter column categoria set not null;
alter table combos add constraint combos_categoria_check check (categoria in ('auto', 'moto'));

-- Perfil de lavador (Plan §M8: "datos personales, contacto, fecha de ingreso, fecha de
-- cumpleaños, foto opcional"). Foto queda fuera — no hay storage configurado todavía.
alter table lavadores add column telefono text;
alter table lavadores add column fecha_ingreso date not null default current_date;
alter table lavadores add column fecha_cumpleanos date;
