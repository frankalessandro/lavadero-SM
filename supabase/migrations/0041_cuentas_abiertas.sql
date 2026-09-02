-- Cuentas abiertas: un tercer destino de "venta pendiente" además de una orden de lavado (0035) y
-- el carrito de mostrador (0036) — para lavadores, acompañantes o transeúntes sin vehículo que
-- piden cosas de la nevera a lo largo del rato y no tiene sentido cobrarles cada ítem por
-- separado. Se abre una cuenta a nombre de alguien, se le van cargando productos (pendientes, sin
-- mover stock), y se cierra cobrando todo junto — mismo motor de pago partido que ya existe.
--
-- Reglas (mismo criterio ya confirmado para órdenes/carritos, no se inventa nada nuevo):
--  - La cuenta se paga completa al cerrar (sin saldo pendiente, 1-3 líneas que sumen exacto).
--  - El stock y el costo de mercancía vendida se fijan recién al cerrar, igual que "producto
--    cargado a una orden" — mientras está abierta no descuenta inventario.
--  - Motivo obligatorio para anular (regla 13), sin PIN (mismo criterio que pago partido/
--    descuento — confirmado con el negocio para esos casos, se mantiene acá).

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- Esquema
-- ─────────────────────────────────────────────────────────────────────────────────────────────

create table public.cuentas (
  id uuid primary key default gen_random_uuid(),
  titular text not null,
  nota text,
  estado text not null default 'abierta' check (estado in ('abierta', 'cerrada', 'anulada')),
  abierta_por text not null,
  abierta_en timestamptz not null default now(),
  cerrada_en timestamptz,
  cerrada_por text,
  -- Turno de jefe_zona en que se cerró/cobró — null mientras sigue abierta.
  turno_id uuid references public.turnos_caja(id),
  creado_en timestamptz not null default now()
);
create index cuentas_estado_idx on public.cuentas (estado);

alter table public.ventas add column cuenta_id uuid references public.cuentas(id);
create index ventas_cuenta_idx on public.ventas (cuenta_id);

alter table public.pagos add column cuenta_id uuid references public.cuentas(id);
create index pagos_cuenta_idx on public.pagos (cuenta_id);
alter table public.pagos drop constraint pagos_target_check;
alter table public.pagos add constraint pagos_target_check
  check (num_nonnulls(orden_id, venta_grupo_id, cuenta_id) = 1);

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- RLS: mismo molde que `pagos` (0036) — admin y jefe_zona leen; vigilante sin acceso. La
-- escritura pasa solo por las RPC de abajo (security definer, saltan RLS).
-- ─────────────────────────────────────────────────────────────────────────────────────────────

alter table public.cuentas enable row level security;
create policy cuentas_admin_select on public.cuentas
  for select to authenticated using (interno.es_admin() and interno.es_activo());
create policy cuentas_jefe_zona_select on public.cuentas
  for select to authenticated using (interno.rol_actual() = 'jefe_zona' and interno.es_activo());
grant select on public.cuentas to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- abrir_cuenta
-- ─────────────────────────────────────────────────────────────────────────────────────────────

create function public.abrir_cuenta(
  p_titular text,
  p_nota text default null,
  p_abierta_por text default null
)
returns setof public.cuentas
language plpgsql security definer set search_path = public
as $$
declare
  v_titular text := nullif(trim(p_titular), '');
  v_responsable text := nullif(trim(p_abierta_por), '');
  v_nota text := nullif(trim(p_nota), '');
  v_cuenta public.cuentas;
begin
  if not interno.es_activo() or interno.rol_actual() not in ('jefe_zona', 'admin') then
    raise exception 'No autorizado para abrir cuentas';
  end if;
  if v_titular is null or length(v_titular) < 2 then
    raise exception 'El nombre de la cuenta es obligatorio';
  end if;
  if v_responsable is null then
    raise exception 'Indica quién abre la cuenta';
  end if;

  insert into public.cuentas (titular, nota, abierta_por)
  values (v_titular, v_nota, v_responsable)
  returning * into v_cuenta;

  return next v_cuenta;
end;
$$;

revoke execute on function public.abrir_cuenta(text, text, text) from public, anon;
grant execute on function public.abrir_cuenta(text, text, text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- registrar_venta gana `p_cuenta_id` (7º parámetro), mismo criterio que `p_orden_id` (0035): si
-- viene, la venta nace `pendiente` sin turno y sin mover stock. Se dropea la firma de 6 args.
-- Los dos destinos son mutuamente excluyentes.
-- ─────────────────────────────────────────────────────────────────────────────────────────────

drop function if exists public.registrar_venta(uuid, integer, text, text, text, uuid);

create function public.registrar_venta(
  p_producto_id uuid,
  p_cantidad integer,
  p_metodo_pago text,
  p_referencia_pago text,
  p_vendido_por text,
  p_orden_id uuid default null,
  p_cuenta_id uuid default null
)
returns setof public.ventas
language plpgsql security definer set search_path = public
as $$
declare
  v_producto record;
  v_turno_id uuid;
  v_venta public.ventas;
  v_orden record;
  v_cuenta record;
  v_responsable text := nullif(trim(p_vendido_por), '');
  v_referencia text := nullif(trim(p_referencia_pago), '');
  v_es_pendiente boolean := p_orden_id is not null or p_cuenta_id is not null;
begin
  if not interno.es_activo() or interno.rol_actual() not in ('jefe_zona', 'admin') then
    raise exception 'No autorizado para registrar ventas';
  end if;
  if p_orden_id is not null and p_cuenta_id is not null then
    raise exception 'Una venta pendiente solo puede ir a una orden o a una cuenta, no ambas';
  end if;
  if p_cantidad is null or p_cantidad <= 0 then
    raise exception 'La cantidad debe ser mayor a cero';
  end if;
  if p_metodo_pago not in ('efectivo', 'transferencia', 'datafono') then
    raise exception 'Método de pago inválido: %', p_metodo_pago;
  end if;
  -- La referencia solo se exige en la venta aparte (la que se cobra ya). En la venta cargada a
  -- una orden o cuenta, el método/referencia reales se definen al cobrar/cerrar — acá va un
  -- provisional que `cobrar_orden`/`cerrar_cuenta` sobreescribe.
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

  if p_orden_id is not null then
    select id, estado into v_orden from public.ordenes where id = p_orden_id;
    if not found then
      raise exception 'La orden asociada no existe';
    end if;
    if v_orden.estado not in ('en_proceso', 'listo') then
      raise exception 'Solo se pueden agregar productos a una orden en proceso o lista para cobrar (estado actual: %)', v_orden.estado;
    end if;
  elsif p_cuenta_id is not null then
    select id, estado into v_cuenta from public.cuentas where id = p_cuenta_id;
    if not found then
      raise exception 'La cuenta asociada no existe';
    end if;
    if v_cuenta.estado <> 'abierta' then
      raise exception 'La cuenta ya está % — no se le pueden agregar más productos', v_cuenta.estado;
    end if;
  end if;

  if v_es_pendiente then
    insert into public.ventas (
      producto_id, cantidad, precio_unitario, total, metodo_pago, referencia_pago,
      turno_id, vendido_por, estado, orden_id, cuenta_id
    ) values (
      p_producto_id, p_cantidad, v_producto.precio_venta, v_producto.precio_venta * p_cantidad,
      p_metodo_pago, null, null, v_responsable, 'pendiente', p_orden_id, p_cuenta_id
    )
    returning * into v_venta;

    return next v_venta;
    return;
  end if;

  -- Venta aparte: cobro en el acto (comportamiento previo, sin destino pendiente).
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

revoke execute on function public.registrar_venta(uuid, integer, text, text, text, uuid, uuid) from public, anon;
grant execute on function public.registrar_venta(uuid, integer, text, text, text, uuid, uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- cerrar_cuenta: calco de `cobrar_orden` (0036) sin la entidad "orden" — el total a cobrar es
-- solo la suma de los productos pendientes de la cuenta (sin precio de lavado ni descuento, ese
-- campo es exclusivo de `ordenes`).
-- ─────────────────────────────────────────────────────────────────────────────────────────────

create function public.cerrar_cuenta(
  p_cuenta_id uuid,
  p_pagos jsonb,
  p_cerrada_por text
)
returns setof public.cuentas
language plpgsql security definer set search_path = public
as $$
declare
  v_cuenta public.cuentas;
  v_turno_id uuid;
  v_responsable text := nullif(trim(p_cerrada_por), '');
  v_pendiente record;
  v_stock integer;
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
begin
  if not interno.es_activo() or interno.rol_actual() not in ('jefe_zona', 'admin') then
    raise exception 'No autorizado para cerrar cuentas';
  end if;
  if v_responsable is null then
    raise exception 'Indica quién cierra la cuenta';
  end if;

  select * into v_cuenta from public.cuentas where id = p_cuenta_id for update;
  if not found then
    raise exception 'La cuenta no existe';
  end if;
  if v_cuenta.estado <> 'abierta' then
    raise exception 'La cuenta ya está % — no se puede cerrar de nuevo', v_cuenta.estado;
  end if;

  select coalesce(sum(total), 0) into v_total_a_cobrar
  from public.ventas where cuenta_id = p_cuenta_id and estado = 'pendiente';
  if v_total_a_cobrar <= 0 then
    raise exception 'La cuenta no tiene productos pendientes — usa "Anular cuenta" si no se va a cobrar nada';
  end if;

  if p_pagos is null or jsonb_typeof(p_pagos) <> 'array' then
    raise exception 'Se requiere al menos una línea de pago';
  end if;
  v_n_lineas := jsonb_array_length(p_pagos);
  if v_n_lineas < 1 or v_n_lineas > 3 then
    raise exception 'El cobro admite entre 1 y 3 líneas de pago (recibidas: %)', v_n_lineas;
  end if;

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

  select id into v_turno_id from public.turnos_caja where rol = 'jefe_zona' and not cerrado;
  if v_turno_id is null then
    raise exception 'No hay turno de caja abierto — ábrelo antes de cerrar la cuenta.';
  end if;

  if (select count(distinct m) from unnest(v_metodos) m) = 1 then
    v_metodo_resumen := v_metodos[1];
    v_ref_resumen := nullif(trim(p_pagos->0->>'referencia'), '');
  else
    v_metodo_resumen := 'mixto';
    v_ref_resumen := null;
  end if;

  update public.cuentas set
    estado = 'cerrada',
    cerrada_en = now(),
    cerrada_por = v_responsable,
    turno_id = v_turno_id
  where id = p_cuenta_id
  returning * into v_cuenta;

  for v_pago in select value from jsonb_array_elements(p_pagos) as t(value)
  loop
    insert into public.pagos (cuenta_id, metodo_pago, monto, referencia_pago, turno_id)
    values (
      p_cuenta_id, v_pago->>'metodo', (v_pago->>'monto')::integer,
      nullif(trim(v_pago->>'referencia'), ''), v_turno_id
    );
  end loop;

  for v_pendiente in
    select * from public.ventas where cuenta_id = p_cuenta_id and estado = 'pendiente' for update
  loop
    select coalesce(sum(cantidad), 0) into v_stock
    from public.movimientos_inventario where producto_id = v_pendiente.producto_id;
    if v_stock < v_pendiente.cantidad then
      raise exception 'Stock insuficiente de "%": quedan %, la cuenta pide %',
        (select nombre from public.productos where id = v_pendiente.producto_id),
        v_stock, v_pendiente.cantidad;
    end if;

    update public.ventas set
      estado = 'activa',
      metodo_pago = v_metodo_resumen,
      referencia_pago = v_ref_resumen,
      turno_id = v_turno_id
    where id = v_pendiente.id;

    insert into public.movimientos_inventario (
      producto_id, tipo, cantidad, costo_unitario, motivo, responsable, venta_id
    ) values (
      v_pendiente.producto_id, 'salida', -v_pendiente.cantidad,
      interno.costo_promedio_producto(v_pendiente.producto_id),
      'Venta #' || v_pendiente.consecutivo || ' (cuenta: ' || v_cuenta.titular || ')',
      v_responsable,
      v_pendiente.id
    );
  end loop;

  return next v_cuenta;
end;
$$;

revoke execute on function public.cerrar_cuenta(uuid, jsonb, text) from public, anon;
grant execute on function public.cerrar_cuenta(uuid, jsonb, text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- anular_cuenta: cancela una cuenta sin cobrar (se fue sin pagar, error al abrirla). Sus ventas
-- pendientes nunca movieron stock, así que se anulan sin reverso — mismo criterio que el trigger
-- `anular_ventas_pendientes_de_orden`.
-- ─────────────────────────────────────────────────────────────────────────────────────────────

create function public.anular_cuenta(
  p_cuenta_id uuid,
  p_motivo text,
  p_anulada_por text
)
returns setof public.cuentas
language plpgsql security definer set search_path = public
as $$
declare
  v_cuenta public.cuentas;
  v_motivo text := nullif(trim(p_motivo), '');
  v_responsable text := nullif(trim(p_anulada_por), '');
begin
  if not interno.es_activo() or interno.rol_actual() not in ('jefe_zona', 'admin') then
    raise exception 'No autorizado para anular cuentas';
  end if;
  if v_motivo is null or length(v_motivo) < 3 then
    raise exception 'El motivo de anulación es obligatorio';
  end if;
  if v_responsable is null then
    raise exception 'Indica quién anula la cuenta';
  end if;

  select * into v_cuenta from public.cuentas where id = p_cuenta_id for update;
  if not found then
    raise exception 'La cuenta no existe';
  end if;
  if v_cuenta.estado <> 'abierta' then
    raise exception 'La cuenta ya está % — no se puede anular', v_cuenta.estado;
  end if;

  update public.ventas set
    estado = 'anulada',
    motivo_anulacion = v_motivo,
    anulada_por = v_responsable,
    anulada_en = now()
  where cuenta_id = p_cuenta_id and estado = 'pendiente';

  update public.cuentas set estado = 'anulada'
  where id = p_cuenta_id
  returning * into v_cuenta;

  return next v_cuenta;
end;
$$;

revoke execute on function public.anular_cuenta(uuid, text, text) from public, anon;
grant execute on function public.anular_cuenta(uuid, text, text) to authenticated;

-- Nota de advisor: abrir_cuenta, cerrar_cuenta y anular_cuenta quedan como WARN "Signed-In Users
-- Can Execute SECURITY DEFINER Function". Intencional, mismo criterio que 0032/0035/0036 — son el
-- camino que el frontend autenticado debe llamar y necesitan SECURITY DEFINER para escribir en
-- cuentas/pagos/movimientos_inventario saltándose el RLS por rol; el candado es el chequeo de rol
-- al entrar, no el grant.
