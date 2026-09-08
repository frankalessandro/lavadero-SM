-- Corregir una orden: encadena la anulación con su reemplazo.
--
-- Cuando algo de una orden no se puede arreglar con "Editar" (el combo, el precio ya cobrado), el
-- flujo real del negocio es descartarla y volver a ingresarla. Está confirmado con Alessandro y se
-- ve en producción — las dos únicas anulaciones de órdenes ya cobradas fueron eso:
--
--   GCP04I  #256 $30.000 anulada 22:57  →  #259 $25.000 creada 22:55, cobrada $25.000
--   HEP693  #224 $30.000 anulada 20:21  →  #225 $60.000 creada 20:24, cobrada $60.000
--
-- En ambas el cliente pagó UNA vez: la orden anulada queda en cero (no cuenta en ingresos, arqueo,
-- comisiones ni rentabilidad) y la nueva lleva la plata. La contabilidad ya cierra bien; lo que
-- falta es que los dos pasos dejen de ser manuales e independientes.
--
-- El riesgo de hacerlo a mano se ve en GCP04I: la orden nueva se creó DOS MINUTOS ANTES de anular
-- la vieja, o sea que hubo una ventana con las dos vivas y cobrables. Si en cambio se interrumpe
-- antes de crear la nueva, el vehículo desaparece del tablero.
--
-- POR QUÉ ESTA RPC NO CREA LA ORDEN NUEVA. Sería lo "atómico puro", pero obliga a reimplementar
-- `createOrden` en plpgsql: cálculo de precio (combo fijo vs. suma de servicios, individuales,
-- recargo), las tres comisiones, los add-ons y la cola de rotación. Esa lógica ya existe dos veces
-- (TypeScript y, parcialmente, `cambiar_tipo_orden` en 0038) y una tercera copia se desincroniza
-- tarde o temprano — con precios, eso es plata mal cobrada. En vez de eso el cliente crea la orden
-- nueva por el camino de siempre y luego llama esta función, que hace el vínculo y la anulación en
-- una transacción. La ventana de "dos órdenes vivas" pasa de minutos manuales a un round-trip, y
-- es reintentable: la función es IDEMPOTENTE, así que si falla la red se vuelve a llamar y listo.

alter table public.ordenes
  add column corrige_a_orden_id uuid references public.ordenes(id);

create index ordenes_corrige_a_idx on public.ordenes (corrige_a_orden_id)
  where corrige_a_orden_id is not null;

comment on column public.ordenes.corrige_a_orden_id is
  'Orden anulada a la que esta reemplaza (ver corregir_orden). Null en una orden normal.';

create function public.corregir_orden(
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

  -- Se bloquean en orden de id para que dos correcciones simultáneas no se abracen en un deadlock.
  select * into v_anterior from public.ordenes where id = p_orden_anterior for update;
  if not found then raise exception 'La orden que se corrige no existe'; end if;

  select * into v_nueva from public.ordenes where id = p_orden_nueva for update;
  if not found then raise exception 'La orden de reemplazo no existe'; end if;

  -- Idempotencia: si ya quedó hecho (reintento tras un fallo de red), se devuelve la nueva sin
  -- tocar nada ni volver a anular.
  if v_anterior.estado = 'anulada' and v_nueva.corrige_a_orden_id = p_orden_anterior then
    return next v_nueva;
    return;
  end if;

  if v_anterior.estado = 'anulada' then
    raise exception 'La orden #% ya estaba anulada por otro motivo: %',
      v_anterior.consecutivo, coalesce(v_anterior.motivo_anulacion, 'sin motivo');
  end if;
  if v_nueva.estado = 'anulada' then
    raise exception 'La orden de reemplazo #% está anulada', v_nueva.consecutivo;
  end if;
  if v_nueva.corrige_a_orden_id is not null then
    raise exception 'La orden #% ya es el reemplazo de otra orden', v_nueva.consecutivo;
  end if;

  update public.ordenes set corrige_a_orden_id = p_orden_anterior
  where id = p_orden_nueva
  returning * into v_nueva;

  -- El motivo queda con la referencia al reemplazo para que en el histórico de anulaciones se lea
  -- de una a dónde se fue el vehículo, sin tener que cruzar por placa y hora.
  update public.ordenes set
    estado = 'anulada',
    motivo_anulacion = v_motivo || ' (reemplazada por #' || v_nueva.consecutivo || ')',
    anulada_por = v_por,
    anulada_en = now()
  where id = p_orden_anterior;

  return next v_nueva;
end;
$$;

revoke execute on function public.corregir_orden(uuid, uuid, text, text) from public, anon;
grant execute on function public.corregir_orden(uuid, uuid, text, text) to authenticated;

-- Nota de advisor: WARN "Signed-In Users Can Execute SECURITY DEFINER Function", intencional y por
-- el mismo criterio de 0032/0035/0036/0041/0045 — necesita definer porque desde 0045 jefe_zona ya
-- no tiene UPDATE directo sobre `ordenes`. El candado es el chequeo de rol y de estado al entrar.
