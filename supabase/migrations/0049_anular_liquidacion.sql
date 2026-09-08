-- Anular una liquidación mal generada (M8).
--
-- `generarLiquidacion` / `generarLiquidacionJefeZona` no son atómicos (PostgREST plano no da
-- transacciones multi-tabla): crean la fila e inmediatamente marcan las órdenes con
-- `liquidacion_id` / `liquidacion_id_2` / `liquidacion_jefe_zona_id`. Si el corte salió mal
-- (rango equivocado, lavador equivocado, se generó dos veces por error), hoy no hay forma de
-- deshacerlo — las órdenes quedan marcadas y su comisión ya no aparece como pendiente.
--
-- Esto agrega el camino inverso, auditado y atómico:
--  · Solo liquidaciones NO pagadas — una vez que la plata se pagó, es un registro inmutable
--    (misma lógica que un turno de caja cerrado, regla 14). Para corregir una ya pagada hay que
--    hacerlo por fuera, a mano, con criterio contable.
--  · La liquidación NO se borra (regla 13): se marca `anulada` con motivo/quién/cuándo y queda
--    visible en el histórico.
--  · Las órdenes vuelven a tener su columna de liquidación en NULL → reaparecen como pendientes
--    en la siguiente generación. Ese UPDATE de `ordenes` queda en la bitácora (0044 ya vigila
--    esas tres columnas).

alter table public.liquidaciones
  add column anulada boolean not null default false,
  add column motivo_anulacion text,
  add column anulada_por text,
  add column anulada_en timestamptz;

alter table public.liquidaciones_jefe_zona
  add column anulada boolean not null default false,
  add column motivo_anulacion text,
  add column anulada_por text,
  add column anulada_en timestamptz;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- anular_liquidacion (lavadores)
-- ─────────────────────────────────────────────────────────────────────────────────────────────

create function public.anular_liquidacion(p_id uuid, p_motivo text, p_anulada_por text)
returns setof public.liquidaciones
language plpgsql security definer set search_path = public
as $$
declare
  v_liq public.liquidaciones;
  v_motivo text := nullif(trim(p_motivo), '');
  v_por text := nullif(trim(p_anulada_por), '');
begin
  if not interno.es_admin() or not interno.es_activo() then
    raise exception 'Solo un administrador puede anular una liquidación';
  end if;
  if v_motivo is null or length(v_motivo) < 3 then
    raise exception 'El motivo de anulación es obligatorio (mínimo 3 caracteres)';
  end if;
  if v_por is null then
    raise exception 'Indica quién anula la liquidación';
  end if;

  select * into v_liq from public.liquidaciones where id = p_id for update;
  if not found then raise exception 'La liquidación no existe'; end if;
  if v_liq.pagada then raise exception 'Una liquidación pagada no se puede anular'; end if;
  if v_liq.anulada then raise exception 'La liquidación ya está anulada'; end if;

  update public.ordenes set liquidacion_id = null where liquidacion_id = p_id;
  update public.ordenes set liquidacion_id_2 = null where liquidacion_id_2 = p_id;

  update public.liquidaciones set
    anulada = true, motivo_anulacion = v_motivo, anulada_por = v_por, anulada_en = now()
  where id = p_id
  returning * into v_liq;

  return next v_liq;
end;
$$;

revoke execute on function public.anular_liquidacion(uuid, text, text) from public, anon;
grant execute on function public.anular_liquidacion(uuid, text, text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- anular_liquidacion_jefe_zona
-- ─────────────────────────────────────────────────────────────────────────────────────────────

create function public.anular_liquidacion_jefe_zona(p_id uuid, p_motivo text, p_anulada_por text)
returns setof public.liquidaciones_jefe_zona
language plpgsql security definer set search_path = public
as $$
declare
  v_liq public.liquidaciones_jefe_zona;
  v_motivo text := nullif(trim(p_motivo), '');
  v_por text := nullif(trim(p_anulada_por), '');
begin
  if not interno.es_admin() or not interno.es_activo() then
    raise exception 'Solo un administrador puede anular una liquidación';
  end if;
  if v_motivo is null or length(v_motivo) < 3 then
    raise exception 'El motivo de anulación es obligatorio (mínimo 3 caracteres)';
  end if;
  if v_por is null then
    raise exception 'Indica quién anula la liquidación';
  end if;

  select * into v_liq from public.liquidaciones_jefe_zona where id = p_id for update;
  if not found then raise exception 'La liquidación no existe'; end if;
  if v_liq.pagada then raise exception 'Una liquidación pagada no se puede anular'; end if;
  if v_liq.anulada then raise exception 'La liquidación ya está anulada'; end if;

  update public.ordenes set liquidacion_jefe_zona_id = null where liquidacion_jefe_zona_id = p_id;

  update public.liquidaciones_jefe_zona set
    anulada = true, motivo_anulacion = v_motivo, anulada_por = v_por, anulada_en = now()
  where id = p_id
  returning * into v_liq;

  return next v_liq;
end;
$$;

revoke execute on function public.anular_liquidacion_jefe_zona(uuid, text, text) from public, anon;
grant execute on function public.anular_liquidacion_jefe_zona(uuid, text, text) to authenticated;

-- Nota de advisor: las dos funciones salen como WARN "Signed-In Users Can Execute SECURITY
-- DEFINER Function" — intencional, mismo criterio que el resto (0032/0045/0048): el candado es el
-- chequeo `es_admin()` al entrar, y necesitan definir para tocar `ordenes` y `liquidaciones` en
-- una sola transacción.
