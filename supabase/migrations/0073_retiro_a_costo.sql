-- Cuentas a costo para gerencia (decisión de Alessandro, 2026-09-17 — reemplaza por completo el
-- primer diseño de esta misma migración, que nunca se aplicó a ninguna base).
--
-- Diseño anterior: casilla "a costo" al CERRAR la cuenta. Se descartó porque repreciaba productos
-- ya cargados a precio de venta y el motivo/autorización quedaban sueltos en el cierre, no en el
-- origen de la cuenta. Diseño nuevo: el modo a costo se decide al ABRIR la cuenta —
--
--   · Quién abre: jefe de patio o admin (mismos roles que cualquier cuenta) — es quien la registra
--     para poder cobrarla o dejarla abierta más tarde (pedido explícito de Alessandro).
--   · Para quién: solo una cuenta de GERENCIA (`perfiles.roles` contiene 'admin', activa) —
--     `destinatario_id`, elegido de una lista, no texto libre. Un lavador o jefe de patio no puede
--     ser destinatario de una cuenta a costo (regla 4: a ellos se les sigue cobrando precio de
--     venta).
--   · Motivo + quién autoriza: los dos obligatorios, texto libre (mismo patrón que el descuento
--     del lavado, 0037) — sin PIN, control posterior por bitácora (ver CLAUDE.md §Autoridad del
--     jefe de patio).
--   · Cada producto que se carga a esa cuenta se valora al costo
--     (`interno.costo_promedio_producto`) DESDE que se agrega, no al cerrar — mismo camino de
--     `registrar_venta` de siempre, que ahora lee `cuentas.a_costo` para decidir el precio. Así el
--     total nunca cambia entre cargar productos y cerrar, y `cerrar_cuenta`/`cargar_cuenta_a_personal`
--     no necesitan tocarse: ya suman `ventas.total`, que llega correcto desde el insert.
--   · Rentabilidad: ingreso = costo de mercancía → margen 0. Sin cambios en /admin/rentabilidad.

-- ── 0) Columnas en cuentas: modo a costo, destinatario, motivo, quién autoriza ──────────────────
alter table public.cuentas
  add column a_costo boolean not null default false,
  add column destinatario_id uuid references public.perfiles(id),
  add column motivo text,
  add column autorizado_por text;

alter table public.cuentas add constraint cuentas_a_costo_check
  check (
    (not a_costo and destinatario_id is null and motivo is null and autorizado_por is null)
    or (a_costo and destinatario_id is not null and length(trim(motivo)) >= 5 and length(trim(autorizado_por)) >= 1)
  );

comment on column public.cuentas.a_costo is
  'Cuenta a costo para gerencia (0073): los productos que se le cargan se valoran al costo, no al precio de venta.';
comment on column public.cuentas.destinatario_id is 'Gerente que recibe la cuenta a costo. NULL en cualquier cuenta normal.';
comment on column public.cuentas.motivo is 'Por qué se abre la cuenta a costo — obligatorio junto con a_costo.';
comment on column public.cuentas.autorizado_por is 'Quién autorizó la cuenta a costo — obligatorio junto con a_costo, texto libre.';

-- ── 1) Marca en cada venta que salió de una cuenta a costo (auditoría, expedientes) ─────────────
alter table public.ventas
  add column a_costo boolean not null default false,
  add column destinatario_id uuid references public.perfiles(id);

alter table public.ventas add constraint ventas_a_costo_destinatario_check
  check (not a_costo or destinatario_id is not null);

comment on column public.ventas.a_costo is 'Venta valorada a costo por venir de una cuenta a_costo (0073). Margen 0.';
comment on column public.ventas.destinatario_id is 'Gerente que recibe el producto a costo (0073). NULL en cualquier venta normal.';

-- La bitácora ya registraba `precio_unitario`/`total`; se agregan las dos columnas nuevas para que
-- quede el POR QUÉ (fue un retiro a costo) y para quién, en la misma fila de auditoría.
drop trigger bitacora_ventas_update on public.ventas;
create trigger bitacora_ventas_update after update on public.ventas
  for each row execute function interno.bitacora_trigger(
    'editar', 'estado', 'cantidad', 'precio_unitario', 'total', 'metodo_pago', 'turno_id',
    'a_costo', 'destinatario_id', 'motivo_anulacion', 'anulada_por'
  );

-- ── 2) Solo gerencia puede recibir una cuenta a costo ───────────────────────────────────────────
create function interno.exigir_gerencia(p_persona_id uuid)
returns text
language plpgsql stable security definer set search_path to 'public'
as $$
declare
  v_perfil perfiles;
begin
  if p_persona_id is null then
    raise exception 'Indica a qué gerente se le entrega la cuenta a costo';
  end if;
  select * into v_perfil from perfiles where id = p_persona_id;
  if not found then raise exception 'La persona no existe'; end if;
  if not v_perfil.activo then raise exception 'La cuenta está inactiva'; end if;
  if not ('admin' = any (v_perfil.roles)) then
    raise exception 'Solo una cuenta de gerencia puede recibir productos a costo — a % se le cobra a precio de venta',
      coalesce(nullif(trim(v_perfil.nombre), ''), 'esa persona');
  end if;
  return coalesce(nullif(trim(v_perfil.nombre), ''), 'Sin nombre');
end;
$$;

revoke execute on function interno.exigir_gerencia(uuid) from public, anon, authenticated;

-- ── 3) abrir_cuenta gana el modo a costo ────────────────────────────────────────────────────────
drop function public.abrir_cuenta(text, text, text);

create function public.abrir_cuenta(
  p_titular text,
  p_nota text default null,
  p_abierta_por text default null,
  p_a_costo boolean default false,
  p_destinatario_id uuid default null,
  p_motivo text default null,
  p_autorizado_por text default null
)
returns setof public.cuentas
language plpgsql security definer set search_path = public
as $$
declare
  v_titular text := nullif(trim(p_titular), '');
  v_responsable text := nullif(trim(p_abierta_por), '');
  v_nota text := nullif(trim(p_nota), '');
  v_a_costo boolean := coalesce(p_a_costo, false);
  v_motivo text := nullif(trim(p_motivo), '');
  v_autoriza text := nullif(trim(p_autorizado_por), '');
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

  if v_a_costo then
    perform interno.exigir_gerencia(p_destinatario_id);
    if v_motivo is null or length(v_motivo) < 5 then
      raise exception 'Indica el motivo de la cuenta a costo';
    end if;
    if v_autoriza is null then
      raise exception 'Indica quién autoriza la cuenta a costo';
    end if;
  end if;

  insert into public.cuentas (titular, nota, abierta_por, a_costo, destinatario_id, motivo, autorizado_por)
  values (
    v_titular, v_nota, v_responsable,
    v_a_costo,
    case when v_a_costo then p_destinatario_id end,
    case when v_a_costo then v_motivo end,
    case when v_a_costo then v_autoriza end
  )
  returning * into v_cuenta;

  return next v_cuenta;
end;
$$;

revoke execute on function public.abrir_cuenta(text, text, text, boolean, uuid, text, text) from public, anon;
grant execute on function public.abrir_cuenta(text, text, text, boolean, uuid, text, text) to authenticated;

-- ── 4) registrar_venta: si la cuenta destino es a_costo, precia al costo, no al precio de venta ─
-- Mismo criterio para el candado de "producto sin costo" que ya existía para conteos/faltantes:
-- si no hay costo registrado, no se puede sacar a costo (saldría gratis).
create or replace function public.registrar_venta(
  p_producto_id uuid, p_cantidad integer, p_metodo_pago text, p_referencia_pago text, p_vendido_por text,
  p_orden_id uuid default null, p_cuenta_id uuid default null
)
returns setof ventas
language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_producto record;
  v_turno_id uuid;
  v_venta public.ventas;
  v_orden record;
  v_cuenta public.cuentas;
  v_responsable text := nullif(trim(p_vendido_por), '');
  v_referencia text := nullif(trim(p_referencia_pago), '');
  v_es_pendiente boolean := p_orden_id is not null or p_cuenta_id is not null;
  v_precio integer;
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

  if p_orden_id is not null then
    select id, estado into v_orden from public.ordenes where id = p_orden_id;
    if not found then
      raise exception 'La orden asociada no existe';
    end if;
    if v_orden.estado not in ('en_proceso', 'listo') then
      raise exception 'Solo se pueden agregar productos a una orden en proceso o lista para cobrar (estado actual: %)', v_orden.estado;
    end if;
  elsif p_cuenta_id is not null then
    select * into v_cuenta from public.cuentas where id = p_cuenta_id;
    if not found then
      raise exception 'La cuenta asociada no existe';
    end if;
    if v_cuenta.estado <> 'abierta' then
      raise exception 'La cuenta ya está % — no se le pueden agregar más productos', v_cuenta.estado;
    end if;
  end if;

  if v_cuenta.a_costo then
    v_precio := interno.costo_promedio_producto(p_producto_id);
    if coalesce(v_precio, 0) <= 0 then
      raise exception 'No hay costo registrado para "%" — regístralo en Inventario antes de sacarlo a costo', v_producto.nombre;
    end if;
  else
    if v_producto.precio_venta is null then
      raise exception 'El producto "%" no tiene precio de venta configurado — defínelo desde /admin/dinero/inventario.', v_producto.nombre;
    end if;
    v_precio := v_producto.precio_venta;
  end if;

  -- 0068: cargar a una orden/cuenta también saca producto de la nevera — mismo candado.
  perform interno.exigir_conteo_apertura();
  perform interno.exigir_disponible(p_producto_id, p_cantidad);

  if v_es_pendiente then
    insert into public.ventas (
      producto_id, cantidad, precio_unitario, total, metodo_pago, referencia_pago,
      turno_id, vendido_por, estado, orden_id, cuenta_id, a_costo, destinatario_id
    ) values (
      p_producto_id, p_cantidad, v_precio, v_precio * p_cantidad,
      p_metodo_pago, null, null, v_responsable, 'pendiente', p_orden_id, p_cuenta_id,
      coalesce(v_cuenta.a_costo, false), v_cuenta.destinatario_id
    )
    returning * into v_venta;

    return next v_venta;
    return;
  end if;

  select id into v_turno_id from public.turnos_caja where rol = 'jefe_zona' and not cerrado;
  if v_turno_id is null then
    raise exception 'No hay turno de caja abierto — ábrelo antes de registrar ventas.';
  end if;

  insert into public.ventas (
    producto_id, cantidad, precio_unitario, total, metodo_pago, referencia_pago, turno_id, vendido_por, cobrada_en
  ) values (
    p_producto_id, p_cantidad, v_precio, v_precio * p_cantidad,
    p_metodo_pago, v_referencia, v_turno_id, v_responsable, now()
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
$function$;

-- ── 5) cargar_cuenta_a_personal: si la cuenta es a_costo, el deudor SIEMPRE es su destinatario ──
-- No se puede cargar una cuenta a costo a un lavador ni a otra persona distinta de con quien se
-- abrió — el destinatario ya quedó fijo (y autorizado) al abrir la cuenta. El total ya está a
-- costo desde el insert de cada venta, así que no hay nada más que repreciar acá.
create or replace function public.cargar_cuenta_a_personal(
  p_cuenta_id uuid, p_lavador_id uuid, p_persona_id uuid, p_cerrada_por text
)
returns setof cuentas
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_cuenta cuentas;
  v_total integer;
  v_responsable text := nullif(trim(p_cerrada_por), '');
  v_pendiente record;
  v_turno_actual uuid;
  v_deudor text;
  v_lavador_id uuid;
  v_persona_id uuid;
begin
  if not interno.es_activo() or interno.rol_actual() not in ('jefe_zona', 'admin') then
    raise exception 'No autorizado para cerrar cuentas';
  end if;
  if v_responsable is null then
    raise exception 'Indica quién cierra la cuenta';
  end if;

  select * into v_cuenta from cuentas where id = p_cuenta_id for update;
  if not found then raise exception 'La cuenta no existe'; end if;
  if v_cuenta.estado <> 'abierta' then
    raise exception 'La cuenta ya está % — no se puede cerrar de nuevo', v_cuenta.estado;
  end if;

  if v_cuenta.a_costo then
    v_lavador_id := null;
    v_persona_id := v_cuenta.destinatario_id;
  else
    v_lavador_id := p_lavador_id;
    v_persona_id := p_persona_id;
  end if;
  v_deudor := interno.deudor_nombre(v_lavador_id, v_persona_id);

  select coalesce(sum(total), 0) into v_total from ventas where cuenta_id = p_cuenta_id and estado = 'pendiente';
  if v_total <= 0 then
    raise exception 'La cuenta no tiene productos pendientes — usa "Anular cuenta" si no se va a cobrar nada';
  end if;

  select id into v_turno_actual from turnos_caja where rol = 'jefe_zona' and not cerrado;

  update cuentas set estado = 'cerrada', cerrada_en = now(), cerrada_por = v_responsable, turno_id = v_turno_actual
  where id = p_cuenta_id returning * into v_cuenta;

  for v_pendiente in select * from ventas where cuenta_id = p_cuenta_id and estado = 'pendiente' for update
  loop
    update ventas set estado = 'activa', metodo_pago = 'cuenta_lavador', turno_id = v_turno_actual, cobrada_en = now()
    where id = v_pendiente.id;

    insert into movimientos_inventario (producto_id, tipo, cantidad, costo_unitario, motivo, responsable, venta_id)
    values (
      v_pendiente.producto_id, 'salida', -v_pendiente.cantidad, interno.costo_promedio_producto(v_pendiente.producto_id),
      'Venta #' || v_pendiente.consecutivo || ' (cargada' || (case when v_cuenta.a_costo then ' a costo' else '' end)
        || ' a ' || v_deudor || ' — cuenta: ' || v_cuenta.titular || ')',
      v_responsable, v_pendiente.id
    );
  end loop;

  insert into deudas_personal (lavador_id, persona_id, tipo, monto, cuenta_id, motivo, registrado_por)
  values (v_lavador_id, v_persona_id, 'consumo', v_total, p_cuenta_id,
    case when v_cuenta.a_costo then 'Retiro a costo — cuenta "' || v_cuenta.titular || '"'
         else 'Consumo de nevera — cuenta "' || v_cuenta.titular || '"' end,
    v_responsable);

  return next v_cuenta;
end;
$$;
