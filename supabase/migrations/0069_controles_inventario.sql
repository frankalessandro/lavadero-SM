-- Controles de integridad del inventario (auditoría 2026-09-15, tras 0068). Cierra caminos que
-- saltaban las RPC y dejaban el inventario sin rastro confiable.
--
--   1. RLS: `ventas` tenía INSERT/UPDATE directo para jefe_zona y admin — se podía anular una venta
--      sin reponer stock, cambiar cantidad/total o crear pendientes sin candado ni disponible. Y
--      admin podía EDITAR movimientos históricos (cantidad, fecha). Ninguna pantalla usa esos
--      caminos: todo va por RPC `security definer`. Se quitan las policies.
--   2. Movimientos manuales solo por RPC `registrar_movimiento_inventario`: justificación obligatoria
--      (mín. 10 caracteres) en entradas, salidas y ajustes, responsable fijado por el servidor (el del
--      turno abierto para jefe de zona), fecha = ahora, signo validado, sin poder colgarlos de una
--      venta o compra. Decisión de Alessandro: el jefe de patio puede subir y bajar stock, pero con
--      responsable y justificación, visible para gerencia (`movimientos_manuales`).
--   3. CHECK de signo en `movimientos_inventario` (entrada > 0, salida < 0) — antes solo lo validaba
--      el cliente.
--   4. `anular_orden` declara qué pasó con los productos (pendientes y ya cobrados); el trigger de
--      anulación deja de asumir en silencio que volvieron a la nevera.
--   5. No se inactiva un producto con stock o unidades cargadas sin cobrar: desaparecería del conteo
--      y el descuadre se volvería invisible.

-- ── 1) RLS ──────────────────────────────────────────────────────────────────────────────────────
drop policy if exists ventas_jefe_zona_insert on public.ventas;
drop policy if exists ventas_jefe_zona_update on public.ventas;
drop policy if exists ventas_admin_insert on public.ventas;
drop policy if exists ventas_admin_update on public.ventas;
drop policy if exists movimientos_admin_insert on public.movimientos_inventario;
drop policy if exists movimientos_admin_update on public.movimientos_inventario;

drop trigger if exists movimientos_inventario_operativo_insert_trigger on public.movimientos_inventario_operativo;
drop function if exists public.movimientos_inventario_operativo_insert();

-- ── 2) Signo ────────────────────────────────────────────────────────────────────────────────────
alter table public.movimientos_inventario add constraint movimientos_inventario_signo_check
  check ((tipo = 'entrada' and cantidad > 0) or (tipo = 'salida' and cantidad < 0) or tipo = 'ajuste');

-- ── 3) Movimiento manual ────────────────────────────────────────────────────────────────────────
create function public.registrar_movimiento_inventario(
  p_producto_id uuid, p_tipo text, p_cantidad integer, p_motivo text,
  p_costo_unitario integer default null, p_proveedor text default null
)
returns uuid
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_rol text := interno.rol_actual();
  v_motivo text := nullif(trim(p_motivo), '');
  v_proveedor text := nullif(trim(p_proveedor), '');
  v_turno turnos_caja;
  v_responsable text;
  v_id uuid;
begin
  if not interno.es_activo() or v_rol not in ('jefe_zona', 'admin') then
    raise exception 'No autorizado para registrar movimientos de inventario';
  end if;
  if not exists (select 1 from productos where id = p_producto_id) then
    raise exception 'El producto no existe';
  end if;
  if p_tipo not in ('entrada', 'salida', 'ajuste') then
    raise exception 'Tipo de movimiento inválido: %', p_tipo;
  end if;
  if p_cantidad is null or p_cantidad = 0 then
    raise exception 'La cantidad no puede ser cero';
  end if;
  if (p_tipo = 'entrada' and p_cantidad < 0) or (p_tipo = 'salida' and p_cantidad > 0) then
    raise exception 'El signo de la cantidad no corresponde al tipo de movimiento';
  end if;
  if v_motivo is null or length(v_motivo) < 10 then
    raise exception 'La justificación es obligatoria (mínimo 10 caracteres): explica qué pasó';
  end if;
  if p_costo_unitario is not null and p_costo_unitario < 0 then
    raise exception 'El costo unitario no puede ser negativo';
  end if;

  if v_rol = 'jefe_zona' then
    select * into v_turno from turnos_caja where rol = 'jefe_zona' and not cerrado;
    if v_turno.id is null then
      raise exception 'Necesitas un turno de caja abierto para registrar movimientos de inventario';
    end if;
    if p_costo_unitario is not null or v_proveedor is not null then
      raise exception 'El costo y el proveedor los registra gerencia — para mercancía nueva usa Compras';
    end if;
    v_responsable := v_turno.responsable_actual;
  else
    v_responsable := coalesce(nullif(trim(interno.actor() ->> 'persona_nombre'), ''), 'Administrador');
  end if;

  insert into movimientos_inventario (producto_id, tipo, cantidad, costo_unitario, proveedor, motivo, responsable)
  values (p_producto_id, p_tipo, p_cantidad, p_costo_unitario, v_proveedor, v_motivo, v_responsable)
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.registrar_movimiento_inventario(uuid, text, integer, text, integer, text) from public, anon;
grant execute on function public.registrar_movimiento_inventario(uuid, text, integer, text, integer, text) to authenticated;

-- Para gerencia: todo lo que movió stock a mano (ni venta, ni compra, ni conteo).
create function public.movimientos_manuales(p_desde timestamptz)
returns table(
  id uuid, producto_id uuid, producto text, tipo text, cantidad integer, motivo text, responsable text,
  registrado_por text, creado_en timestamptz
)
language plpgsql stable security definer set search_path to 'public'
as $$
begin
  if not interno.es_activo() or not interno.es_admin() then
    raise exception 'No autorizado';
  end if;
  return query
    select m.id, m.producto_id, pr.nombre, m.tipo, m.cantidad, m.motivo, m.responsable,
      (select b.usuario_nombre from bitacora b
       where b.entidad = 'movimientos_inventario' and b.entidad_id = m.id::text limit 1),
      m.creado_en
    from movimientos_inventario m
    join productos pr on pr.id = m.producto_id
    where m.creado_en >= p_desde
      and m.venta_id is null
      and m.compra_id is null
      and not exists (select 1 from conteos_inventario_lineas l where l.ajuste_movimiento_id = m.id)
    order by m.creado_en desc;
end;
$$;

revoke execute on function public.movimientos_manuales(timestamptz) from public, anon;
grant execute on function public.movimientos_manuales(timestamptz) to authenticated;

-- ── 4) Anular orden con productos ───────────────────────────────────────────────────────────────
drop function if exists public.anular_orden(uuid, text, text);

create function public.anular_orden(
  p_orden_id uuid, p_motivo text, p_anulada_por text, p_se_consumio boolean default null
)
returns setof ordenes
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_orden public.ordenes;
  v_row record;
  v_motivo text := nullif(trim(p_motivo), '');
  v_por text := nullif(trim(p_anulada_por), '');
begin
  perform interno.exige_rol_operativo();
  if v_motivo is null or length(v_motivo) < 3 then
    raise exception 'El motivo de anulación es obligatorio (mínimo 3 caracteres)';
  end if;
  if v_por is null then raise exception 'Indica quién anula la orden'; end if;
  select * into v_orden from public.ordenes where id = p_orden_id for update;
  if not found then raise exception 'La orden no existe'; end if;
  if v_orden.estado = 'anulada' then raise exception 'La orden ya está anulada'; end if;

  -- Productos de la orden: los pendientes (sin cobrar) y los ya cobrados con ella. Anular la orden
  -- anula sus pagos (trigger), así que sus productos no pueden quedar como vendidos.
  for v_row in
    select * from public.ventas where orden_id = p_orden_id and estado in ('pendiente', 'activa') for update
  loop
    if p_se_consumio is null then
      raise exception 'La orden #% tiene productos: indica si se consumieron o volvieron a la nevera', v_orden.consecutivo;
    end if;

    if p_se_consumio then
      if v_row.estado = 'pendiente' then
        insert into public.movimientos_inventario (
          producto_id, tipo, cantidad, costo_unitario, motivo, responsable, venta_id
        ) values (
          v_row.producto_id, 'salida', -v_row.cantidad, interno.costo_promedio_producto(v_row.producto_id),
          'Consumido sin cobro — orden #' || v_orden.consecutivo || ' anulada: ' || v_motivo, v_por, v_row.id
        );
      end if;
    else
      perform interno.exigir_volvio_sin_conteo(v_row.creado_en, v_row.consecutivo);
      if v_row.estado = 'activa' then
        insert into public.movimientos_inventario (
          producto_id, tipo, cantidad, motivo, responsable, venta_id
        ) values (
          v_row.producto_id, 'entrada', v_row.cantidad,
          'Reverso por anulación de orden #' || v_orden.consecutivo || ' (venta #' || v_row.consecutivo || ')',
          v_por, v_row.id
        );
      end if;
    end if;

    update public.ventas set
      estado = 'anulada', motivo_anulacion = v_motivo, anulada_por = v_por, anulada_en = now()
    where id = v_row.id;
  end loop;

  update public.ordenes set
    estado = 'anulada', motivo_anulacion = v_motivo, anulada_por = v_por, anulada_en = now()
  where id = p_orden_id returning * into v_orden;
  return next v_orden;
end;
$$;

revoke execute on function public.anular_orden(uuid, text, text, boolean) from public, anon;
grant execute on function public.anular_orden(uuid, text, text, boolean) to authenticated;

-- El trigger ya no decide por nadie: si llega a anularse una orden con productos pendientes por un
-- camino que no los resolvió (`anular_orden` y `corregir_orden` sí lo hacen), se rechaza.
create or replace function public.anular_ventas_pendientes_de_orden()
returns trigger
language plpgsql security definer set search_path to 'public'
as $$
begin
  if exists (select 1 from public.ventas where orden_id = new.id and estado = 'pendiente') then
    raise exception 'La orden #% tiene productos cargados sin cobrar: anúlala indicando si se consumieron o volvieron a la nevera', new.consecutivo;
  end if;

  update public.pagos set anulado = true
  where orden_id = new.id and anulado = false;

  return new;
end;
$$;

-- ── 5) Inactivar producto ───────────────────────────────────────────────────────────────────────
create function interno.producto_inactivar_sin_stock()
returns trigger
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_stock integer;
  v_comp integer;
begin
  if old.activo and not new.activo then
    v_stock := interno.stock_producto(new.id);
    v_comp := interno.comprometido_producto(new.id);
    if v_stock <> 0 or v_comp <> 0 then
      raise exception 'No se puede inactivar "%": el sistema tiene % en inventario y % cargadas sin cobrar. Llévalo a 0 con un ajuste justificado (y cobra o quita lo pendiente) antes de inactivarlo.',
        new.nombre, v_stock, v_comp;
    end if;
  end if;
  return new;
end;
$$;

create trigger productos_inactivar_sin_stock
  before update of activo on public.productos
  for each row execute function interno.producto_inactivar_sin_stock();

notify pgrst, 'reload schema';
