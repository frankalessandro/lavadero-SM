-- Backfill de `pagos` para los cobros anteriores a 0036.
--
-- En 0036 el arqueo (`calcularValorEsperado` / `fetchEfectivoDeTurno`) y los dashboards de
-- `/admin` pasaron a calcular el efectivo desde la tabla nueva `pagos` (una fila por cobro).
-- Los cobros ya hechos con el sistema viejo solo quedaron en `ordenes`/`ventas`, sin fila en
-- `pagos`. Un turno que estaba abierto durante el despliegue subestima su efectivo esperado:
-- le pasó al turno del 2026-08-29, al que le faltaban $285.000 de 8 lavados cobrados en
-- efectivo antes del cambio.
--
-- Este backfill materializa una fila `pagos` por cada cobro ya registrado que no tiene una:
-- mismo monto (`precio − descuento` / `total`) y método, mismo `turno_id`, con `creado_en` =
-- momento de la entrega/venta. NO cambia ningún dato existente. Los turnos ya cerrados
-- conservan su `valor_esperado`/`diferencia` (son columnas congeladas, no se recalculan) — el
-- backfill solo hace que `/admin` y cualquier arqueo futuro cuadren.
--
-- Idempotente: los `where not exists (...)` evitan duplicar si se corriera de nuevo. Se excluyen
-- `metodo_pago` nulo o 'mixto' (no existían antes de 0036) y montos <= 0 (cortesías).

insert into public.pagos (orden_id, metodo_pago, monto, referencia_pago, turno_id, creado_en)
select o.id, o.metodo_pago, o.precio - o.descuento, o.referencia_pago, o.turno_id,
       coalesce(o.entregada_en, o.creado_en)
from public.ordenes o
where o.estado = 'entregado'
  and o.metodo_pago in ('efectivo', 'transferencia', 'datafono')
  and o.precio - o.descuento > 0
  and not exists (select 1 from public.pagos p where p.orden_id = o.id);

insert into public.pagos (venta_grupo_id, metodo_pago, monto, referencia_pago, turno_id, creado_en)
select v.id, v.metodo_pago, v.total, v.referencia_pago, v.turno_id, v.creado_en
from public.ventas v
where v.estado = 'activa'
  and v.orden_id is null
  and v.venta_grupo_id is null
  and v.metodo_pago in ('efectivo', 'transferencia', 'datafono')
  and v.total > 0
  and not exists (select 1 from public.pagos p where p.venta_grupo_id = v.id);
