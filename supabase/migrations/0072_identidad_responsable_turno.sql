-- Identidad real del responsable de turno (confirmado con Alessandro, 2026-09-16).
--
-- Hueco encontrado al revisar por qué un domingo aparecía "Frank Roldan" como responsable de un
-- turno de jefe de zona: `abrirTurno`/`transferirResponsable`/`traspasar_turno` dejaban que
-- cualquier cuenta con rol jefe_zona/vigilante eligiera A CUALQUIERA del roster como responsable
-- desde un dropdown — sin verificar que esa persona fuera quien de verdad tenía la sesión abierta.
-- Choca con la regla de antifraude ya escrita en CLAUDE.md ("sesión individual por usuario, sin
-- cuentas compartidas"): el diseño asume eso, pero nada lo hacía cumplir a nivel de datos.
--
-- Modelo nuevo:
--   1) Abrir turno: el responsable SIEMPRE es la cuenta autenticada (auth.uid()) — ya no se puede
--      elegir a otra persona. RPC `abrir_turno`, las policies de INSERT quedan cerradas.
--   2) Mientras el turno sigue abierto, todo lo que se registra (órdenes → comisión de jefe de
--      patio, ventas, gastos) sigue contando al responsable actual de ESE turno — eso ya
--      funcionaba así (createOrden/fetchTurnoAbierto) y no se toca.
--   3) Transferir responsabilidad a mitad de turno pasa a ser un traspaso EN DOS PASOS: quien
--      tiene el turno "solicita" el traspaso a otra cuenta (y si hay inventario a cargo, el
--      conteo de traspaso se registra ahí mismo, con quien entrega presente); el turno queda
--      "pendiente" y el responsable actual NO cambia todavía. Solo cuando la cuenta destino
--      inicia sesión y "acepta" el traspaso (validado contra su propio auth.uid()) el turno pasa
--      a su nombre. Nadie puede tomar la responsabilidad en nombre de otro.

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 1) Columnas de traspaso pendiente
-- ─────────────────────────────────────────────────────────────────────────────────────────────

alter table public.turnos_caja
  add column traspaso_pendiente_a_persona_id uuid references public.perfiles(id),
  add column traspaso_pendiente_a_nombre text,
  add column traspaso_pendiente_conteo_id uuid references public.conteos_inventario(id);

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 2) `abrir_turno`: el responsable sale de auth.uid(), no de un parámetro del cliente.
-- ─────────────────────────────────────────────────────────────────────────────────────────────

create function public.abrir_turno(p_rol text, p_base_inicial integer)
returns setof public.turnos_caja
language plpgsql security definer set search_path = public
as $$
declare
  v_turno public.turnos_caja;
  v_persona record;
begin
  if not interno.es_activo() then
    raise exception 'No autorizado';
  end if;
  if p_rol not in ('jefe_zona', 'vigilante') then
    raise exception 'Rol de caja inválido: %', p_rol;
  end if;
  if interno.rol_actual() <> p_rol then
    raise exception 'Tu módulo activo no es % — cambia de módulo para abrir esta caja', p_rol;
  end if;
  if p_base_inicial is null or p_base_inicial < 0 then
    raise exception 'La base inicial no puede ser negativa';
  end if;

  select id, nombre into v_persona from public.perfiles where id = auth.uid();
  if not found then
    raise exception 'No se encontró tu perfil';
  end if;

  insert into public.turnos_caja (
    rol, responsable, responsable_actual, responsable_persona_id, responsable_actual_persona_id, base_inicial
  ) values (
    p_rol,
    coalesce(nullif(trim(v_persona.nombre), ''), 'Sin nombre'),
    coalesce(nullif(trim(v_persona.nombre), ''), 'Sin nombre'),
    v_persona.id,
    v_persona.id,
    p_base_inicial
  )
  returning * into v_turno;

  return next v_turno;
end;
$$;

revoke execute on function public.abrir_turno(text, integer) from public, anon;
grant execute on function public.abrir_turno(text, integer) to authenticated;

-- Cierra el único otro camino de escritura: INSERT solo por la RPC de arriba de ahora en
-- adelante. Nada más inserta en turnos_caja.
drop policy turnos_jefe_zona_insert on public.turnos_caja;
drop policy turnos_vigilante_insert on public.turnos_caja;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 3) Traspaso en dos pasos: solicitar / aceptar / cancelar.
-- ─────────────────────────────────────────────────────────────────────────────────────────────

-- Reemplaza al `traspasar_turno` de 0068 (traspasaba de una — ver comentario de arriba).
drop function if exists public.traspasar_turno(uuid, uuid, jsonb, text, timestamptz, jsonb);

create function public.solicitar_traspaso_turno(
  p_turno_id uuid, p_a_persona_id uuid,
  p_lineas jsonb default null, p_justificacion text default null,
  p_desde timestamptz default null, p_confirmados jsonb default null
)
returns setof public.turnos_caja
language plpgsql security definer set search_path = public
as $$
declare
  v_turno public.turnos_caja;
  v_a record;
  v_conteo public.conteos_inventario;
begin
  if not interno.es_activo() then raise exception 'No autorizado'; end if;

  select * into v_turno from public.turnos_caja where id = p_turno_id for update;
  if not found then raise exception 'El turno no existe'; end if;
  if v_turno.cerrado then raise exception 'El turno ya está cerrado'; end if;
  if interno.rol_actual() <> v_turno.rol then
    raise exception 'No autorizado para transferir este turno';
  end if;
  -- Candado central: solo quien está a cargo AHORA MISMO, con su propia sesión, puede iniciar el
  -- traspaso — ni siquiera admin lo hace "por" otra persona.
  if v_turno.responsable_actual_persona_id is distinct from auth.uid() then
    raise exception 'Solo quien está a cargo del turno puede transferirlo';
  end if;
  if v_turno.traspaso_pendiente_a_persona_id is not null then
    raise exception 'Ya hay un traspaso pendiente de aceptar';
  end if;

  select id, nombre into v_a from public.perfiles where id = p_a_persona_id and activo;
  if not found then raise exception 'La persona que recibe no existe o está inactiva'; end if;
  if p_a_persona_id = v_turno.responsable_actual_persona_id then
    raise exception 'Esa persona ya está a cargo del turno';
  end if;

  -- Conteo obligatorio de jefe de patio con inventario a cargo (0068) — se registra AHORA, con
  -- quien entrega presente y el inventario delante, no se difiere hasta que el destino acepte.
  if v_turno.rol = 'jefe_zona'
     and exists (select 1 from public.conteos_inventario where turno_id = p_turno_id and momento in ('apertura', 'reinicio'))
     and not exists (select 1 from public.conteos_inventario where turno_id = p_turno_id and momento = 'cierre')
  then
    v_conteo := interno.registrar_conteo(p_turno_id, 'traspaso', p_lineas, p_justificacion, p_desde, p_confirmados);
  end if;

  update public.turnos_caja set
    traspaso_pendiente_a_persona_id = p_a_persona_id,
    traspaso_pendiente_a_nombre = coalesce(nullif(trim(v_a.nombre), ''), 'Sin nombre'),
    traspaso_pendiente_conteo_id = v_conteo.id
  where id = p_turno_id
  returning * into v_turno;

  return next v_turno;
end;
$$;

create function public.aceptar_traspaso_turno(p_turno_id uuid)
returns setof public.turnos_caja
language plpgsql security definer set search_path = public
as $$
declare
  v_turno public.turnos_caja;
begin
  if not interno.es_activo() then raise exception 'No autorizado'; end if;

  select * into v_turno from public.turnos_caja where id = p_turno_id for update;
  if not found then raise exception 'El turno no existe'; end if;
  if v_turno.cerrado then raise exception 'El turno ya está cerrado'; end if;
  if v_turno.traspaso_pendiente_a_persona_id is null then
    raise exception 'No hay ningún traspaso pendiente para este turno';
  end if;
  -- El candado que faltaba: solo la propia cuenta destino, con su sesión, puede aceptar. Nadie
  -- puede tomar la responsabilidad en nombre de otra persona.
  if v_turno.traspaso_pendiente_a_persona_id is distinct from auth.uid() then
    raise exception 'Este traspaso no es para tu cuenta';
  end if;

  insert into public.traspasos_turno (turno_id, de, a, de_persona_id, a_persona_id, conteo_id)
  values (
    p_turno_id, v_turno.responsable_actual, v_turno.traspaso_pendiente_a_nombre,
    v_turno.responsable_actual_persona_id, v_turno.traspaso_pendiente_a_persona_id,
    v_turno.traspaso_pendiente_conteo_id
  );

  update public.turnos_caja set
    responsable_actual = traspaso_pendiente_a_nombre,
    responsable_actual_persona_id = traspaso_pendiente_a_persona_id,
    traspaso_pendiente_a_persona_id = null,
    traspaso_pendiente_a_nombre = null,
    traspaso_pendiente_conteo_id = null
  where id = p_turno_id
  returning * into v_turno;

  return next v_turno;
end;
$$;

create function public.cancelar_traspaso_turno(p_turno_id uuid)
returns setof public.turnos_caja
language plpgsql security definer set search_path = public
as $$
declare
  v_turno public.turnos_caja;
begin
  if not interno.es_activo() then raise exception 'No autorizado'; end if;

  select * into v_turno from public.turnos_caja where id = p_turno_id for update;
  if not found then raise exception 'El turno no existe'; end if;
  if v_turno.traspaso_pendiente_a_persona_id is null then
    raise exception 'No hay ningún traspaso pendiente para este turno';
  end if;
  -- Lo cancela quien lo pidió (responsable actual) o quien iba a recibirlo (se arrepiente).
  if auth.uid() not in (v_turno.responsable_actual_persona_id, v_turno.traspaso_pendiente_a_persona_id) then
    raise exception 'No autorizado para cancelar este traspaso';
  end if;

  update public.turnos_caja set
    traspaso_pendiente_a_persona_id = null,
    traspaso_pendiente_a_nombre = null,
    traspaso_pendiente_conteo_id = null
  where id = p_turno_id
  returning * into v_turno;

  return next v_turno;
end;
$$;

revoke execute on function public.solicitar_traspaso_turno(uuid, uuid, jsonb, text, timestamptz, jsonb) from public, anon;
revoke execute on function public.aceptar_traspaso_turno(uuid) from public, anon;
revoke execute on function public.cancelar_traspaso_turno(uuid) from public, anon;
grant execute on function public.solicitar_traspaso_turno(uuid, uuid, jsonb, text, timestamptz, jsonb) to authenticated;
grant execute on function public.aceptar_traspaso_turno(uuid) to authenticated;
grant execute on function public.cancelar_traspaso_turno(uuid) to authenticated;

-- Nota de advisor: las 3 funciones nuevas + `abrir_turno` salen como WARN "Signed-In Users Can
-- Execute SECURITY DEFINER Function" — intencional, mismo criterio que 0032/0035/0036/0038/0045:
-- son el camino que el frontend autenticado DEBE usar, y necesitan definir para escribir estas
-- columnas. El candado es la comparación contra auth.uid() dentro de cada función, no el grant.

-- Nota de alcance: las policies de UPDATE de `turnos_caja` (0012) siguen abiertas para cualquier
-- cuenta con ese rol sobre cualquier turno no cerrado de ese rol — las usa `cerrarTurno` (arqueo)
-- con un UPDATE directo desde el cliente, y convertir eso a RPC exigiría portar a PL/pgSQL todo el
-- cálculo de `calcularValorEsperado` (pagos, ventas, gastos, compras, deudas). Fuera de alcance de
-- este cambio — el candado de identidad que faltaba era el de responsable/traspaso, ya cerrado
-- arriba; el resto del turno (base, arqueo) queda con el mismo nivel de exposición que ya tenía.
