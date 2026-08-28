-- Venta de productos de nevera CARGADA A UNA ORDEN de lavado: el producto se suma al vehículo
-- que está esperando y se cobra TODO junto a la entrega (un solo pago, un solo método) — o
-- sigue siendo venta aparte con cobro en el acto, como hasta ahora. Los dos caminos viven en la
-- misma tabla `ventas` y la misma RPC `registrar_venta`, distinguidos por `orden_id`.
--
-- Reglas confirmadas con el negocio para esta iteración:
--  1. Con vehículo (orden_id != null): la venta nace `pendiente` y NO mueve inventario todavía;
--     el stock se descuenta y el costo se fija recién al cobrar la orden (RPC `cobrar_orden`).
--  2. Venta aparte (orden_id = null): idéntico a 0032 — cobro en el acto, `activa`, turno fijo,
--     movimiento de salida con snapshot de costo.
--  3. Consecutivo `VTA-` propio siempre, también para las pendientes (antifraude: numeración
--     continua de tiquetes).
--  4. Si el carro se va sin pagar, la pendiente se anula con motivo (RPC `anular_venta`, que
--     ahora acepta pendientes y NO repone stock porque nunca lo descontó).
--  5. Los productos no pagan comisión de lavador ni de jefe de patio — no tocan liquidaciones
--     (igual que la venta aparte de 0029).

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- Esquema
-- ─────────────────────────────────────────────────────────────────────────────────────────────

alter table public.ventas add column orden_id uuid references public.ordenes(id);
create index ventas_orden_idx on public.ventas (orden_id);

-- `pendiente` = cargada a una orden, aún sin cobrar y sin mover inventario. Pasa a `activa`
-- (con su movimiento de salida) cuando se cobra la orden en `cobrar_orden`.
alter table public.ventas drop constraint ventas_estado_check;
alter table public.ventas add constraint ventas_estado_check
  check (estado in ('activa', 'anulada', 'pendiente'));

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- Al anular una orden, sus ventas pendientes se anulan solas — nunca movieron stock, así que no
-- hay reverso de inventario que hacer. `anularOrden` en el cliente sigue siendo un UPDATE plano
-- (no se convierte en RPC): este trigger cubre la cascada para cualquier camino que anule una
-- orden (admin, o el que sea).
-- ─────────────────────────────────────────────────────────────────────────────────────────────

create or replace function public.anular_ventas_pendientes_de_orden()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  update public.ventas set
    estado = 'anulada',
    motivo_anulacion = coalesce(nullif(trim(new.motivo_anulacion), ''), 'Orden anulada'),
    anulada_por = coalesce(new.anulada_por, 'sistema'),
    anulada_en = now()
  where orden_id = new.id and estado = 'pendiente';
  return new;
end;
$$;

revoke execute on function public.anular_ventas_pendientes_de_orden() from public, anon, authenticated;

create trigger ordenes_anulada_anula_ventas_pendientes
  after update of estado on public.ordenes
  for each row
  when (new.estado = 'anulada' and old.estado is distinct from 'anulada')
  execute function public.anular_ventas_pendientes_de_orden();

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- registrar_venta: gana `p_orden_id` opcional. Sin él, comportamiento de 0032 intacto. Con él,
-- inserta una venta `pendiente` sin turno y sin movimiento de inventario.
-- Se DROPea la versión de 5 args y se crea la de 6 para no dejar dos overloads que confundan a
-- PostgREST cuando el payload no trae `p_orden_id`.
-- ─────────────────────────────────────────────────────────────────────────────────────────────

drop function if exists public.registrar_venta(uuid, integer, text, text, text);

create function public.registrar_venta(
  p_producto_id uuid,
  p_cantidad integer,
  p_metodo_pago text,
  p_referencia_pago text,
  p_vendido_por text,
  p_orden_id uuid default null
)
returns setof public.ventas
language plpgsql security definer set search_path = public
as $$
declare
  v_producto record;
  v_turno_id uuid;
  v_venta public.ventas;
  v_orden record;
  v_responsable text := nullif(trim(p_vendido_por), '');
  v_referencia text := nullif(trim(p_referencia_pago), '');
  v_es_pendiente boolean := p_orden_id is not null;
begin
  if not interno.es_activo() or interno.rol_actual() not in ('jefe_zona', 'admin') then
    raise exception 'No autorizado para registrar ventas';
  end if;
  if p_cantidad is null or p_cantidad <= 0 then
    raise exception 'La cantidad debe ser mayor a cero';
  end if;
  if p_metodo_pago not in ('efectivo', 'transferencia', 'datafono') then
    raise exception 'Método de pago inválido: %', p_metodo_pago;
  end if;
  -- La referencia solo se exige en la venta aparte (la que se cobra ya). En la venta cargada a
  -- una orden, el método/referencia reales se definen al cobrar la orden — acá va un provisional
  -- que `cobrar_orden` sobreescribe.
  if not v_es_pendiente
     and p_metodo_pago in ('transferencia', 'datafono') and v_referencia is null then
    raise exception 'La referencia es obligatoria en pagos por transferencia o datáfono';
  end if;
  if v_responsable is null then
    raise exception 'El responsable de la venta es obligatorio';
  end if;

  select nombre, activo, precio_venta into v_producto
  from public.productos where id = p_producto_id;
  if not found then
    raise exception 'El producto seleccionado no existe';
  end if;
  if not v_producto.activo then
    raise exception 'El producto "%" está inactivo — actívalo desde /admin/dinero/inventario antes de venderlo.', v_producto.nombre;
  end if;
  if v_producto.precio_venta is null then
    raise exception 'El producto "%" no tiene precio de venta configurado — defínelo desde /admin/dinero/inventario.', v_producto.nombre;
  end if;

  if v_es_pendiente then
    -- Venta cargada a un vehículo en espera: nace pendiente, sin turno y sin mover stock.
    select id, estado into v_orden from public.ordenes where id = p_orden_id;
    if not found then
      raise exception 'La orden asociada no existe';
    end if;
    if v_orden.estado not in ('en_proceso', 'listo') then
      raise exception 'Solo se pueden agregar productos a una orden en proceso o lista para cobrar (estado actual: %)', v_orden.estado;
    end if;

    insert into public.ventas (
      producto_id, cantidad, precio_unitario, total, metodo_pago, referencia_pago,
      turno_id, vendido_por, estado, orden_id
    ) values (
      p_producto_id, p_cantidad, v_producto.precio_venta, v_producto.precio_venta * p_cantidad,
      p_metodo_pago, null, null, v_responsable, 'pendiente', p_orden_id
    )
    returning * into v_venta;

    return next v_venta;
    return;
  end if;

  -- Venta aparte: cobro en el acto (comportamiento previo a 0035).
  select id into v_turno_id from public.turnos_caja where rol = 'jefe_zona' and not cerrado;
  if v_turno_id is null then
    raise exception 'No hay turno de caja abierto — ábrelo antes de registrar ventas.';
  end if;

  insert into public.ventas (
    producto_id, cantidad, precio_unitario, total, metodo_pago, referencia_pago, turno_id, vendido_por
  ) values (
    p_producto_id, p_cantidad, v_producto.precio_venta, v_producto.precio_venta * p_cantidad,
    p_metodo_pago, v_referencia, v_turno_id, v_responsable
  )
  returning * into v_venta;

  insert into public.movimientos_inventario (
    producto_id, tipo, cantidad, costo_unitario, motivo, responsable, venta_id
  ) values (
    p_producto_id, 'salida', -p_cantidad, interno.costo_promedio_producto(p_producto_id),
    'Venta #' || v_venta.consecutivo, v_responsable, v_venta.id
  );

  return next v_venta;
end;
$$;

revoke execute on function public.registrar_venta(uuid, integer, text, text, text, uuid) from public, anon;
grant execute on function public.registrar_venta(uuid, integer, text, text, text, uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- cobrar_orden: cobro + entrega de una orden, liquidando de paso los productos que se le
-- cargaron. Reemplaza el UPDATE suelto que hacía `cobrarYEntregarOrden` en el cliente — la
-- entrega de la orden y el paso de sus ventas pendientes a `activa` (con su salida de
-- inventario) tienen que quedar en la misma transacción, mismo criterio que 0032 para la venta
-- aparte: un producto marcado como cobrado sin descontar stock descuadra el inventario en
-- silencio.
-- ─────────────────────────────────────────────────────────────────────────────────────────────

create or replace function public.cobrar_orden(
  p_orden_id uuid,
  p_metodo_pago text,
  p_referencia_pago text
)
returns setof public.ordenes
language plpgsql security definer set search_path = public
as $$
declare
  v_orden public.ordenes;
  v_turno_id uuid;
  v_referencia text := nullif(trim(p_referencia_pago), '');
  v_pendiente record;
  v_stock integer;
  v_hay_pendientes boolean;
  v_espera_segundos integer;
begin
  if not interno.es_activo() or interno.rol_actual() not in ('jefe_zona', 'admin') then
    raise exception 'No autorizado para cobrar órdenes';
  end if;
  if p_metodo_pago not in ('efectivo', 'transferencia', 'datafono') then
    raise exception 'Método de pago inválido: %', p_metodo_pago;
  end if;
  if p_metodo_pago in ('transferencia', 'datafono') and v_referencia is null then
    raise exception 'La referencia es obligatoria en pagos por transferencia o datáfono';
  end if;

  select * into v_orden from public.ordenes where id = p_orden_id for update;
  if not found then
    raise exception 'La orden no existe';
  end if;
  if v_orden.estado not in ('en_proceso', 'listo') then
    raise exception 'La orden ya fue % — no se puede cobrar de nuevo', v_orden.estado;
  end if;

  select exists (
    select 1 from public.ventas where orden_id = p_orden_id and estado = 'pendiente'
  ) into v_hay_pendientes;

  -- El turno se exige solo si hay productos que liquidar (su `turno_id` alimenta el arqueo).
  -- Sin productos se mantiene el comportamiento previo: se etiqueta el turno abierto si lo hay,
  -- pero no se bloquea el cobro si no.
  select id into v_turno_id from public.turnos_caja where rol = 'jefe_zona' and not cerrado;
  if v_turno_id is null and v_hay_pendientes then
    raise exception 'No hay turno de caja abierto — ábrelo antes de cobrar productos cargados a la orden.';
  end if;

  -- KPI de M10: cuánto se demoró el cliente en reclamar el vehículo ya lavado. Si no hay
  -- lista_en (no debería en el flujo normal), cae a creado_en para no dejar la columna vacía.
  v_espera_segundos := greatest(
    0,
    extract(epoch from (now() - coalesce(v_orden.lista_en, v_orden.creado_en)))::integer
  );

  update public.ordenes set
    estado = 'entregado',
    metodo_pago = p_metodo_pago,
    referencia_pago = v_referencia,
    entregada_en = now(),
    tiempo_espera_entrega_segundos = v_espera_segundos,
    turno_id = v_turno_id
  where id = p_orden_id
  returning * into v_orden;

  -- Cada producto pendiente: valida stock, lo pasa a `activa` con el método/turno del cobro y
  -- registra su salida de inventario con el snapshot de costo (igual que la venta aparte).
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
      metodo_pago = p_metodo_pago,
      referencia_pago = v_referencia,
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

revoke execute on function public.cobrar_orden(uuid, text, text) from public, anon;
grant execute on function public.cobrar_orden(uuid, text, text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- anular_venta: ahora acepta también ventas `pendiente`. Una pendiente nunca descontó
-- inventario, así que se marca anulada sin la entrada compensatoria (que sí aplica a una
-- `activa`). Regla de negocio 13: motivo obligatorio, queda visible en reportes.
-- ─────────────────────────────────────────────────────────────────────────────────────────────

create or replace function public.anular_venta(
  p_venta_id uuid,
  p_motivo text,
  p_anulada_por text
)
returns setof public.ventas
language plpgsql security definer set search_path = public
as $$
declare
  v_venta public.ventas;
  v_estado_previo text;
  v_motivo text := nullif(trim(p_motivo), '');
  v_responsable text := nullif(trim(p_anulada_por), '');
begin
  if not interno.es_activo() or interno.rol_actual() not in ('jefe_zona', 'admin') then
    raise exception 'No autorizado para anular ventas';
  end if;
  if v_motivo is null or length(v_motivo) < 3 then
    raise exception 'El motivo de anulación es obligatorio';
  end if;
  if v_responsable is null then
    raise exception 'Indica quién anula la venta';
  end if;

  select estado into v_estado_previo from public.ventas where id = p_venta_id for update;
  if not found then
    raise exception 'La venta no existe';
  end if;

  update public.ventas set
    estado = 'anulada',
    motivo_anulacion = v_motivo,
    anulada_por = v_responsable,
    anulada_en = now()
  where id = p_venta_id and estado in ('activa', 'pendiente')
  returning * into v_venta;

  if not found then
    raise exception 'La venta ya estaba anulada';
  end if;

  -- Solo se repone stock si la venta ya lo había descontado. Una `pendiente` (cargada a una
  -- orden y aún sin cobrar) nunca movió inventario.
  if v_estado_previo = 'activa' then
    insert into public.movimientos_inventario (
      producto_id, tipo, cantidad, motivo, responsable, venta_id
    ) values (
      v_venta.producto_id, 'entrada', v_venta.cantidad,
      'Reverso por anulación de venta #' || v_venta.consecutivo, v_responsable, v_venta.id
    );
  end if;

  return next v_venta;
end;
$$;

-- Nota de advisor: `registrar_venta`, `anular_venta` y `cobrar_orden` quedan como WARN
-- "Signed-In Users Can Execute SECURITY DEFINER Function". Intencional y mismo criterio que
-- 0032 — son el camino que el frontend autenticado debe llamar y necesitan SECURITY DEFINER
-- para escribir en `movimientos_inventario` / `ordenes` saltándose el RLS por rol; el candado es
-- el chequeo de rol al entrar, no el grant.
