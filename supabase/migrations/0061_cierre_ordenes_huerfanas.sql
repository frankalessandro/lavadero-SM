-- Depuración de datos: cobro de 6 órdenes que se entregaron sin pasar por "Cobrar".
--
-- Hallazgo de la revisión de inventario (2026-09-14): 6 órdenes quedaron en `en_proceso`/`listo`
-- desde días anteriores. El tablero de jefe de zona filtraba por `creado_en >= hoy`, así que a
-- medianoche desaparecían sin botón para cobrarlas (corregido en 0060 con `fetchOrdenesAbiertas`).
-- Las 6 ya estaban liquidadas al lavador ($74.000 de comisión pagada).
--
--   #22 QPD25F 19-ago · #23 NXX014 19-ago · #130 KVM199 26-ago · #244 HQH61H 03-sep
--   #331 MLI93G 08-sep · #366 JZR659 11-sep (+ 5 productos de nevera pendientes)
--
-- Decisión de Alessandro (2026-09-14): se registran como COBRADAS, en su fecha y turno original,
-- con su inventario cruzado — "como si se pagaron", para arrancar la semana en orden.
--
-- Cómo se registra cada una:
--  · `entregada_en` = `lista_en` (la hora en que se marcó lista). Las dos que seguían en proceso
--    (#22, #23) no tienen `lista_en`: se toma `creado_en + 1 h` (duración promedio de un lavado)
--    y `lista_en` se fija en esa misma hora; `tiempo_lavado_segundos` queda NULL a propósito
--    para no inventar una medición.
--  · `turno_id` = el turno de jefe de zona que estaba abierto a esa hora (verificado: las 6 caen
--    dentro de uno). Esos turnos están CERRADOS: por la regla 14 sus columnas de arqueo
--    (`valor_esperado`/`conteo_fisico`/`diferencia`) NO se tocan — el cobro solo se ve en reportes.
--  · Método: se desconoce el real. Se registra como `transferencia` con referencia explícita de
--    depuración. Se eligió transferencia y no efectivo porque así no altera la reconstrucción del
--    efectivo esperado de esos turnos cerrados (cuyos faltantes ya tienen su justificación escrita).
--    Si se confirma el método real, se cambia con "Corregir reparto" (0036), sin tocar el total.
--  · #366: sus 5 ventas `pendiente` pasan a `activa` con el mismo turno/método y generan su salida
--    de inventario con snapshot de costo (misma fórmula de cobrar_orden). Cruce verificado: desde
--    el conteo de cierre del 12-sep (el último) el sistema tenía stock = contado físico + esos
--    pendientes, así que convertirlos en salidas deja el stock igual a lo contado.
--
-- Idempotente: solo actúa sobre esas 6 órdenes si siguen sin cobrar.

do $$
declare
  v_ref constant text := 'Depuración 0061 — cobro no registrado en su momento';
  v_orden record;
  v_entrega timestamptz;
  v_turno_id uuid;
  v_total_productos integer;
  v_pendiente record;
begin
  for v_orden in
    select * from public.ordenes
    where consecutivo in (22, 23, 130, 244, 331, 366)
      and estado in ('en_proceso', 'listo')
    order by consecutivo
    for update
  loop
    v_entrega := coalesce(v_orden.lista_en, v_orden.creado_en + interval '1 hour');

    select t.id into v_turno_id
    from public.turnos_caja t
    where t.rol = 'jefe_zona'
      and t.abierto_en <= v_entrega
      and coalesce(t.cerrado_en, now()) >= v_entrega
    order by t.abierto_en desc
    limit 1;
    if v_turno_id is null then
      raise exception 'Orden #%: no hay turno de jefe de zona abierto a las %', v_orden.consecutivo, v_entrega;
    end if;

    select coalesce(sum(total), 0) into v_total_productos
    from public.ventas where orden_id = v_orden.id and estado = 'pendiente';

    update public.ordenes set
      estado = 'entregado',
      lista_en = coalesce(lista_en, v_entrega),
      entregada_en = v_entrega,
      tiempo_espera_entrega_segundos = greatest(0, extract(epoch from (v_entrega - coalesce(v_orden.lista_en, v_entrega)))::integer),
      metodo_pago = 'transferencia',
      referencia_pago = v_ref,
      turno_id = v_turno_id
    where id = v_orden.id;

    insert into public.pagos (orden_id, metodo_pago, monto, referencia_pago, turno_id)
    values (v_orden.id, 'transferencia', (v_orden.precio - v_orden.descuento) + v_total_productos, v_ref, v_turno_id);

    for v_pendiente in
      select * from public.ventas where orden_id = v_orden.id and estado = 'pendiente' for update
    loop
      update public.ventas set
        estado = 'activa',
        metodo_pago = 'transferencia',
        referencia_pago = v_ref,
        turno_id = v_turno_id
      where id = v_pendiente.id;

      insert into public.movimientos_inventario (
        producto_id, tipo, cantidad, costo_unitario, motivo, responsable, venta_id
      ) values (
        v_pendiente.producto_id, 'salida', -v_pendiente.cantidad,
        interno.costo_promedio_producto(v_pendiente.producto_id),
        'Venta #' || v_pendiente.consecutivo || ' (orden #' || v_orden.consecutivo || ') — depuración 0061',
        'Depuración 0061',
        v_pendiente.id
      );
    end loop;
  end loop;
end $$;
