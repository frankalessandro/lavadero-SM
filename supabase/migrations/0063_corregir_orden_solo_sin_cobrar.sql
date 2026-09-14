-- corregir_orden: rechazo explícito al intentar corregir una orden ya cobrada.
--
-- Hueco encontrado en el análisis de Fase 1/2 (2026-09-14): `corregir_orden` (0046, ampliada en
-- 0060 para trasladar productos pendientes) solo movía las ventas 'pendiente' de la orden vieja a
-- la nueva. Si la orden que se corrige ya estaba 'entregado' (cobrada) y tenía productos, esas
-- ventas ya son 'activa' — no las toca el traslado — y el trigger de anulación
-- (`ordenes_anulada_anula_ventas_pendientes`) igual anula sus `pagos`, dejando el ingreso del
-- lavado desaparecido del arqueo mientras el producto sigue contando como vendido en rentabilidad.
--
-- La UI nunca expone este caso — el botón "Corregir" (`FileWarning`) solo vive en las tarjetas
-- "en proceso"/"listo" del tablero de jefe de zona, nunca en "Entregados hoy" — así que no es un
-- bug en producción, es un hueco de la RPC alcanzable solo llamándola directo. Se cierra con un
-- rechazo explícito en vez de inventar una lógica de "recobrar" que nadie ha pedido: si algún día
-- hace falta corregir una orden ya cobrada con productos, es una decisión de negocio aparte (¿se
-- vuelve a cobrar el producto en la orden nueva? ¿se da por ya pagado?), no algo que se deba
-- resolver en silencio.

create or replace function public.corregir_orden(
  p_orden_anterior uuid,
  p_orden_nueva uuid,
  p_motivo text,
  p_corregida_por text
)
returns setof public.ordenes
language plpgsql security definer set search_path = public
as $$
declare
  v_anterior public.ordenes;
  v_nueva public.ordenes;
  v_motivo text := nullif(trim(p_motivo), '');
  v_por text := nullif(trim(p_corregida_por), '');
begin
  if not interno.es_activo() or interno.rol_actual() not in ('jefe_zona', 'admin') then
    raise exception 'No autorizado para corregir órdenes';
  end if;
  if v_motivo is null or length(v_motivo) < 3 then
    raise exception 'El motivo de la corrección es obligatorio (mínimo 3 caracteres)';
  end if;
  if v_por is null then
    raise exception 'Indica quién hace la corrección';
  end if;
  if p_orden_anterior = p_orden_nueva then
    raise exception 'Una orden no se puede corregir a sí misma';
  end if;

  select * into v_anterior from public.ordenes where id = p_orden_anterior for update;
  if not found then raise exception 'La orden que se corrige no existe'; end if;

  select * into v_nueva from public.ordenes where id = p_orden_nueva for update;
  if not found then raise exception 'La orden de reemplazo no existe'; end if;

  if v_anterior.estado = 'anulada' and v_nueva.corrige_a_orden_id = p_orden_anterior then
    return next v_nueva;
    return;
  end if;

  if v_anterior.estado = 'anulada' then
    raise exception 'La orden #% ya estaba anulada por otro motivo: %',
      v_anterior.consecutivo, coalesce(v_anterior.motivo_anulacion, 'sin motivo');
  end if;
  -- Nuevo: una orden ya cobrada no se corrige por acá — anularla desharía el pago sin resolver qué
  -- pasa con los productos ya vendidos junto a ella (ver comentario de arriba).
  if v_anterior.estado = 'entregado' then
    raise exception 'La orden #% ya fue cobrada — no se puede corregir, solo anular o corregir su reparto de pago',
      v_anterior.consecutivo;
  end if;
  if v_nueva.estado = 'anulada' then
    raise exception 'La orden de reemplazo #% está anulada', v_nueva.consecutivo;
  end if;
  if v_nueva.corrige_a_orden_id is not null then
    raise exception 'La orden #% ya es el reemplazo de otra orden', v_nueva.consecutivo;
  end if;

  if exists (select 1 from public.ventas where orden_id = p_orden_anterior and estado = 'pendiente') then
    if v_nueva.estado not in ('en_proceso', 'listo') then
      raise exception 'La orden de reemplazo #% ya fue cobrada — no se le pueden pasar los productos pendientes', v_nueva.consecutivo;
    end if;
    update public.ventas set orden_id = p_orden_nueva
    where orden_id = p_orden_anterior and estado = 'pendiente';
  end if;

  update public.ordenes set corrige_a_orden_id = p_orden_anterior
  where id = p_orden_nueva
  returning * into v_nueva;

  update public.ordenes set
    estado = 'anulada',
    motivo_anulacion = v_motivo || ' (reemplazada por #' || v_nueva.consecutivo || ')',
    anulada_por = v_por,
    anulada_en = now()
  where id = p_orden_anterior;

  return next v_nueva;
end;
$$;
