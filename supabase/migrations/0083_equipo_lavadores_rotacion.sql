-- 0083 — El equipo real de lavadores y su lugar en la rotación, todo desde Personal.
--
-- Los nombres de la rotación venían de la carga inicial (Luis, Moises, Ivan, Javier). El equipo
-- actual, según el cronograma de la jefa, es Luis Mario Garcés, José Jair Morales, Iván Hernández
-- y Gabriel Gallardo; Moisés y Javier ya no trabajan (siguen inactivos, con su histórico).
--
-- El lugar de cada uno en la rotación (`posicion_cronograma_base`, 0-3) ya existía pero no se
-- podía editar desde la app; ahora se elige en Personal › Lavadores y se libera al inactivar, así
-- quien entre a cubrir un lugar hereda su turno en la rotación. Esta migración deja los datos de
-- hoy en ese estado y reescribe los descansos de hoy en adelante.
--
-- Los descansos ya pasados NO se tocan: quedan con quien descansó de verdad ese día (histórico).
-- Idempotente: se puede volver a aplicar.

-- 1) Libera los lugares de quienes ya no están (índice único parcial: 1 lavador por lugar).
update public.lavadores set posicion_cronograma_base = null where nombre in ('Moises', 'Javier') and not activo;

-- 2) Nombres completos y lugar en la rotación (mismo orden del Excel: lunes de la semana 1).
update public.lavadores set nombre = 'Luis Mario Garcés', posicion_cronograma_base = 0 where nombre in ('Luis', 'Luis Mario Garcés');
update public.lavadores set nombre = 'José Jair Morales', posicion_cronograma_base = 1 where nombre in ('Jair', 'José Jair Morales');
update public.lavadores set nombre = 'Iván Hernández', posicion_cronograma_base = 2 where nombre in ('Ivan', 'Iván Hernández');
update public.lavadores set nombre = 'Gabriel Gallardo', posicion_cronograma_base = 3 where nombre in ('Gabriel', 'Gabriel Gallardo');

-- 3) Descansos de hoy en adelante según la rotación fija (la misma fórmula de
--    `posicionQueDescansa` en src/data/asistenciaLavadores.ts; semana 1 = lunes 17 ago 2026).
--    Solo filas sin cambio a mano (`actualizado_por is null`).
update public.dias_descanso d
set lavador_id = l.id, actualizado_en = now()
from public.lavadores l
where d.fecha >= (now() at time zone 'America/Bogota')::date
  and d.actualizado_por is null
  and l.posicion_cronograma_base = (
    ((d.fecha - date '2026-08-17') % 7) + 4 - (((d.fecha - date '2026-08-17') / 7) % 4)
  ) % 4
  and d.lavador_id is distinct from l.id;
