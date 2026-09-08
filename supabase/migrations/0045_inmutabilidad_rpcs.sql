-- Inmutabilidad del histórico a nivel de base de datos.
--
-- Hasta acá el candado era de interfaz. Las policies de 0012 le dan a `jefe_zona` UPDATE sobre
-- `ordenes` sin restricción de columna (el `with check` valida el rol, no QUÉ cambia), y las de
-- `turnos_caja` no llevan `cerrado = false` en el `using`. En la práctica eso significaba que un
-- PATCH de PostgREST hecho a mano —no la UI— podía cambiar `precio`, `comision_lavador`,
-- `estado`, `entregada_en` o `turno_id` de una orden ya cobrada, o reabrir un turno cerrado. Las
-- reglas 13 (nada se elimina/edita) y 14 (turno cerrado inmodificable) solo se cumplían si el
-- atacante usaba la aplicación.
--
-- Se evaluaron dos caminos:
--
--   a) Marcador de sesión (`set_config('app.rpc', ...)`) en cada RPC + trigger que lo verifica.
--      Obliga a recrear las 7 RPC que ya existen (cobrar_orden, cambiar_tipo_orden,
--      registrar_venta, registrar_venta_carrito, corregir_pagos, cerrar_cuenta, anular_venta).
--      Migración enorme y con riesgo alto de regresión sobre código que ya funciona.
--
--   b) Mover a RPC los 6 UPDATE planos que quedaban y BORRAR la policy de UPDATE de jefe_zona.
--      El problema desaparece por construcción: si el rol no tiene UPDATE, no hay columna que
--      proteger. Ninguna función existente se toca.
--
-- Se toma (b). Deja el modelo consistente con lo que ya se hizo en 0032/0035/0036: todo lo que
-- toca plata pasa por una RPC con lista blanca de columnas. La bitácora (0044) sigue registrando
-- igual, porque es por trigger y no depende de por dónde entre la escritura.

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 1) Regla 14 — un turno cerrado es inmodificable
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- Doble candado a propósito: el trigger cubre cualquier vía (incluidas las RPC `security definer`,
-- que se saltan RLS), y el `not cerrado` en las policies hace que el rechazo llegue como "fila no
-- encontrada" antes de disparar el trigger en el caso normal.
--
-- OJO — esto también le aplica a ADMIN, que conserva su policy de UPDATE sin `not cerrado`. Es
-- intencional: la regla 14 no hace excepción por rol ("turno de caja cerrado es inmodificable"). Si
-- alguna vez hay que corregir un arqueo ya cerrado, tiene que ser una operación explícita y
-- auditada, no un UPDATE silencioso desde la pantalla de admin.

create function interno.turno_cerrado_inmutable()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if OLD.cerrado then
    raise exception 'El turno % está cerrado y es inmodificable (regla de negocio 14)', OLD.id;
  end if;
  return NEW;
end;
$$;

create trigger turnos_caja_cerrado_inmutable
  before update on public.turnos_caja
  for each row execute function interno.turno_cerrado_inmutable();

-- Las policies de 0012 permitían UPDATE sobre cualquier turno del propio rol, cerrado o no.
-- `if exists` porque 0012 es Supabase-only y en el sandbox local esas policies nunca existieron;
-- que el nombre sea el correcto no se confía al DROP sino al bloque de verificación del final,
-- que comprueba el EFECTO (que no quede ninguna policy de UPDATE permisiva) y no el nombre.
drop policy if exists turnos_jefe_zona_update on public.turnos_caja;
drop policy if exists turnos_vigilante_update on public.turnos_caja;

create policy turnos_jefe_zona_update on public.turnos_caja
  for update to authenticated
  using (interno.rol_actual() = 'jefe_zona' and interno.es_activo() and rol = 'jefe_zona' and not cerrado)
  with check (interno.rol_actual() = 'jefe_zona' and interno.es_activo() and rol = 'jefe_zona');

create policy turnos_vigilante_update on public.turnos_caja
  for update to authenticated
  using (interno.rol_actual() = 'vigilante' and interno.es_activo() and rol = 'vigilante' and not cerrado)
  with check (interno.rol_actual() = 'vigilante' and interno.es_activo() and rol = 'vigilante');

-- OJO: el `with check` NO lleva `not cerrado` — el cierre de turno es justamente el UPDATE que
-- pone `cerrado = true`, y exigirlo en el check lo haría imposible. El `using` (fila ANTES del
-- cambio) es el que impide tocar lo ya cerrado.

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 2) Órdenes — los 6 UPDATE planos pasan a RPC
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- Cada una escribe una lista blanca fija de columnas y valida el estado. Ninguna puede tocar
-- precio, comisiones, turno ni marcas de liquidación: esas solo las mueven `cobrar_orden` (0036/
-- 0037), `cambiar_tipo_orden` (0038) y el admin, que conserva su policy de UPDATE.

create function interno.exige_rol_operativo()
returns void
language plpgsql stable
set search_path = public
as $$
begin
  if not interno.es_activo() or interno.rol_actual() not in ('jefe_zona', 'admin') then
    raise exception 'No autorizado';
  end if;
end;
$$;

-- marcar_listo: el lavador terminó. `tiempo_lavado_segundos` queda fijo acá (KPI de M10) y no se
-- recalcula después.
create function public.marcar_listo(p_orden_id uuid)
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
    tiempo_lavado_segundos = greatest(0, extract(epoch from (now() - creado_en))::integer)
  where id = p_orden_id
  returning * into v_orden;

  return next v_orden;
end;
$$;

-- volver_a_proceso: corrige un "finalizar lavado" hecho sin querer. Limpia lo que fijó
-- marcar_listo para que, si se finaliza de nuevo, los valores salgan frescos.
create function public.volver_a_proceso(p_orden_id uuid)
returns setof public.ordenes
language plpgsql security definer set search_path = public
as $$
declare v_orden public.ordenes;
begin
  perform interno.exige_rol_operativo();

  select * into v_orden from public.ordenes where id = p_orden_id for update;
  if not found then raise exception 'La orden no existe'; end if;
  if v_orden.estado <> 'listo' then
    raise exception 'Solo una orden lista se puede devolver a proceso (estado actual: %)', v_orden.estado;
  end if;

  update public.ordenes set
    estado = 'en_proceso', lista_en = null, tiempo_lavado_segundos = null, notificado_listo = false
  where id = p_orden_id
  returning * into v_orden;

  return next v_orden;
end;
$$;

-- reasignar_lavador: asignar por primera vez, cambiar, o quitar (`p_lavador_id` null). `p_slot` 1
-- es el lavador principal, 2 el segundo de un "lavar entre 2". El avance de la cola de rotación
-- (regla 9) se hace acá dentro y ya no en el cliente, para que no quede a medias si falla.
create function public.reasignar_lavador(p_orden_id uuid, p_lavador_id uuid, p_slot integer default 1)
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
    update public.ordenes set lavador_id = p_lavador_id where id = p_orden_id returning * into v_orden;
  else
    update public.ordenes set lavador_id_2 = p_lavador_id where id = p_orden_id returning * into v_orden;
  end if;

  if p_lavador_id is not null then
    update public.lavadores set ultima_asignacion = now() where id = p_lavador_id;
  end if;

  return next v_orden;
end;
$$;

-- marcar_notificado: check operativo de "ya le avisé al cliente". Sin efecto de negocio.
create function public.marcar_notificado(p_orden_id uuid, p_notificado boolean)
returns setof public.ordenes
language plpgsql security definer set search_path = public
as $$
declare v_orden public.ordenes;
begin
  perform interno.exige_rol_operativo();

  update public.ordenes set notificado_listo = coalesce(p_notificado, false)
  where id = p_orden_id and estado = 'listo'
  returning * into v_orden;

  if not found then
    raise exception 'Solo se puede marcar como avisada una orden lista para cobrar';
  end if;
  return next v_orden;
end;
$$;

-- editar_info_cliente: corrige datos mal tomados en recepción. Incluye la PLACA — era el UPDATE
-- que más incomodaba (cambiar la placa de una orden sin traza); desde 0044 queda en bitácora, y
-- desde acá además no se puede tocar una orden ya cobrada.
create function public.editar_info_cliente(
  p_orden_id uuid,
  p_placa text,
  p_cliente_nombre text,
  p_cliente_telefono text default null,
  p_cliente_correo text default null
)
returns setof public.ordenes
language plpgsql security definer set search_path = public
as $$
declare
  v_orden public.ordenes;
  v_placa text := upper(nullif(trim(p_placa), ''));
  v_nombre text := nullif(trim(p_cliente_nombre), '');
begin
  perform interno.exige_rol_operativo();
  if v_placa is null then raise exception 'La placa es obligatoria'; end if;
  if v_nombre is null then raise exception 'El nombre del cliente es obligatorio'; end if;

  select * into v_orden from public.ordenes where id = p_orden_id for update;
  if not found then raise exception 'La orden no existe'; end if;
  if v_orden.estado not in ('en_proceso', 'listo') then
    raise exception 'Solo se pueden corregir los datos de una orden en proceso o lista (estado actual: %)', v_orden.estado;
  end if;

  update public.ordenes set
    placa = v_placa,
    cliente_nombre = v_nombre,
    cliente_telefono = nullif(trim(p_cliente_telefono), ''),
    cliente_correo = nullif(trim(p_cliente_correo), '')
  where id = p_orden_id
  returning * into v_orden;

  return next v_orden;
end;
$$;

-- anular_orden: regla 13, motivo obligatorio y queda visible en reportes.
--
-- PENDIENTE (P5/devoluciones): anular una orden ya `entregado` hace desaparecer su ingreso del
-- arqueo por el trigger de 0036, pero el efectivo ya se recibió y no queda contrapartida. Acá se
-- conserva el comportamiento actual a propósito —cambiarlo es una decisión de negocio, no una
-- corrección técnica— y se restringirá cuando exista el flujo de devolución.
create function public.anular_orden(p_orden_id uuid, p_motivo text, p_anulada_por text)
returns setof public.ordenes
language plpgsql security definer set search_path = public
as $$
declare
  v_orden public.ordenes;
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

  update public.ordenes set
    estado = 'anulada', motivo_anulacion = v_motivo, anulada_por = v_por, anulada_en = now()
  where id = p_orden_id
  returning * into v_orden;

  return next v_orden;
end;
$$;

revoke execute on function public.marcar_listo(uuid) from public, anon;
revoke execute on function public.volver_a_proceso(uuid) from public, anon;
revoke execute on function public.reasignar_lavador(uuid, uuid, integer) from public, anon;
revoke execute on function public.marcar_notificado(uuid, boolean) from public, anon;
revoke execute on function public.editar_info_cliente(uuid, text, text, text, text) from public, anon;
revoke execute on function public.anular_orden(uuid, text, text) from public, anon;
grant execute on function public.marcar_listo(uuid) to authenticated;
grant execute on function public.volver_a_proceso(uuid) to authenticated;
grant execute on function public.reasignar_lavador(uuid, uuid, integer) to authenticated;
grant execute on function public.marcar_notificado(uuid, boolean) to authenticated;
grant execute on function public.editar_info_cliente(uuid, text, text, text, text) to authenticated;
grant execute on function public.anular_orden(uuid, text, text) to authenticated;

-- El candado. A partir de acá jefe_zona no puede hacer UPDATE directo sobre `ordenes` por
-- PostgREST: solo por las RPC de arriba y las de cobro/tipo, que escriben columnas fijas.
-- Conserva SELECT e INSERT (createOrden sigue siendo un insert directo, y un insert no puede
-- falsear un histórico: nace con su consecutivo y su precio calculado del catálogo).
drop policy if exists ordenes_jefe_zona_update on public.ordenes;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 3) Parqueadero — la salida (donde se fija el cobro) pasa a RPC
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- La entrada sigue siendo un insert directo del vigilante: no fija plata (el cobro se calcula al
-- retiro, regla 17), así que no hay nada que falsear. La salida sí, y era un UPDATE abierto.

create function public.registrar_salida_parqueadero(p_estancia_id uuid, p_metodo_pago text default null)
returns setof public.estancias_parqueadero
language plpgsql security definer set search_path = public
as $$
declare
  v_estancia public.estancias_parqueadero;
  v_cobro integer;
  v_turno_id uuid;
begin
  if not interno.es_activo() or interno.rol_actual() not in ('vigilante', 'admin') then
    raise exception 'No autorizado';
  end if;

  select * into v_estancia from public.estancias_parqueadero where id = p_estancia_id for update;
  if not found then raise exception 'La estancia no existe'; end if;
  if v_estancia.estado <> 'adentro' then
    raise exception 'Ese vehículo ya salió del parqueadero';
  end if;

  -- Regla 17: solo la modalidad noche cobra por movimiento; mensualidad y fijo se facturan
  -- aparte. La tarifa viene del catálogo (M1), nunca hardcodeada.
  if v_estancia.modalidad = 'noche' then
    select coalesce(precio, 0) into v_cobro from public.tarifas_parqueadero where modalidad = 'noche';
  else
    v_cobro := 0;
  end if;

  if v_cobro > 0 and coalesce(p_metodo_pago, '') not in ('efectivo', 'transferencia', 'datafono') then
    raise exception 'Indica el método de pago del cobro de parqueadero';
  end if;

  select id into v_turno_id from public.turnos_caja where rol = 'vigilante' and not cerrado;

  update public.estancias_parqueadero set
    estado = 'fuera',
    hora_salida = now(),
    cobro = v_cobro,
    metodo_pago = case when v_cobro > 0 then p_metodo_pago else null end,
    turno_id = v_turno_id
  where id = p_estancia_id
  returning * into v_estancia;

  return next v_estancia;
end;
$$;

revoke execute on function public.registrar_salida_parqueadero(uuid, text) from public, anon;
grant execute on function public.registrar_salida_parqueadero(uuid, text) to authenticated;

drop policy if exists estancias_vigilante_update on public.estancias_parqueadero;

-- Nota de advisor: las 7 funciones nuevas salen como WARN "Signed-In Users Can Execute SECURITY
-- DEFINER Function". Intencional y por el mismo criterio de 0032/0035/0036/0041: son el camino que
-- el frontend autenticado DEBE usar, y necesitan definir para escribir saltándose el RLS que
-- acabamos de cerrar. El candado es el chequeo de rol y de estado dentro de cada función.

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- Verificación — el efecto, no el nombre
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- Los DROP de arriba son `if exists` para poder correr también en el sandbox (donde 0012 nunca se
-- aplicó). El riesgo de `if exists` es que un nombre mal escrito falle en silencio y deje viva la
-- policy permisiva que se quería quitar. Esto lo cierra comprobando lo que de verdad importa: que
-- no quede ninguna policy de UPDATE para jefe_zona sobre `ordenes` ni para vigilante sobre
-- `estancias_parqueadero`, y que las de turnos exijan `not cerrado`. En el sandbox pasa trivial
-- (no hay policies); en Supabase es la comprobación real.

do $$
declare v_n integer;
begin
  select count(*) into v_n from pg_policies
  where schemaname = 'public' and tablename = 'ordenes' and cmd = 'UPDATE'
    and coalesce(qual, '') like '%jefe_zona%';
  if v_n > 0 then
    raise exception 'Quedó % policy(s) de UPDATE de jefe_zona sobre ordenes — revisa el nombre en el DROP', v_n;
  end if;

  select count(*) into v_n from pg_policies
  where schemaname = 'public' and tablename = 'estancias_parqueadero' and cmd = 'UPDATE'
    and coalesce(qual, '') like '%vigilante%';
  if v_n > 0 then
    raise exception 'Quedó % policy(s) de UPDATE de vigilante sobre estancias_parqueadero', v_n;
  end if;

  select count(*) into v_n from pg_policies
  where schemaname = 'public' and tablename = 'turnos_caja' and cmd = 'UPDATE'
    and policyname in ('turnos_jefe_zona_update', 'turnos_vigilante_update')
    and coalesce(qual, '') not like '%cerrado%';
  if v_n > 0 then
    raise exception 'Hay % policy(s) de UPDATE sobre turnos_caja sin la guarda de turno cerrado', v_n;
  end if;
end;
$$;
