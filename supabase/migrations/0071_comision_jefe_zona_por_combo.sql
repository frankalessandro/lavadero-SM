-- Comisión del jefe de patio pasa de un porcentaje único (3%, 0028) a un esquema por tramo de
-- combo, confirmado con Alessandro (2026-09-16): "Combo 1" de cada categoría (el lavado básico)
-- paga 2.5%, "Combo 2" en adelante paga 3.5% — compensa que hoy la comisión no distinguía la
-- complejidad del servicio. Los servicios sueltos (sin combo, o agregados encima de uno) ganan su
-- propio % configurable, hoy en 0% — no hay decisión de negocio todavía sobre pagarle jefe de
-- patio por eso. La comisión del lavador NO cambia (sigue siendo un único % plano sobre el total).
--
-- El combo "básico" de cada categoría se identifica por `combos.nombre = 'Combo 1'` — convención
-- ya vigente desde 0010 (Combo 1..6 en autos, Combo 1..2 en motos), la misma que usa el resto del
-- sistema para hablar del combo base. No se agrega una columna nueva a `combos` para esto.

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 1) `configuracion`: reemplaza comision_jefe_zona_porcentaje por 3 columnas.
-- ─────────────────────────────────────────────────────────────────────────────────────────────

alter table public.configuracion
  add column comision_jefe_zona_combo1_porcentaje numeric,
  add column comision_jefe_zona_combo2_porcentaje numeric,
  add column comision_jefe_zona_servicios_porcentaje numeric not null default 0;

update public.configuracion set
  comision_jefe_zona_combo1_porcentaje = 0.025,
  comision_jefe_zona_combo2_porcentaje = 0.035;

alter table public.configuracion
  alter column comision_jefe_zona_combo1_porcentaje set not null,
  alter column comision_jefe_zona_combo2_porcentaje set not null,
  add constraint configuracion_comision_jefe_zona_combo1_check
    check (comision_jefe_zona_combo1_porcentaje >= 0 and comision_jefe_zona_combo1_porcentaje < 1),
  add constraint configuracion_comision_jefe_zona_combo2_check
    check (comision_jefe_zona_combo2_porcentaje >= 0 and comision_jefe_zona_combo2_porcentaje < 1),
  add constraint configuracion_comision_jefe_zona_servicios_check
    check (comision_jefe_zona_servicios_porcentaje >= 0 and comision_jefe_zona_servicios_porcentaje < 1),
  drop column comision_jefe_zona_porcentaje;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 2) Bitácora (0044): recrear el trigger con la lista de columnas nueva — no hay ALTER TRIGGER
--    para cambiar los argumentos de la función, hay que dropear y crear de nuevo.
-- ─────────────────────────────────────────────────────────────────────────────────────────────

drop trigger bitacora_configuracion_update on public.configuracion;
create trigger bitacora_configuracion_update after update on public.configuracion
  for each row execute function interno.bitacora_trigger(
    'cambiar_configuracion',
    'comision_lavador_porcentaje', 'comision_jefe_zona_combo1_porcentaje',
    'comision_jefe_zona_combo2_porcentaje', 'comision_jefe_zona_servicios_porcentaje',
    'comision_base', 'recargo_alto_cilindraje', 'periodicidad_liquidacion'
  );

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 3) Historial (0052): las filas viejas quedan con su comision_jefe_zona_porcentaje tal cual
--    (regla 13, no se reescribe el histórico) — solo se le quita el NOT NULL porque de acá en
--    adelante ese concepto ya no existe. Se agregan las 3 columnas nuevas (nullable, las filas
--    anteriores a este cambio no tienen cómo tener este dato) y el trigger de snapshot pasa a
--    llenarlas en vez de la columna vieja.
-- ─────────────────────────────────────────────────────────────────────────────────────────────

alter table public.configuracion_historial
  alter column comision_jefe_zona_porcentaje drop not null,
  add column comision_jefe_zona_combo1_porcentaje numeric,
  add column comision_jefe_zona_combo2_porcentaje numeric,
  add column comision_jefe_zona_servicios_porcentaje numeric;

create or replace function interno.configuracion_snapshot()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if NEW is distinct from OLD then
    insert into public.configuracion_historial (
      comision_lavador_porcentaje, comision_jefe_zona_combo1_porcentaje,
      comision_jefe_zona_combo2_porcentaje, comision_jefe_zona_servicios_porcentaje,
      comision_base, recargo_alto_cilindraje, periodicidad_liquidacion
    ) values (
      NEW.comision_lavador_porcentaje, NEW.comision_jefe_zona_combo1_porcentaje,
      NEW.comision_jefe_zona_combo2_porcentaje, NEW.comision_jefe_zona_servicios_porcentaje,
      NEW.comision_base, NEW.recargo_alto_cilindraje, NEW.periodicidad_liquidacion
    );
  end if;
  return NEW;
end;
$$;

-- Snapshot del nuevo esquema, mismo criterio que la fila semilla de 0052.
insert into public.configuracion_historial (
  comision_lavador_porcentaje, comision_jefe_zona_combo1_porcentaje,
  comision_jefe_zona_combo2_porcentaje, comision_jefe_zona_servicios_porcentaje,
  comision_base, recargo_alto_cilindraje, periodicidad_liquidacion
)
select comision_lavador_porcentaje, comision_jefe_zona_combo1_porcentaje,
       comision_jefe_zona_combo2_porcentaje, comision_jefe_zona_servicios_porcentaje,
       comision_base, recargo_alto_cilindraje, periodicidad_liquidacion
from public.configuracion;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 4) `cambiar_tipo_orden` (0038): recalcula la comisión de jefe de patio por combo/servicios en
--    vez de un único %. Mismo criterio de tramo que `createOrden` (cliente): "Combo 1" = tarifa
--    básica, cualquier otro combo = tarifa superior, servicios sueltos (con o sin combo) = tarifa
--    de servicios. El recargo de alto cilindraje sigue la tarifa del combo si la orden lleva uno.
-- ─────────────────────────────────────────────────────────────────────────────────────────────

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
  v_tasa_combo numeric;
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
    select id, nombre, categoria, precio_fijo into v_combo from public.combos where id = v_orden.combo_id;
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

    v_tasa_combo := case when v_combo.nombre = 'Combo 1'
      then v_cfg.comision_jefe_zona_combo1_porcentaje
      else v_cfg.comision_jefe_zona_combo2_porcentaje
    end;
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
  v_com_jefe := round(v_precio_addons * v_cfg.comision_jefe_zona_servicios_porcentaje);
  if v_orden.combo_id is not null then
    v_com_jefe := v_com_jefe + round((v_precio_combo + v_recargo) * v_tasa_combo);
  else
    v_com_jefe := v_com_jefe + round(v_recargo * v_cfg.comision_jefe_zona_servicios_porcentaje);
  end if;

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

-- Grants sin cambios (misma firma de función) — quedaron fijados en 0038.
