-- Backfill de la comisión de jefe de patio para las órdenes anteriores a 0028
-- (2026-08-18 a 2026-08-24), que quedaron con comision_jefe_zona = 0 y jefe_zona_responsable
-- en NULL porque esas columnas no existían todavía. Pedido explícito del negocio: la comisión
-- del jefe de patio debe contar "desde el día 1", igual que la del lavador.
--
--  - Tasa: comision_jefe_zona_porcentaje vigente en `configuracion` (3%), aplicada sobre el
--    `precio` de lista de la orden — misma fórmula que createOrden desde 0028.
--  - Responsable: el `responsable_actual` del turno de caja jefe_zona que estaba abierto al
--    momento de crear la orden — misma regla de atribución que usa createOrden. Se copia el
--    texto tal cual quedó en el turno, sin normalizar nombres (decisión del negocio: los
--    nombres partidos/con typo ya existen igual en las órdenes post-0028, se limpian aparte).
--  - `comision_negocio` se reduce en el mismo monto para que
--    comision_lavador + comision_jefe_zona + comision_negocio = precio siga cuadrando, igual
--    que en las órdenes creadas después de 0028.
--  - Solo órdenes no anuladas. Quedan sin liquidar (liquidacion_jefe_zona_id NULL) para que
--    Admin genere el corte desde /admin/dinero/liquidaciones.
--
-- Verificado antes de escribir: las 99 órdenes objetivo caen todas dentro de un turno
-- jefe_zona cerrado, ninguna queda sin responsable.

with cfg as (
  select comision_jefe_zona_porcentaje as pct from configuracion where id = true
),
objetivo as (
  select
    o.id,
    (
      select t.responsable_actual
      from turnos_caja t
      where t.rol = 'jefe_zona'
        and t.abierto_en <= o.creado_en
        and (t.cerrado_en is null or t.cerrado_en >= o.creado_en)
      order by t.abierto_en desc
      limit 1
    ) as responsable,
    round(o.precio * (select pct from cfg))::int as com_jefe
  from ordenes o
  where o.estado <> 'anulada'
    and o.jefe_zona_responsable is null
    and o.comision_jefe_zona = 0
)
update ordenes o
set
  jefe_zona_responsable = objetivo.responsable,
  comision_jefe_zona    = objetivo.com_jefe,
  comision_negocio      = o.comision_negocio - objetivo.com_jefe
from objetivo
where o.id = objetivo.id
  and objetivo.responsable is not null;
