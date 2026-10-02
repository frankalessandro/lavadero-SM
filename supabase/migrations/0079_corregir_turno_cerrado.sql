-- Regla 14 (revisada): un turno cerrado sigue siendo inmodificable POR DEFECTO, pero gerencia puede
-- corregir su arqueo con causa justificada, y toda corrección queda en la bitácora.
--
-- Decisión de Alessandro (2026-10-02). 0045 dejó escrito el camino: "si alguna vez hay que corregir un
-- arqueo ya cerrado, tiene que ser una operación explícita y auditada, no un UPDATE silencioso".
-- Eso es esta migración.
--
--   · Solo cuenta con rol activo `admin`. Jefe de patio y vigilante no pueden, ni por UI ni por API.
--   · Solo cifras del arqueo: base inicial, conteo físico, valor esperado y justificación de la
--     diferencia. La `diferencia` se recalcula en la base (conteo − esperado), nunca viene del cliente.
--   · Motivo obligatorio (≥ 10 caracteres). Si queda diferencia ≠ 0 debe haber justificación.
--   · Una sola puerta: el trigger de 0045 sigue rechazando todo UPDATE sobre un turno cerrado salvo
--     el que ocurre dentro de esta RPC, que levanta la bandera `app.corrigiendo_turno` solo para su
--     propia transacción (`set_config(..., true)`). PostgREST no expone `set_config`, así que un
--     PATCH a mano no puede levantarla.
--   · Auditoría: UNA fila 'corregir_turno' en `bitacora` con antes/después y el motivo. El trigger
--     genérico de 0044 se silencia durante la corrección para no dejar además una fila 'editar'.
--   · El turno guarda quién y cuándo lo corrigió por última vez (`corregido_*`) para señalarlo en
--     pantalla; el historial completo vive en la bitácora.

alter table public.turnos_caja
  add column corregido_en timestamptz,
  add column corregido_por text,
  add column motivo_correccion text;

-- ── Trigger de inmutabilidad: misma regla, con la única excepción de la RPC ──────────────────
create or replace function interno.turno_cerrado_inmutable()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if OLD.cerrado and coalesce(current_setting('app.corrigiendo_turno', true), '') <> OLD.id::text then
    raise exception 'El turno % está cerrado y es inmodificable (regla de negocio 14); solo gerencia puede corregirlo con causa justificada', OLD.id;
  end if;
  return NEW;
end;
$$;

-- ── La corrección no deja además la fila genérica 'editar' ───────────────────────────────────
drop trigger bitacora_turnos_update on public.turnos_caja;
create trigger bitacora_turnos_update after update on public.turnos_caja
  for each row
  when (coalesce(current_setting('app.corrigiendo_turno', true), '') = '')
  execute function interno.bitacora_trigger(
    'editar', 'cerrado', 'base_inicial', 'conteo_fisico', 'valor_esperado', 'diferencia',
    'justificacion_diferencia', 'responsable_actual', 'responsable_actual_persona_id'
  );

-- ── RPC ──────────────────────────────────────────────────────────────────────────────────────
-- Los parámetros de cifras son opcionales: null = no se toca.
create function public.corregir_turno_cerrado(
  p_turno_id uuid,
  p_motivo text,
  p_base_inicial integer default null,
  p_conteo_fisico integer default null,
  p_valor_esperado integer default null,
  p_justificacion text default null
)
returns setof public.turnos_caja
language plpgsql security definer set search_path = public
as $$
declare
  v_turno public.turnos_caja;
  v_nuevo public.turnos_caja;
  v_motivo text := nullif(trim(p_motivo), '');
  v_justificacion text;
  v_actor jsonb := interno.actor();
  v_por text := coalesce(nullif(v_actor ->> 'usuario_nombre', ''), nullif(v_actor ->> 'persona_nombre', ''));
  v_base integer;
  v_conteo integer;
  v_esperado integer;
  v_antes jsonb;
  v_despues jsonb;
begin
  if not interno.es_activo() or interno.rol_actual() <> 'admin' then
    raise exception 'No autorizado: solo gerencia puede corregir un turno cerrado';
  end if;
  if v_motivo is null or length(v_motivo) < 10 then
    raise exception 'El motivo de la corrección es obligatorio (mínimo 10 caracteres)';
  end if;
  if v_por is null then raise exception 'No se pudo identificar a quien corrige'; end if;
  if p_base_inicial is null and p_conteo_fisico is null and p_valor_esperado is null and p_justificacion is null then
    raise exception 'No hay nada que corregir';
  end if;
  if coalesce(p_base_inicial, 0) < 0 or coalesce(p_conteo_fisico, 0) < 0 or coalesce(p_valor_esperado, 0) < 0 then
    raise exception 'Las cifras no pueden ser negativas';
  end if;

  select * into v_turno from public.turnos_caja where id = p_turno_id for update;
  if not found then raise exception 'El turno no existe'; end if;
  if not v_turno.cerrado then
    raise exception 'El turno sigue abierto: se cierra con el arqueo normal, no se corrige';
  end if;

  v_base := coalesce(p_base_inicial, v_turno.base_inicial);
  v_conteo := coalesce(p_conteo_fisico, v_turno.conteo_fisico);
  v_esperado := coalesce(p_valor_esperado, v_turno.valor_esperado);
  v_justificacion := coalesce(nullif(trim(p_justificacion), ''), v_turno.justificacion_diferencia);

  if v_conteo is null or v_esperado is null then
    raise exception 'El turno no tiene arqueo registrado para recalcular la diferencia';
  end if;
  if v_conteo - v_esperado <> 0 and v_justificacion is null then
    raise exception 'Queda una diferencia en el arqueo: la justificación es obligatoria';
  end if;

  perform set_config('app.corrigiendo_turno', p_turno_id::text, true);

  update public.turnos_caja set
    base_inicial = v_base,
    conteo_fisico = v_conteo,
    valor_esperado = v_esperado,
    diferencia = v_conteo - v_esperado,
    justificacion_diferencia = v_justificacion,
    corregido_en = now(),
    corregido_por = v_por,
    motivo_correccion = v_motivo
  where id = p_turno_id
  returning * into v_nuevo;

  perform set_config('app.corrigiendo_turno', '', true);

  v_antes := jsonb_build_object(
    'base_inicial', v_turno.base_inicial, 'conteo_fisico', v_turno.conteo_fisico,
    'valor_esperado', v_turno.valor_esperado, 'diferencia', v_turno.diferencia,
    'justificacion_diferencia', v_turno.justificacion_diferencia
  );
  v_despues := jsonb_build_object(
    'base_inicial', v_nuevo.base_inicial, 'conteo_fisico', v_nuevo.conteo_fisico,
    'valor_esperado', v_nuevo.valor_esperado, 'diferencia', v_nuevo.diferencia,
    'justificacion_diferencia', v_nuevo.justificacion_diferencia,
    'motivo', v_motivo
  );

  insert into public.bitacora (
    usuario_id, usuario_nombre, usuario_rol, persona_id, persona_nombre,
    entidad, entidad_id, accion, antes, despues
  ) values (
    nullif(v_actor ->> 'usuario_id', '')::uuid, v_actor ->> 'usuario_nombre', v_actor ->> 'usuario_rol',
    nullif(v_actor ->> 'persona_id', '')::uuid, v_actor ->> 'persona_nombre',
    'turnos_caja', p_turno_id::text, 'corregir_turno', v_antes, v_despues
  );

  return next v_nuevo;
end;
$$;

revoke execute on function public.corregir_turno_cerrado(uuid, text, integer, integer, integer, text) from public, anon;
grant execute on function public.corregir_turno_cerrado(uuid, text, integer, integer, integer, text) to authenticated;
