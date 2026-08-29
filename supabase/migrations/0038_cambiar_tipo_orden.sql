-- Cambiar el tipo de vehículo de una orden ANTES de cobrar (se registró "auto" y era
-- "camioneta" / "camioneta de platón", etc.). Cambiar el tipo cambia la tarifa (combo + tipo
-- define el precio, regla 1), así que recalcula en la misma transacción: `precio`, las dos
-- comisiones y `comision_negocio`, más el precio de cada servicio adicional al nuevo tipo.
--
-- Reglas (confirmadas con el negocio):
--  - Solo con la orden en `en_proceso` o `listo` (sin cobrar). Una vez entregada el precio queda
--    cerrado — corregir eso exige anular y volver a registrar.
--  - Solo entre tipos de la MISMA categoría que el combo (auto ↔ camioneta ↔ camioneta de
--    platón; no se puede convertir un carro en moto — el combo dejaría de aplicar).
--  - "Todo o nada": si al combo o a algún adicional le falta el precio configurado para el nuevo
--    tipo, se bloquea el cambio (mismo criterio que crear la orden).
--  - Cambio directo, sin motivo ni bitácora aparte (decisión del negocio para esta iteración).

create or replace function public.cambiar_tipo_orden(p_orden_id uuid, p_tipo_vehiculo_id uuid)
returns setof public.ordenes
language plpgsql security definer set search_path = public
as $$
declare
  v_orden public.ordenes;
  v_tipo record;
  v_combo record;
  v_cfg record;
  v_precio_combo integer := 0;
  v_precio_addons integer := 0;
  v_recargo integer := 0;
  v_total integer;
  v_com_lav integer;
  v_com_jefe integer;
  v_n_serv integer;
  v_n_precios integer;
  v_svc record;
  v_precio_svc integer;
begin
  if not interno.es_activo() or interno.rol_actual() not in ('jefe_zona', 'admin') then
    raise exception 'No autorizado para cambiar el tipo de vehículo';
  end if;

  select * into v_orden from public.ordenes where id = p_orden_id for update;
  if not found then
    raise exception 'La orden no existe';
  end if;
  if v_orden.estado not in ('en_proceso', 'listo') then
    raise exception 'Solo se puede cambiar el tipo antes de cobrar (estado actual: %)', v_orden.estado;
  end if;

  if p_tipo_vehiculo_id = v_orden.tipo_vehiculo_id then
    return next v_orden;  -- sin cambio real
    return;
  end if;

  select id, nombre, activo, categoria into v_tipo
  from public.tipos_vehiculo where id = p_tipo_vehiculo_id;
  if not found then
    raise exception 'El tipo de vehículo no existe';
  end if;
  if not v_tipo.activo then
    raise exception 'El tipo "%" está inactivo', v_tipo.nombre;
  end if;

  select * into v_cfg from public.configuracion limit 1;

  -- Precio del combo (si lo hay) al nuevo tipo — mismo criterio que precioComboVigente.
  if v_orden.combo_id is not null then
    select id, categoria, precio_fijo into v_combo from public.combos where id = v_orden.combo_id;
    if v_combo.categoria <> v_tipo.categoria then
      raise exception 'El combo es de categoría "%" y el tipo "%" es de categoría "%" — no aplican juntos',
        v_combo.categoria, v_tipo.nombre, v_tipo.categoria;
    end if;

    if v_combo.precio_fijo then
      select precio into v_precio_combo
      from public.precios_combo_fijo
      where combo_id = v_orden.combo_id and tipo_vehiculo_id = p_tipo_vehiculo_id;
      if not found then
        raise exception 'No hay precio configurado para ese combo y el tipo "%"', v_tipo.nombre;
      end if;
    else
      select count(*) into v_n_serv from public.combo_servicios where combo_id = v_orden.combo_id;
      select coalesce(sum(psc.precio), 0), count(*)
      into v_precio_combo, v_n_precios
      from public.combo_servicios cs
      join public.precios_servicios_combo psc
        on psc.servicio_id = cs.servicio_id and psc.tipo_vehiculo_id = p_tipo_vehiculo_id
      where cs.combo_id = v_orden.combo_id;
      if v_n_precios <> v_n_serv then
        raise exception 'Al combo le falta el precio de algún servicio para el tipo "%"', v_tipo.nombre;
      end if;
    end if;
  end if;

  -- Reprecio de cada servicio adicional al nuevo tipo (todo o nada).
  for v_svc in select * from public.orden_servicios where orden_id = p_orden_id
  loop
    select precio into v_precio_svc
    from public.precios_servicios_individual
    where servicio_id = v_svc.servicio_id and tipo_vehiculo_id = p_tipo_vehiculo_id;
    if not found then
      raise exception 'No hay precio individual configurado para un servicio adicional y el tipo "%"', v_tipo.nombre;
    end if;
    update public.orden_servicios
    set tipo_vehiculo_id = p_tipo_vehiculo_id, precio = v_precio_svc
    where orden_id = v_svc.orden_id and servicio_id = v_svc.servicio_id;
    v_precio_addons := v_precio_addons + v_precio_svc;
  end loop;

  -- Recargo de alto cilindraje solo aplica a motos — se conserva la bandera (la categoría del
  -- nuevo tipo es la misma que la del combo, así que si venía marcada sigue siendo válida).
  if v_orden.alto_cilindraje then
    v_recargo := coalesce(v_cfg.recargo_alto_cilindraje, 0);
  end if;

  v_total := v_precio_combo + v_precio_addons + v_recargo;
  if v_total <= 0 then
    raise exception 'El nuevo precio dio % — revisa la configuración de precios para el tipo "%"', v_total, v_tipo.nombre;
  end if;
  v_com_lav := round(v_total * v_cfg.comision_lavador_porcentaje);
  v_com_jefe := round(v_total * v_cfg.comision_jefe_zona_porcentaje);

  update public.ordenes set
    tipo_vehiculo_id = p_tipo_vehiculo_id,
    precio = v_total,
    comision_lavador = v_com_lav,
    comision_jefe_zona = v_com_jefe,
    comision_negocio = v_total - v_com_lav - v_com_jefe
  where id = p_orden_id
  returning * into v_orden;

  return next v_orden;
end;
$$;

revoke execute on function public.cambiar_tipo_orden(uuid, uuid) from public, anon;
grant execute on function public.cambiar_tipo_orden(uuid, uuid) to authenticated;

-- Nota de advisor: `cambiar_tipo_orden` queda como WARN "Signed-In Users Can Execute SECURITY
-- DEFINER Function" — intencional, mismo criterio que 0032/0035/0036/0037. Es el camino que el
-- frontend autenticado debe llamar y necesita SECURITY DEFINER para reescribir precio/comisiones
-- (recálculo de tarifa = borde de confianza, regla 1); el candado es el chequeo de rol al entrar.
