-- Descuento sobre el lavado, absorbido por el negocio.
--
-- Regla confirmada con el negocio: una rebaja puntual (a un amigo, a alguien que regateó) se
-- aplica SOLO en el cobro, cuando se presiona "Aplicar descuento" y se pone un % o un monto. El
-- negocio absorbe la rebaja: `comision_lavador` y `comision_jefe_zona` se siguen calculando sobre
-- el PRECIO DE LISTA (`ordenes.precio`, fijado al crear la orden), no sobre lo cobrado — el
-- descuento solo baja lo que entra a caja y la utilidad del negocio. Solo aplica al lavado
-- (combo + adicionales + recargo); los productos de vitrina cargados a la orden se cobran
-- siempre a precio de lista.
--
-- Autorización: motivo + quién autoriza (texto), sin PIN — queda en la orden y en reportes,
-- mismo criterio que la corrección de reparto (0036). Sin tope: se permite hasta dejar el
-- lavado en $0 (cortesía total); en ese caso, si además no hay productos, el cobro se cierra
-- sin líneas de pago.

alter table public.ordenes
  add column descuento integer not null default 0 check (descuento >= 0),
  -- Solo para auditoría / recibo: si la rebaja se ingresó como porcentaje, se guarda cuál.
  add column descuento_pct numeric check (descuento_pct is null or (descuento_pct > 0 and descuento_pct <= 100)),
  add column descuento_motivo text,
  add column descuento_autorizado_por text;

-- El descuento nunca supera el precio de lista del lavado (a lo sumo lo deja en $0).
alter table public.ordenes add constraint ordenes_descuento_lte_precio check (descuento <= precio);

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- cobrar_orden: gana los parámetros de descuento (opcionales; default = sin descuento). Se
-- DROPea la firma de 0036 (uuid, jsonb) y se crea la de 6 args. El total a cobrar pasa a ser
-- (precio - descuento) + productos pendientes. Si queda en $0 el cobro se cierra sin `pagos`.
-- ─────────────────────────────────────────────────────────────────────────────────────────────

drop function if exists public.cobrar_orden(uuid, jsonb);

create function public.cobrar_orden(
  p_orden_id uuid,
  p_pagos jsonb,
  p_descuento integer default 0,
  p_descuento_pct numeric default null,
  p_descuento_motivo text default null,
  p_descuento_autorizado_por text default null
)
returns setof public.ordenes
language plpgsql security definer set search_path = public
as $$
declare
  v_orden public.ordenes;
  v_turno_id uuid;
  v_pendiente record;
  v_stock integer;
  v_hay_pendientes boolean;
  v_total_pendientes integer;
  v_espera_segundos integer;
  v_total_a_cobrar integer;
  v_total_pagos integer := 0;
  v_n_lineas integer;
  v_pago jsonb;
  v_metodo text;
  v_monto integer;
  v_ref text;
  v_metodos text[] := array[]::text[];
  v_metodo_resumen text;
  v_ref_resumen text;
  v_descuento integer := greatest(coalesce(p_descuento, 0), 0);
  v_desc_motivo text := nullif(trim(p_descuento_motivo), '');
  v_desc_autoriza text := nullif(trim(p_descuento_autorizado_por), '');
begin
  if not interno.es_activo() or interno.rol_actual() not in ('jefe_zona', 'admin') then
    raise exception 'No autorizado para cobrar órdenes';
  end if;
  if p_pagos is null or jsonb_typeof(p_pagos) <> 'array' then
    raise exception 'Se requiere el detalle de pago (puede ir vacío solo si el total queda en $0)';
  end if;

  select * into v_orden from public.ordenes where id = p_orden_id for update;
  if not found then
    raise exception 'La orden no existe';
  end if;
  if v_orden.estado not in ('en_proceso', 'listo') then
    raise exception 'La orden ya fue % — no se puede cobrar de nuevo', v_orden.estado;
  end if;

  if v_descuento > v_orden.precio then
    raise exception 'El descuento (%) no puede superar el precio del lavado (%)', v_descuento, v_orden.precio;
  end if;
  if v_descuento > 0 and (v_desc_motivo is null or v_desc_autoriza is null) then
    raise exception 'El descuento exige un motivo y quién lo autoriza';
  end if;

  select
    exists (select 1 from public.ventas where orden_id = p_orden_id and estado = 'pendiente'),
    coalesce((select sum(total) from public.ventas where orden_id = p_orden_id and estado = 'pendiente'), 0)
  into v_hay_pendientes, v_total_pendientes;
  v_total_a_cobrar := (v_orden.precio - v_descuento) + v_total_pendientes;

  v_n_lineas := jsonb_array_length(p_pagos);
  if v_total_a_cobrar = 0 then
    if v_n_lineas <> 0 then
      raise exception 'El total quedó en $0 (cortesía) — no debe haber líneas de pago';
    end if;
  elsif v_n_lineas < 1 or v_n_lineas > 3 then
    raise exception 'El cobro admite entre 1 y 3 líneas de pago (recibidas: %)', v_n_lineas;
  end if;

  if v_total_a_cobrar > 0 then
    for v_pago in select value from jsonb_array_elements(p_pagos) as t(value)
    loop
      v_metodo := v_pago->>'metodo';
      v_monto := nullif(v_pago->>'monto', '')::integer;
      v_ref := nullif(trim(v_pago->>'referencia'), '');
      if v_metodo not in ('efectivo', 'transferencia', 'datafono') then
        raise exception 'Método de pago inválido: %', v_metodo;
      end if;
      if v_monto is null or v_monto <= 0 then
        raise exception 'Cada línea de pago debe tener un monto mayor a cero';
      end if;
      if v_metodo in ('transferencia', 'datafono') and v_ref is null then
        raise exception 'La referencia es obligatoria en pagos por transferencia o datáfono';
      end if;
      v_total_pagos := v_total_pagos + v_monto;
      v_metodos := v_metodos || v_metodo;
    end loop;

    if v_total_pagos <> v_total_a_cobrar then
      raise exception 'Las líneas de pago suman % pero el total a cobrar es %', v_total_pagos, v_total_a_cobrar;
    end if;
  end if;

  select id into v_turno_id from public.turnos_caja where rol = 'jefe_zona' and not cerrado;
  if v_turno_id is null and v_hay_pendientes then
    raise exception 'No hay turno de caja abierto — ábrelo antes de cobrar productos cargados a la orden.';
  end if;

  v_espera_segundos := greatest(
    0, extract(epoch from (now() - coalesce(v_orden.lista_en, v_orden.creado_en)))::integer
  );

  if array_length(v_metodos, 1) is null then
    v_metodo_resumen := null;  -- cortesía total: no se cobró nada
    v_ref_resumen := null;
  elsif (select count(distinct m) from unnest(v_metodos) m) = 1 then
    v_metodo_resumen := v_metodos[1];
    v_ref_resumen := nullif(trim(p_pagos->0->>'referencia'), '');
  else
    v_metodo_resumen := 'mixto';
    v_ref_resumen := null;
  end if;

  update public.ordenes set
    estado = 'entregado',
    metodo_pago = v_metodo_resumen,
    referencia_pago = v_ref_resumen,
    descuento = v_descuento,
    descuento_pct = case when v_descuento > 0 then p_descuento_pct else null end,
    descuento_motivo = case when v_descuento > 0 then v_desc_motivo else null end,
    descuento_autorizado_por = case when v_descuento > 0 then v_desc_autoriza else null end,
    entregada_en = now(),
    tiempo_espera_entrega_segundos = v_espera_segundos,
    turno_id = v_turno_id
  where id = p_orden_id
  returning * into v_orden;

  if v_total_a_cobrar > 0 then
    for v_pago in select value from jsonb_array_elements(p_pagos) as t(value)
    loop
      insert into public.pagos (orden_id, metodo_pago, monto, referencia_pago, turno_id)
      values (
        p_orden_id, v_pago->>'metodo', (v_pago->>'monto')::integer,
        nullif(trim(v_pago->>'referencia'), ''), v_turno_id
      );
    end loop;
  end if;

  for v_pendiente in
    select * from public.ventas where orden_id = p_orden_id and estado = 'pendiente' for update
  loop
    select coalesce(sum(cantidad), 0) into v_stock
    from public.movimientos_inventario where producto_id = v_pendiente.producto_id;
    if v_stock < v_pendiente.cantidad then
      raise exception 'Stock insuficiente de "%": quedan %, la orden pide %',
        (select nombre from public.productos where id = v_pendiente.producto_id),
        v_stock, v_pendiente.cantidad;
    end if;

    update public.ventas set
      estado = 'activa',
      metodo_pago = coalesce(v_metodo_resumen, 'efectivo'),
      referencia_pago = v_ref_resumen,
      turno_id = v_turno_id
    where id = v_pendiente.id;

    insert into public.movimientos_inventario (
      producto_id, tipo, cantidad, costo_unitario, motivo, responsable, venta_id
    ) values (
      v_pendiente.producto_id, 'salida', -v_pendiente.cantidad,
      interno.costo_promedio_producto(v_pendiente.producto_id),
      'Venta #' || v_pendiente.consecutivo || ' (orden #' || v_orden.consecutivo || ')',
      coalesce(nullif(trim(v_orden.jefe_zona_responsable), ''), v_pendiente.vendido_por),
      v_pendiente.id
    );
  end loop;

  return next v_orden;
end;
$$;

revoke execute on function public.cobrar_orden(uuid, jsonb, integer, numeric, text, text) from public, anon;
grant execute on function public.cobrar_orden(uuid, jsonb, integer, numeric, text, text) to authenticated;

-- Nota de advisor: `cobrar_orden` sigue como WARN "Signed-In Users Can Execute SECURITY DEFINER
-- Function" — intencional, mismo criterio que 0032/0035/0036.
