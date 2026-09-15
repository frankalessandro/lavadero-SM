-- Cadena de conteos de inventario (decisiones de Alessandro, 2026-09-15). Segunda fase de la
-- auditoría de falsos positivos; la primera fue el reinicio de 0067, que dejó el conteo base.
--
--   1. Esperado = lo contado en el conteo ANTERIOR del producto (reinicio, apertura, traspaso o
--      cierre, de cualquier turno) + lo que se registró entre ese conteo y ahora, desglosado
--      (anterior / vendido / entradas / otros) para que quien cuenta vea de dónde sale el número.
--   2. No se vende sin conteo de apertura del turno abierto, ni después de su conteo de cierre. No se
--      cierra un turno de jefe de zona sin conteo de cierre (trigger reactivado, sin excepciones).
--   3. Ventas mientras se cuenta: marca de tiempo al empezar; el preview marca lo que se movió (la UI
--      lo hace recontar) y el registro rechaza si algo se movió.
--   4. `contado_inicial` guarda el primer conteo cuando hubo reconteo.
--   5. Faltante de apertura = 'pendiente' sin responsable ("entre turnos"), en vez de ajuste silencioso.
--   6. Cierre y traspaso exigen confirmar una por una las cuentas abiertas y órdenes con productos sin
--      cobrar; queda la foto en `conteos_inventario.pendientes_confirmados`.
--   7. Traspaso de responsable a mitad de turno con conteo obligatorio: lo que falte hasta ahí queda a
--      nombre de quien entrega. RPC atómica `traspasar_turno` (antes: insert + update sueltos).
--   8. Anular venta / cuenta declarando si el producto se consumió. "Volvió a la nevera" no se acepta
--      si ya hubo un conteo después de la venta (ese conteo ya lo contó: sería doble).
--
-- Un solo motor (`interno.registrar_conteo`) para apertura, cierre y traspaso.

-- ── 0) Esquema ──────────────────────────────────────────────────────────────────────────────────
alter table public.conteos_inventario_lineas
  add column contado_inicial integer check (contado_inicial is null or contado_inicial >= 0);

alter table public.conteos_inventario
  add column pendientes_confirmados jsonb;

alter table public.conteos_inventario drop constraint conteos_inventario_momento_check;
alter table public.conteos_inventario add constraint conteos_inventario_momento_check
  check (momento in ('apertura', 'cierre', 'reinicio', 'traspaso'));

-- Puede haber varios traspasos por turno; apertura, cierre y reinicio siguen siendo uno solo.
alter table public.conteos_inventario drop constraint conteos_inventario_turno_id_momento_key;
create unique index conteos_inventario_turno_momento_unico
  on public.conteos_inventario (turno_id, momento) where momento <> 'traspaso';

alter table public.traspasos_turno
  add column conteo_id uuid references public.conteos_inventario(id);

-- ── 1) Esperado encadenado ──────────────────────────────────────────────────────────────────────
drop function if exists interno.esperado_inventario(uuid, text);

create function interno.esperado_inventario(p_turno_id uuid, p_momento text)
returns table(
  producto_id uuid, nombre text, unidad_medida text,
  esperado integer, stock_sistema integer, en_cuentas_pendientes integer,
  anterior integer, anterior_en timestamptz, vendido integer, entradas integer, otros integer
)
language sql stable security definer set search_path to 'public'
as $$
  with base as (
    -- Último conteo de cada producto. Los ajustes que inserta ese mismo conteo comparten `now()`
    -- con su cabecera, así que el `>` estricto de abajo los deja fuera.
    select distinct on (l.producto_id)
      l.producto_id, l.contado, l.en_cuentas_pendientes, c.creado_en
    from conteos_inventario_lineas l
    join conteos_inventario c on c.id = l.conteo_id
    order by l.producto_id, c.creado_en desc
  ), calc as (
    select
      pr.id, pr.nombre, pr.unidad_medida,
      interno.stock_producto(pr.id) as stock,
      interno.comprometido_producto(pr.id) as comp,
      b.contado as anterior,
      b.en_cuentas_pendientes as comp_anterior,
      b.creado_en as anterior_en,
      coalesce((select sum(m.cantidad) from movimientos_inventario m
                where m.producto_id = pr.id and m.creado_en > b.creado_en
                  and m.venta_id is not null), 0)::integer as mov_ventas,
      coalesce((select sum(m.cantidad) from movimientos_inventario m
                where m.producto_id = pr.id and m.creado_en > b.creado_en
                  and m.venta_id is null and (m.compra_id is not null or m.tipo = 'entrada')), 0)::integer as mov_entradas,
      coalesce((select sum(m.cantidad) from movimientos_inventario m
                where m.producto_id = pr.id and m.creado_en > b.creado_en
                  and m.venta_id is null and m.compra_id is null and m.tipo <> 'entrada'), 0)::integer as mov_otros
    from productos pr
    left join base b on b.producto_id = pr.id
    where pr.activo and pr.precio_venta is not null
  )
  select
    id, nombre, unidad_medida,
    -- Un producto que nunca se ha contado (recién creado) arranca desde el stock del sistema.
    case when anterior is null then stock - comp
         else anterior + mov_ventas + mov_entradas + mov_otros - (comp - comp_anterior) end,
    stock, comp, anterior, anterior_en,
    -- "Vendido" = lo que salió de la nevera por ventas: salidas de ventas cobradas + lo cargado a
    -- órdenes/cuentas que sigue pendiente, neto de lo que se cobró de lo que ya estaba pendiente.
    case when anterior is null then 0 else -mov_ventas + (comp - comp_anterior) end,
    case when anterior is null then 0 else mov_entradas end,
    case when anterior is null then 0 else mov_otros end
  from calc
  order by nombre;
$$;

revoke execute on function interno.esperado_inventario(uuid, text) from public, anon, authenticated;

-- ¿El producto se movió desde la marca? Movimientos, cargas pendientes o anulaciones.
create function interno.producto_movido_desde(p_producto_id uuid, p_desde timestamptz)
returns boolean
language sql stable security definer set search_path to 'public'
as $$
  select p_desde is not null and (
    exists (select 1 from movimientos_inventario where producto_id = p_producto_id and creado_en > p_desde)
    or exists (select 1 from ventas where producto_id = p_producto_id and (creado_en > p_desde or anulada_en > p_desde))
  );
$$;

revoke execute on function interno.producto_movido_desde(uuid, timestamptz) from public, anon, authenticated;

create function interno.exigir_sin_movimiento_desde(p_desde timestamptz)
returns void
language plpgsql stable security definer set search_path to 'public'
as $$
declare
  v_movidos text;
begin
  if p_desde is null then return; end if;
  select string_agg(pr.nombre, ', ' order by pr.nombre) into v_movidos
  from productos pr
  where pr.activo and pr.precio_venta is not null
    and interno.producto_movido_desde(pr.id, p_desde);
  if v_movidos is not null then
    raise exception 'Mientras contabas se registraron movimientos de: %. Vuelve a contar esos productos.', v_movidos;
  end if;
end;
$$;

revoke execute on function interno.exigir_sin_movimiento_desde(timestamptz) from public, anon, authenticated;

-- ── 2) Candado de venta ─────────────────────────────────────────────────────────────────────────
create function interno.exigir_conteo_apertura()
returns void
language plpgsql stable security definer set search_path to 'public'
as $$
declare
  v_turno_id uuid;
begin
  select id into v_turno_id from turnos_caja where rol = 'jefe_zona' and not cerrado;
  if v_turno_id is null then
    raise exception 'No hay turno de caja abierto — ábrelo antes de registrar ventas.';
  end if;
  if not exists (
    select 1 from conteos_inventario where turno_id = v_turno_id and momento in ('apertura', 'reinicio')
  ) then
    raise exception 'Antes de vender hay que contar el inventario de apertura (Caja → Contar inventario).';
  end if;
  if exists (select 1 from conteos_inventario where turno_id = v_turno_id and momento = 'cierre') then
    raise exception 'Este turno ya hizo su conteo de cierre — cierra el turno y abre uno nuevo para seguir vendiendo.';
  end if;
end;
$$;

revoke execute on function interno.exigir_conteo_apertura() from public, anon, authenticated;

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

  -- 0068: cargar a una orden/cuenta también saca producto de la nevera — mismo candado.
  perform interno.exigir_conteo_apertura();
  perform interno.exigir_disponible(p_producto_id, p_cantidad);

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

  select id into v_turno_id from public.turnos_caja where rol = 'jefe_zona' and not cerrado;
  if v_turno_id is null then
    raise exception 'No hay turno de caja abierto — ábrelo antes de registrar ventas.';
  end if;

  insert into public.ventas (
    producto_id, cantidad, precio_unitario, total, metodo_pago, referencia_pago, turno_id, vendido_por, cobrada_en
  ) values (
    p_producto_id, p_cantidad, v_producto.precio_venta, v_producto.precio_venta * p_cantidad,
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

create or replace function public.registrar_venta_carrito(p_items jsonb, p_pagos jsonb, p_vendido_por text)
returns setof ventas
language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_grupo uuid := gen_random_uuid();
  v_turno_id uuid;
  v_responsable text := nullif(trim(p_vendido_por), '');
  v_item jsonb;
  v_pago jsonb;
  v_producto record;
  v_venta public.ventas;
  v_cantidad integer;
  v_total_items integer := 0;
  v_total_pagos integer := 0;
  v_n_pagos integer;
  v_metodo text;
  v_monto integer;
  v_ref text;
  v_metodos text[] := array[]::text[];
  v_metodo_resumen text;
  v_ref_resumen text;
begin
  if not interno.es_activo() or interno.rol_actual() not in ('jefe_zona', 'admin') then
    raise exception 'No autorizado para registrar ventas';
  end if;
  if v_responsable is null then
    raise exception 'El responsable de la venta es obligatorio';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'El carrito no tiene productos';
  end if;
  if p_pagos is null or jsonb_typeof(p_pagos) <> 'array' then
    raise exception 'Se requiere al menos una línea de pago';
  end if;
  v_n_pagos := jsonb_array_length(p_pagos);
  if v_n_pagos < 1 or v_n_pagos > 3 then
    raise exception 'El cobro admite entre 1 y 3 líneas de pago (recibidas: %)', v_n_pagos;
  end if;

  select id into v_turno_id from public.turnos_caja where rol = 'jefe_zona' and not cerrado;
  if v_turno_id is null then
    raise exception 'No hay turno de caja abierto — ábrelo antes de registrar ventas.';
  end if;
  perform interno.exigir_conteo_apertura();

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

  if (select count(distinct m) from unnest(v_metodos) m) = 1 then
    v_metodo_resumen := v_metodos[1];
    v_ref_resumen := nullif(trim(p_pagos->0->>'referencia'), '');
  else
    v_metodo_resumen := 'mixto';
    v_ref_resumen := null;
  end if;

  for v_item in select value from jsonb_array_elements(p_items) as t(value)
  loop
    v_cantidad := nullif(v_item->>'cantidad', '')::integer;
    if v_cantidad is null or v_cantidad <= 0 then
      raise exception 'La cantidad debe ser mayor a cero';
    end if;

    select nombre, activo, precio_venta into v_producto
    from public.productos where id = (v_item->>'producto_id')::uuid;
    if not found then
      raise exception 'El producto seleccionado no existe';
    end if;
    if not v_producto.activo then
      raise exception 'El producto "%" está inactivo — actívalo desde /admin/dinero/inventario antes de venderlo.', v_producto.nombre;
    end if;
    if v_producto.precio_venta is null then
      raise exception 'El producto "%" no tiene precio de venta configurado — defínelo desde /admin/dinero/inventario.', v_producto.nombre;
    end if;

    perform interno.exigir_disponible((v_item->>'producto_id')::uuid, v_cantidad);

    insert into public.ventas (
      producto_id, cantidad, precio_unitario, total, metodo_pago, referencia_pago,
      turno_id, vendido_por, estado, venta_grupo_id, cobrada_en
    ) values (
      (v_item->>'producto_id')::uuid, v_cantidad, v_producto.precio_venta,
      v_producto.precio_venta * v_cantidad, v_metodo_resumen, v_ref_resumen,
      v_turno_id, v_responsable, 'activa', v_grupo, now()
    )
    returning * into v_venta;

    insert into public.movimientos_inventario (
      producto_id, tipo, cantidad, costo_unitario, motivo, responsable, venta_id
    ) values (
      v_venta.producto_id, 'salida', -v_venta.cantidad,
      interno.costo_promedio_producto(v_venta.producto_id),
      'Venta #' || v_venta.consecutivo, v_responsable, v_venta.id
    );

    v_total_items := v_total_items + v_venta.total;
    return next v_venta;
  end loop;

  if v_total_pagos <> v_total_items then
    raise exception 'Las líneas de pago suman % pero el carrito totaliza %', v_total_pagos, v_total_items;
  end if;

  for v_pago in select value from jsonb_array_elements(p_pagos) as t(value)
  loop
    insert into public.pagos (venta_grupo_id, metodo_pago, monto, referencia_pago, turno_id)
    values (
      v_grupo, v_pago->>'metodo', (v_pago->>'monto')::integer,
      nullif(trim(v_pago->>'referencia'), ''), v_turno_id
    );
  end loop;
end;
$function$;

-- ── 3) Marca de tiempo, preview y pendientes por confirmar ──────────────────────────────────────
create function public.marca_conteo_inventario()
returns timestamptz
language plpgsql stable security definer set search_path to 'public'
as $$
begin
  if not interno.es_activo() or interno.rol_actual() not in ('jefe_zona', 'admin') then
    raise exception 'No autorizado';
  end if;
  return now();
end;
$$;

revoke execute on function public.marca_conteo_inventario() from public, anon;
grant execute on function public.marca_conteo_inventario() to authenticated;

drop function if exists public.preview_conteo_inventario(uuid, text);

create function public.preview_conteo_inventario(p_turno_id uuid, p_momento text, p_desde timestamptz default null)
returns table(
  producto_id uuid, nombre text, unidad_medida text, esperado integer, en_cuentas_pendientes integer,
  anterior integer, anterior_en timestamptz, vendido integer, entradas integer, otros integer,
  movido boolean, marca timestamptz
)
language plpgsql stable security definer set search_path to 'public'
as $$
begin
  if not interno.es_activo() or interno.rol_actual() not in ('jefe_zona', 'admin') then
    raise exception 'No autorizado';
  end if;
  if p_momento not in ('apertura', 'cierre', 'traspaso') then
    raise exception 'Momento inválido: %', p_momento;
  end if;
  return query
    select e.producto_id, e.nombre, e.unidad_medida, e.esperado, e.en_cuentas_pendientes,
      e.anterior, e.anterior_en, e.vendido, e.entradas, e.otros,
      interno.producto_movido_desde(e.producto_id, p_desde), now()
    from interno.esperado_inventario(p_turno_id, p_momento) e;
end;
$$;

revoke execute on function public.preview_conteo_inventario(uuid, text, timestamptz) from public, anon;
grant execute on function public.preview_conteo_inventario(uuid, text, timestamptz) to authenticated;

-- Cuentas y órdenes con productos cargados sin cobrar: el producto ya salió de la nevera y nadie
-- lo ha pagado. Sin filtrar por estado del padre a propósito — cualquier venta pendiente pesa en
-- el comprometido, así que cualquiera debe poder confirmarse.
create function interno.pendientes_cobro()
returns table(tipo text, id uuid, titulo text, desde timestamptz, detalle text, total integer)
language sql stable security definer set search_path to 'public'
as $$
  select * from (
    select 'cuenta'::text, c.id, c.titular, min(v.creado_en),
      string_agg(v.cantidad || '× ' || pr.nombre, ', ' order by pr.nombre), sum(v.total)::integer
    from cuentas c
    join ventas v on v.cuenta_id = c.id and v.estado = 'pendiente'
    join productos pr on pr.id = v.producto_id
    group by c.id, c.titular
    union all
    select 'orden'::text, o.id, 'Orden #' || o.consecutivo || ' · ' || o.placa, min(v.creado_en),
      string_agg(v.cantidad || '× ' || pr.nombre, ', ' order by pr.nombre), sum(v.total)::integer
    from ordenes o
    join ventas v on v.orden_id = o.id and v.estado = 'pendiente'
    join productos pr on pr.id = v.producto_id
    group by o.id, o.consecutivo, o.placa
  ) p(tipo, id, titulo, desde, detalle, total)
  order by desde;
$$;

revoke execute on function interno.pendientes_cobro() from public, anon, authenticated;

create function public.pendientes_por_confirmar()
returns table(tipo text, id uuid, titulo text, desde timestamptz, detalle text, total integer)
language plpgsql stable security definer set search_path to 'public'
as $$
begin
  if not interno.es_activo() or interno.rol_actual() not in ('jefe_zona', 'admin') then
    raise exception 'No autorizado';
  end if;
  return query select * from interno.pendientes_cobro();
end;
$$;

revoke execute on function public.pendientes_por_confirmar() from public, anon;
grant execute on function public.pendientes_por_confirmar() to authenticated;

-- ── 4) Motor único de conteo ────────────────────────────────────────────────────────────────────
drop function if exists public.abrir_conteo_inventario(uuid, jsonb, text);
drop function if exists public.cerrar_conteo_inventario(uuid, jsonb, text);

create function interno.registrar_conteo(
  p_turno_id uuid, p_momento text, p_lineas jsonb, p_justificacion text, p_desde timestamptz, p_confirmados jsonb
)
returns conteos_inventario
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_turno turnos_caja;
  v_conteo conteos_inventario;
  v_justif text := nullif(trim(p_justificacion), '');
  v_prod record;
  v_linea jsonb;
  v_contado integer;
  v_diff integer;
  v_mov_id uuid;
  v_valor integer;
  v_responde uuid;
  v_motivo text;
  v_estado text;
  v_hay_diferencia boolean := false;
  v_faltan text;
  v_snapshot jsonb;
  v_etiqueta text;
begin
  if not interno.es_activo() or interno.rol_actual() not in ('jefe_zona', 'admin') then
    raise exception 'No autorizado para registrar el conteo de inventario';
  end if;
  if p_momento not in ('apertura', 'cierre', 'traspaso') then
    raise exception 'Momento de conteo inválido: %', p_momento;
  end if;
  if p_lineas is null or jsonb_typeof(p_lineas) <> 'array' then
    raise exception 'Se requiere el conteo de cada producto';
  end if;

  select * into v_turno from turnos_caja where id = p_turno_id for update;
  if not found then raise exception 'El turno no existe'; end if;
  if v_turno.rol <> 'jefe_zona' then raise exception 'El conteo de inventario es solo del turno de jefe de zona'; end if;
  if v_turno.cerrado then raise exception 'El turno ya está cerrado'; end if;

  if p_momento = 'apertura' then
    if exists (select 1 from conteos_inventario where turno_id = p_turno_id and momento in ('apertura', 'reinicio')) then
      raise exception 'Este turno ya tiene conteo de apertura';
    end if;
  elsif not exists (select 1 from conteos_inventario where turno_id = p_turno_id and momento in ('apertura', 'reinicio')) then
    raise exception 'Primero registra el conteo de apertura de este turno';
  end if;
  if exists (select 1 from conteos_inventario where turno_id = p_turno_id and momento = 'cierre') then
    raise exception 'Este turno ya tiene conteo de cierre';
  end if;

  perform interno.exigir_sin_movimiento_desde(p_desde);

  -- Cierre y traspaso: quien entrega confirma cada cuenta/orden con productos sin cobrar.
  if p_momento in ('cierre', 'traspaso') then
    select string_agg(p.titulo, ', ') into v_faltan
    from interno.pendientes_cobro() p
    where not (coalesce(p_confirmados, '[]'::jsonb) ? p.id::text);
    if v_faltan is not null then
      raise exception 'Falta confirmar las cuentas/órdenes con productos sin cobrar: %', v_faltan;
    end if;
    select coalesce(jsonb_agg(to_jsonb(p)), '[]'::jsonb) into v_snapshot from interno.pendientes_cobro() p;
  end if;

  for v_prod in select * from interno.esperado_inventario(p_turno_id, p_momento)
  loop
    v_contado := (
      select (l->>'contado')::int from jsonb_array_elements(p_lineas) l
      where (l->>'producto_id')::uuid = v_prod.producto_id
    );
    if v_contado is null then
      raise exception 'Falta contar: %', v_prod.nombre;
    end if;
    if v_contado <> v_prod.esperado then v_hay_diferencia := true; end if;
  end loop;

  if v_hay_diferencia and v_justif is null then
    raise exception 'Hay diferencias en el conteo — la justificación es obligatoria';
  end if;

  insert into conteos_inventario (
    turno_id, momento, contado_por, contado_por_persona_id, justificacion, pendientes_confirmados
  ) values (
    p_turno_id, p_momento, v_turno.responsable_actual, v_turno.responsable_actual_persona_id, v_justif, v_snapshot
  )
  returning * into v_conteo;

  v_etiqueta := case p_momento
    when 'apertura' then 'Conteo de apertura'
    when 'cierre' then 'Conteo de cierre'
    else 'Conteo de traspaso (entrega ' || v_turno.responsable_actual || ')'
  end;

  for v_prod in select * from interno.esperado_inventario(p_turno_id, p_momento)
  loop
    v_linea := (
      select l from jsonb_array_elements(p_lineas) l
      where (l->>'producto_id')::uuid = v_prod.producto_id
    );
    v_contado := (v_linea->>'contado')::int;
    v_diff := v_contado - v_prod.esperado;
    v_mov_id := null;
    v_valor := 0;
    v_responde := null;
    v_estado := 'ninguno';
    v_motivo := nullif(trim(v_linea->>'motivo'), '');

    if v_diff <> 0 then
      insert into movimientos_inventario (producto_id, tipo, cantidad, motivo, responsable)
      values (
        v_prod.producto_id, 'ajuste', v_diff,
        v_etiqueta || coalesce(' — ' || coalesce(v_motivo, v_justif), ''),
        v_turno.responsable_actual
      )
      returning id into v_mov_id;
    end if;

    if v_diff < 0 then
      v_valor := abs(v_diff) * coalesce(interno.costo_promedio_producto(v_prod.producto_id), 0);
      v_estado := 'pendiente';
      -- Apertura: se perdió entre turnos, nadie tenía la nevera → sin responsable, lo revisa admin.
      -- Cierre/traspaso: responde quien tiene el turno ahora (en el traspaso, todavía quien entrega).
      if p_momento <> 'apertura' then
        v_responde := coalesce(
          nullif(v_linea->>'responde_persona_id', '')::uuid,
          v_turno.responsable_actual_persona_id
        );
      end if;
    end if;

    insert into conteos_inventario_lineas (
      conteo_id, producto_id, esperado, contado, contado_inicial, en_cuentas_pendientes,
      diferencia, valor_diferencia, responde_persona_id, motivo, ajuste_movimiento_id, estado_faltante
    ) values (
      v_conteo.id, v_prod.producto_id, v_prod.esperado, v_contado,
      nullif(v_linea->>'contado_inicial', '')::int, v_prod.en_cuentas_pendientes,
      v_diff, v_valor, v_responde, v_motivo, v_mov_id, v_estado
    );
  end loop;

  return v_conteo;
end;
$$;

revoke execute on function interno.registrar_conteo(uuid, text, jsonb, text, timestamptz, jsonb) from public, anon, authenticated;

create function public.abrir_conteo_inventario(
  p_turno_id uuid, p_lineas jsonb, p_justificacion text, p_desde timestamptz default null
)
returns setof conteos_inventario
language plpgsql security definer set search_path to 'public'
as $$
begin
  return next interno.registrar_conteo(p_turno_id, 'apertura', p_lineas, p_justificacion, p_desde, null);
end;
$$;

create function public.cerrar_conteo_inventario(
  p_turno_id uuid, p_lineas jsonb, p_justificacion text, p_desde timestamptz default null,
  p_confirmados jsonb default null
)
returns setof conteos_inventario
language plpgsql security definer set search_path to 'public'
as $$
begin
  return next interno.registrar_conteo(p_turno_id, 'cierre', p_lineas, p_justificacion, p_desde, p_confirmados);
end;
$$;

revoke execute on function public.abrir_conteo_inventario(uuid, jsonb, text, timestamptz) from public, anon;
revoke execute on function public.cerrar_conteo_inventario(uuid, jsonb, text, timestamptz, jsonb) from public, anon;
grant execute on function public.abrir_conteo_inventario(uuid, jsonb, text, timestamptz) to authenticated;
grant execute on function public.cerrar_conteo_inventario(uuid, jsonb, text, timestamptz, jsonb) to authenticated;

-- ── 5) Traspaso de responsable con conteo ───────────────────────────────────────────────────────
-- Conteo obligatorio solo mientras el turno tiene inventario "a cargo": con apertura y sin cierre.
-- Antes de la apertura no se ha vendido nada; después del cierre ya no se vende.
create function public.traspasar_turno(
  p_turno_id uuid, p_a_persona_id uuid,
  p_lineas jsonb default null, p_justificacion text default null,
  p_desde timestamptz default null, p_confirmados jsonb default null
)
returns setof turnos_caja
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_turno turnos_caja;
  v_a record;
  v_conteo conteos_inventario;
begin
  if not interno.es_activo() or interno.rol_actual() not in ('jefe_zona', 'admin') then
    raise exception 'No autorizado para transferir el turno';
  end if;

  select * into v_turno from turnos_caja where id = p_turno_id for update;
  if not found then raise exception 'El turno no existe'; end if;
  if v_turno.rol <> 'jefe_zona' then raise exception 'Este traspaso es del turno de jefe de zona'; end if;
  if v_turno.cerrado then raise exception 'El turno ya está cerrado'; end if;

  select id, nombre into v_a from perfiles where id = p_a_persona_id;
  if not found then raise exception 'La persona que recibe no existe'; end if;
  if p_a_persona_id = v_turno.responsable_actual_persona_id then
    raise exception 'Esa persona ya está a cargo del turno';
  end if;

  if exists (select 1 from conteos_inventario where turno_id = p_turno_id and momento in ('apertura', 'reinicio'))
     and not exists (select 1 from conteos_inventario where turno_id = p_turno_id and momento = 'cierre')
  then
    v_conteo := interno.registrar_conteo(p_turno_id, 'traspaso', p_lineas, p_justificacion, p_desde, p_confirmados);
  end if;

  insert into traspasos_turno (turno_id, de, a, de_persona_id, a_persona_id, conteo_id)
  values (
    p_turno_id, v_turno.responsable_actual, coalesce(nullif(trim(v_a.nombre), ''), 'Sin nombre'),
    v_turno.responsable_actual_persona_id, p_a_persona_id, v_conteo.id
  );

  update turnos_caja set
    responsable_actual = coalesce(nullif(trim(v_a.nombre), ''), 'Sin nombre'),
    responsable_actual_persona_id = p_a_persona_id
  where id = p_turno_id
  returning * into v_turno;

  return next v_turno;
end;
$$;

revoke execute on function public.traspasar_turno(uuid, uuid, jsonb, text, timestamptz, jsonb) from public, anon;
grant execute on function public.traspasar_turno(uuid, uuid, jsonb, text, timestamptz, jsonb) to authenticated;

-- Cierra el camino viejo (UPDATE directo de responsable desde el cliente): si el turno tiene
-- inventario a cargo, el cambio de responsable exige un conteo de traspaso en esta misma transacción.
create function interno.jefe_zona_traspaso_requiere_conteo()
returns trigger
language plpgsql set search_path to 'public'
as $$
begin
  if new.rol = 'jefe_zona' and not old.cerrado
     and new.responsable_actual_persona_id is distinct from old.responsable_actual_persona_id
     and exists (select 1 from conteos_inventario where turno_id = new.id and momento in ('apertura', 'reinicio'))
     and not exists (select 1 from conteos_inventario where turno_id = new.id and momento = 'cierre')
     and not exists (select 1 from conteos_inventario where turno_id = new.id and momento = 'traspaso' and creado_en = now())
  then
    raise exception 'Transferir el turno requiere contar el inventario (Caja → Transferir responsabilidad)';
  end if;
  return new;
end;
$$;

create trigger turnos_caja_traspaso_requiere_conteo
  before update on public.turnos_caja
  for each row execute function interno.jefe_zona_traspaso_requiere_conteo();

-- ── 6) Cierre de turno exige conteo de cierre, siempre ──────────────────────────────────────────
create or replace function interno.jefe_zona_cierre_requiere_conteo()
returns trigger
language plpgsql set search_path to 'public'
as $$
begin
  if new.cerrado and not old.cerrado and new.rol = 'jefe_zona'
     and not exists (select 1 from conteos_inventario where turno_id = new.id and momento = 'cierre')
  then
    if not exists (select 1 from conteos_inventario where turno_id = new.id and momento in ('apertura', 'reinicio')) then
      raise exception 'Este turno no tiene conteo de inventario: registra el de apertura y luego el de cierre antes de cerrar';
    end if;
    raise exception 'Antes de cerrar el turno hay que registrar el conteo de inventario de cierre';
  end if;
  return new;
end;
$$;

alter table public.turnos_caja enable trigger turnos_caja_cierre_requiere_conteo;

-- ── 7) Anular declarando si el producto se consumió ─────────────────────────────────────────────
-- Si ya hubo un conteo después de que el producto salió, ese conteo ya lo registró como estaba:
-- decir ahora que "volvió" lo sumaría dos veces.
create function interno.exigir_volvio_sin_conteo(p_salio_en timestamptz, p_consecutivo integer)
returns void
language plpgsql stable security definer set search_path to 'public'
as $$
declare
  v_conteo_en timestamptz;
begin
  select min(creado_en) into v_conteo_en from conteos_inventario where creado_en > p_salio_en;
  if v_conteo_en is not null then
    raise exception 'La venta #% es anterior al conteo de inventario del % — si el producto volvió, ese conteo ya lo contó. Márcalo como consumido.',
      p_consecutivo, to_char(v_conteo_en at time zone 'America/Bogota', 'DD/MM HH24:MI');
  end if;
end;
$$;

revoke execute on function interno.exigir_volvio_sin_conteo(timestamptz, integer) from public, anon, authenticated;

drop function if exists public.anular_venta(uuid, text, text);

create function public.anular_venta(
  p_venta_id uuid, p_motivo text, p_anulada_por text, p_se_consumio boolean default false
)
returns setof ventas
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_venta public.ventas;
  v_row record;
  v_grupo uuid;
  v_motivo text := nullif(trim(p_motivo), '');
  v_responsable text := nullif(trim(p_anulada_por), '');
  v_anulo_objetivo boolean := false;
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
  if p_se_consumio is null then
    raise exception 'Indica si el producto se consumió o volvió a la nevera';
  end if;

  select * into v_venta from public.ventas where id = p_venta_id for update;
  if not found then
    raise exception 'La venta no existe';
  end if;
  v_grupo := v_venta.venta_grupo_id;

  for v_row in
    select * from public.ventas
    where (id = p_venta_id or (v_grupo is not null and venta_grupo_id = v_grupo))
      and estado in ('activa', 'pendiente')
    for update
  loop
    if not p_se_consumio then
      perform interno.exigir_volvio_sin_conteo(v_row.creado_en, v_row.consecutivo);
    end if;

    update public.ventas set
      estado = 'anulada', motivo_anulacion = v_motivo,
      anulada_por = v_responsable, anulada_en = now()
    where id = v_row.id;

    if v_row.estado = 'activa' and not p_se_consumio then
      -- Ya había descontado stock y el producto volvió: se repone (sin costo, no mueve el promedio).
      insert into public.movimientos_inventario (
        producto_id, tipo, cantidad, motivo, responsable, venta_id
      ) values (
        v_row.producto_id, 'entrada', v_row.cantidad,
        'Reverso por anulación de venta #' || v_row.consecutivo, v_responsable, v_row.id
      );
    elsif v_row.estado = 'pendiente' and p_se_consumio then
      -- Nunca descontó stock pero el producto ya no está: sale como consumo sin cobro.
      insert into public.movimientos_inventario (
        producto_id, tipo, cantidad, costo_unitario, motivo, responsable, venta_id
      ) values (
        v_row.producto_id, 'salida', -v_row.cantidad, interno.costo_promedio_producto(v_row.producto_id),
        'Consumido sin cobro — venta #' || v_row.consecutivo || ' anulada: ' || v_motivo,
        v_responsable, v_row.id
      );
    end if;

    if v_row.id = p_venta_id then
      v_anulo_objetivo := true;
    end if;
  end loop;

  if not v_anulo_objetivo then
    raise exception 'La venta ya estaba anulada';
  end if;

  if v_grupo is not null then
    update public.pagos set anulado = true where venta_grupo_id = v_grupo and anulado = false;
  end if;

  select * into v_venta from public.ventas where id = p_venta_id;
  return next v_venta;
end;
$$;

revoke execute on function public.anular_venta(uuid, text, text, boolean) from public, anon;
grant execute on function public.anular_venta(uuid, text, text, boolean) to authenticated;

drop function if exists public.anular_cuenta(uuid, text, text);

create function public.anular_cuenta(
  p_cuenta_id uuid, p_motivo text, p_anulada_por text, p_se_consumio boolean default false
)
returns setof cuentas
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_cuenta public.cuentas;
  v_row record;
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
  if p_se_consumio is null then
    raise exception 'Indica si los productos se consumieron o volvieron a la nevera';
  end if;

  select * into v_cuenta from public.cuentas where id = p_cuenta_id for update;
  if not found then
    raise exception 'La cuenta no existe';
  end if;
  if v_cuenta.estado <> 'abierta' then
    raise exception 'La cuenta ya está % — no se puede anular', v_cuenta.estado;
  end if;

  for v_row in
    select * from public.ventas where cuenta_id = p_cuenta_id and estado = 'pendiente' for update
  loop
    if p_se_consumio then
      insert into public.movimientos_inventario (
        producto_id, tipo, cantidad, costo_unitario, motivo, responsable, venta_id
      ) values (
        v_row.producto_id, 'salida', -v_row.cantidad, interno.costo_promedio_producto(v_row.producto_id),
        'Consumido sin cobro — cuenta "' || v_cuenta.titular || '" anulada: ' || v_motivo,
        v_responsable, v_row.id
      );
    else
      perform interno.exigir_volvio_sin_conteo(v_row.creado_en, v_row.consecutivo);
    end if;

    update public.ventas set
      estado = 'anulada', motivo_anulacion = v_motivo, anulada_por = v_responsable, anulada_en = now()
    where id = v_row.id;
  end loop;

  update public.cuentas set estado = 'anulada'
  where id = p_cuenta_id
  returning * into v_cuenta;

  return next v_cuenta;
end;
$$;

revoke execute on function public.anular_cuenta(uuid, text, text, boolean) from public, anon;
grant execute on function public.anular_cuenta(uuid, text, text, boolean) to authenticated;

notify pgrst, 'reload schema';
