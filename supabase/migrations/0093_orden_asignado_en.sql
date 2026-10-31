-- Tres tiempos de una orden en vez de uno (M3).
--
-- Hasta ahora el "tiempo de lavado" (`tiempo_lavado_segundos`) iba de `creado_en` a `lista_en`:
-- si el vehículo quedaba en cola sin lavador (0026), esa espera se contaba como lavado y el
-- promedio por combo/lavador se inflaba sin que nadie lavara más lento. Con `asignado_en` (cuándo
-- se le asignó lavador) quedan separados:
--   espera por lavador = asignado_en − creado_en
--   lavado             = lista_en − asignado_en   (lo que guarda `tiempo_lavado_segundos` desde ahora)
--   espera para recoger = entregada_en − lista_en (ya existía: `tiempo_espera_entrega_segundos`)
-- Órdenes viejas quedan con `asignado_en` NULL y su tiempo de lavado como estaba (desde creado_en):
-- no se inventa una hora de asignación que no se registró.
--
-- `asignado_en` lo fija la base, nunca el cliente: un trigger al insertar (recepción y
-- corregir_orden) y `reasignar_lavador` cuando la orden pasa de "sin lavador" a tener uno.
-- Cambiar de un lavador a otro NO lo reinicia (el lavado ya había empezado); quitar la asignación
-- lo borra (vuelve a la cola).

alter table public.ordenes add column asignado_en timestamptz;

create or replace function interno.ordenes_asignado_en()
returns trigger
language plpgsql set search_path = public
as $$
begin
  new.asignado_en := case when new.lavador_id is not null then now() end;
  return new;
end;
$$;

create trigger ordenes_asignado_en before insert on public.ordenes
  for each row execute function interno.ordenes_asignado_en();

create or replace function public.reasignar_lavador(p_orden_id uuid, p_lavador_id uuid, p_slot integer default 1)
returns setof public.ordenes
language plpgsql security definer set search_path = public
as $$
declare v_orden public.ordenes;
begin
  perform interno.exige_rol_operativo();
  if p_slot not in (1, 2) then raise exception 'Slot de lavador inválido: %', p_slot; end if;

  select * into v_orden from public.ordenes where id = p_orden_id for update;
  if not found then raise exception 'La orden no existe'; end if;
  if v_orden.estado not in ('en_proceso', 'listo') then
    raise exception 'Solo se puede reasignar el lavador de una orden en proceso o lista (estado actual: %)', v_orden.estado;
  end if;
  if p_lavador_id is not null and not exists (select 1 from public.lavadores where id = p_lavador_id and activo) then
    raise exception 'El lavador seleccionado no existe o está inactivo';
  end if;

  if p_slot = 1 then
    update public.ordenes set
      lavador_id = p_lavador_id,
      asignado_en = case
        when p_lavador_id is null then null
        when v_orden.lavador_id is null then now()
        else asignado_en
      end
    where id = p_orden_id returning * into v_orden;
  else
    update public.ordenes set lavador_id_2 = p_lavador_id where id = p_orden_id returning * into v_orden;
  end if;

  if p_lavador_id is not null then
    update public.lavadores set ultima_asignacion = now() where id = p_lavador_id;
  end if;

  return next v_orden;
end;
$$;

create or replace function public.marcar_listo(p_orden_id uuid)
returns setof public.ordenes
language plpgsql security definer set search_path = public
as $$
declare v_orden public.ordenes;
begin
  perform interno.exige_rol_operativo();

  select * into v_orden from public.ordenes where id = p_orden_id for update;
  if not found then raise exception 'La orden no existe'; end if;
  if v_orden.estado <> 'en_proceso' then
    raise exception 'Solo una orden en proceso se puede marcar como lista (estado actual: %)', v_orden.estado;
  end if;

  update public.ordenes set
    estado = 'listo',
    lista_en = now(),
    tiempo_lavado_segundos = greatest(0, extract(epoch from (now() - coalesce(asignado_en, creado_en)))::integer)
  where id = p_orden_id
  returning * into v_orden;

  return next v_orden;
end;
$$;
