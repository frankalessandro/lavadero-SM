-- Fortalece el cronograma fijo de M9 (0016_asistencia_lavadores.sql): la posición de cada
-- lavador en el orden base (lunes/martes/miércoles/jueves de la semana 1, ver
-- src/data/asistenciaLavadores.ts) queda vinculada a su `id`, no a su `nombre`. Antes
-- `resolverIdsOrdenBase()` buscaba por nombre exacto ('Luis','Moises','Ivan','Javier') en cada
-- visita a la pantalla — si alguno cambiaba de nombre o se inactivaba, la búsqueda fallaba y el
-- cronograma dejaba de generarse. Con esta columna, renombrar un lavador ya no rompe nada.
alter table lavadores
  add column posicion_cronograma_base integer check (posicion_cronograma_base between 0 and 3);

create unique index lavadores_posicion_cronograma_base_key
  on lavadores (posicion_cronograma_base)
  where posicion_cronograma_base is not null;

-- Backfill único con el mapeo original del Excel (lunes=0 ... jueves=3, ver
-- Cronograma_Descanso_Ago-Dic_2026.xlsx) — a partir de aquí la posición vive en la fila, no
-- se vuelve a resolver por nombre.
update lavadores set posicion_cronograma_base = 0 where nombre = 'Luis';
update lavadores set posicion_cronograma_base = 1 where nombre = 'Moises';
update lavadores set posicion_cronograma_base = 2 where nombre = 'Ivan';
update lavadores set posicion_cronograma_base = 3 where nombre = 'Javier';
