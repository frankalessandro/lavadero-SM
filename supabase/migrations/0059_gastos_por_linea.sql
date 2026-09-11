-- 0059 — Línea de negocio en las categorías de gasto.
--
-- La cascada de rentabilidad mezclaba las tres fuentes de ingreso en un solo embudo, así que la
-- barra de "comisión de lavadores" se dibujaba como porcentaje de los ingresos TOTALES (lavado +
-- parqueadero + productos). Como productos y parqueadero no pagan comisión, el badge decía 40 %
-- pero la barra mostraba otra cosa, y bajaba cada vez que se vendían más gaseosas: el 60/40 del
-- lavado quedaba diluido por líneas de negocio que no tienen nada que ver con él.
--
-- La cascada pasa a tener un P&L por línea (lavadero / productos / parqueadero) y los gastos se
-- imputan a la línea que los causa. Esta columna es lo único que la base necesita para eso.
--
-- `linea` es NULLABLE a propósito: NULL = gasto general/compartido (arriendo, servicios públicos,
-- nómina administrativa) que sirve a las tres líneas por igual. Esos NO se reparten con una regla
-- inventada — se restan una sola vez del margen bruto consolidado, después de las tres líneas.
-- Repartir arriendo "por ingresos" o "por metro cuadrado" sería un supuesto contable que el
-- negocio no ha definido, y una utilidad por línea construida sobre un supuesto inventado es peor
-- que una utilidad por línea que dice honestamente qué parte no se pudo atribuir.
--
-- La utilidad neta del periodo NO cambia con esta migración: la suma de los cuatro cubos
-- (lavadero + productos + parqueadero + generales) es exactamente el mismo total de gastos que se
-- restaba antes. Solo cambia en qué renglón se ve.

alter table categorias_gasto
  add column linea text
    check (linea is null or linea in ('lavadero', 'productos', 'parqueadero'));

comment on column categorias_gasto.linea is
  'Línea de negocio a la que se imputan los gastos de esta categoría. NULL = gasto general/compartido: no se atribuye a ninguna línea y se resta del consolidado.';

-- Asignación inicial. Solo se taguea lo que es inequívocamente atribuible; el resto queda general.
-- "Insumos de lavado" es el único caso claro hoy — jabón, cera y espuma solo existen por el lavado.
-- "Nómina/comisiones", "Servicios públicos", "Mantenimiento" y "Otros" quedan en NULL: son
-- compartidos, y además la comisión de lavadores y jefe de patio ya se cuenta aparte (sale de
-- `ordenes.comision_*`, no de la tabla de gastos), así que tagear "Nómina/comisiones" a lavadero
-- invitaría a contarla dos veces.
update categorias_gasto set linea = 'lavadero' where nombre = 'Insumos de lavado';
