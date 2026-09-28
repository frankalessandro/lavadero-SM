-- Operación de parqueadero para gerencia: revisar el histórico de estancias y anularlas con
-- motivo, igual que se anula una orden de lavado (regla 13: nada se borra, se anula visible).
--
-- La estancia guarda DOS estados independientes: `estado` (adentro/fuera, dónde está el vehículo
-- físicamente) y ahora `anulada` (si el registro fue un error — placa mal digitada, entrada
-- duplicada, etc.). Anular NO cambia `estado`/`cobro`/`multa`/`turno_id`: el valor queda como
-- constancia histórica, y son las lecturas (arqueo, rentabilidad, reportes) las que la excluyen.

alter table public.estancias_parqueadero
  add column if not exists anulada boolean not null default false,
  add column if not exists motivo_anulacion text,
  add column if not exists anulada_por text,
  add column if not exists anulada_en timestamptz;

-- `interno.bitacora_trigger` solo reetiquetaba a 'anular' cuando `estado` llegaba al literal
-- 'anulada' (ordenes, ventas, compras, deudas_personal). Estancias no tiene ese literal — usa un
-- booleano aparte — así que se extiende la misma función para reconocer también `anulada`/
-- `anulado` pasando de false/NULL a true, sin tocar el comportamiento de ninguna tabla existente.
create or replace function interno.bitacora_trigger()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_actor jsonb := interno.actor();
  v_new jsonb;
  v_old jsonb;
  v_antes jsonb := '{}'::jsonb;
  v_despues jsonb := '{}'::jsonb;
  v_accion text;
  v_col text;
  v_i integer;
  v_hubo_cambio boolean := false;
begin
  if TG_OP = 'INSERT' then
    v_new := to_jsonb(NEW);
    v_accion := TG_ARGV[0];
    v_despues := v_new;
  else
    v_new := to_jsonb(NEW);
    v_old := to_jsonb(OLD);

    for v_i in 1 .. (TG_NARGS - 1)
    loop
      v_col := TG_ARGV[v_i];
      if v_new -> v_col is distinct from v_old -> v_col then
        v_antes   := v_antes   || jsonb_build_object(v_col, v_old -> v_col);
        v_despues := v_despues || jsonb_build_object(v_col, v_new -> v_col);
        v_hubo_cambio := true;
      end if;
    end loop;

    if not v_hubo_cambio then
      return null;
    end if;

    if v_new ->> 'estado' = 'anulada' and v_old ->> 'estado' is distinct from 'anulada' then
      v_accion := 'anular';
    elsif (v_new ->> 'anulada')::boolean is true and coalesce((v_old ->> 'anulada')::boolean, false) is false then
      v_accion := 'anular';
    elsif (v_new ->> 'anulado')::boolean is true and coalesce((v_old ->> 'anulado')::boolean, false) is false then
      v_accion := 'anular';
    else
      v_accion := TG_ARGV[0];
    end if;
  end if;

  insert into public.bitacora (
    usuario_id, usuario_nombre, usuario_rol, persona_id, persona_nombre,
    entidad, entidad_id, accion, antes, despues
  ) values (
    nullif(v_actor ->> 'usuario_id', '')::uuid,
    v_actor ->> 'usuario_nombre',
    v_actor ->> 'usuario_rol',
    nullif(v_actor ->> 'persona_id', '')::uuid,
    v_actor ->> 'persona_nombre',
    TG_TABLE_NAME,
    v_new ->> 'id',
    v_accion,
    case when TG_OP = 'INSERT' then null else v_antes end,
    v_despues
  );

  return null;
end;
$$;

drop trigger if exists bitacora_estancias_update on public.estancias_parqueadero;
create trigger bitacora_estancias_update
  after update on public.estancias_parqueadero
  for each row execute function interno.bitacora_trigger(
    'editar', 'estado', 'placa', 'modalidad', 'clase_vehiculo', 'cobro', 'multa', 'metodo_pago',
    'turno_id', 'anulada', 'motivo_anulacion', 'anulada_por');

-- ── Anular ───────────────────────────────────────────────────────────────────────────────────
-- Mismo rol que registra entradas/salidas (vigilante o admin): es la operación diaria del
-- parqueadero, no una función exclusiva de gerencia (igual criterio que anular una orden de
-- lavado, que el jefe de patio hace sin PIN — ver "Autoridad del jefe de patio" en CLAUDE.md).
create or replace function public.anular_estancia_parqueadero(
  p_estancia_id uuid, p_motivo text, p_anulada_por text
) returns setof public.estancias_parqueadero
language plpgsql security definer set search_path = public
as $$
declare
  v_estancia public.estancias_parqueadero;
  v_motivo text := nullif(trim(p_motivo), '');
  v_por text := nullif(trim(p_anulada_por), '');
begin
  if not interno.es_activo() or interno.rol_actual() not in ('vigilante', 'admin') then
    raise exception 'No autorizado';
  end if;
  if v_motivo is null or length(v_motivo) < 3 then
    raise exception 'El motivo de anulación es obligatorio (mínimo 3 caracteres)';
  end if;
  if v_por is null then raise exception 'Indica quién anula el registro'; end if;

  select * into v_estancia from public.estancias_parqueadero where id = p_estancia_id for update;
  if not found then raise exception 'El registro no existe'; end if;
  if v_estancia.anulada then raise exception 'Este registro ya está anulado'; end if;

  update public.estancias_parqueadero set
    anulada = true, motivo_anulacion = v_motivo, anulada_por = v_por, anulada_en = now()
  where id = p_estancia_id
  returning * into v_estancia;

  return next v_estancia;
end;
$$;

revoke all on function public.anular_estancia_parqueadero(uuid, text, text) from public, anon;
grant execute on function public.anular_estancia_parqueadero(uuid, text, text) to authenticated;

-- ── Blindar salida/cobro previsto contra un registro ya anulado ─────────────────────────────
create or replace function public.registrar_salida_parqueadero(p_estancia_id uuid, p_metodo_pago text default null)
returns setof public.estancias_parqueadero
language plpgsql security definer set search_path = public
as $$
declare
  v_estancia public.estancias_parqueadero;
  v_precio integer;
  v_multa_tarifa integer;
  v_cobro integer;
  v_multa integer;
  v_turno_id uuid;
begin
  if not interno.es_activo() or interno.rol_actual() not in ('vigilante', 'admin') then
    raise exception 'No autorizado';
  end if;

  select * into v_estancia from public.estancias_parqueadero where id = p_estancia_id for update;
  if not found then raise exception 'La estancia no existe'; end if;
  if v_estancia.anulada then raise exception 'Este registro está anulado'; end if;
  if v_estancia.estado <> 'adentro' then
    raise exception 'Ese vehículo ya salió del parqueadero';
  end if;

  select coalesce(precio, 0), multa_fuera_ventana into v_precio, v_multa_tarifa
  from public.tarifas_parqueadero
  where modalidad = v_estancia.modalidad and clase_vehiculo = v_estancia.clase_vehiculo;

  v_cobro := case when v_estancia.modalidad = 'noche' then coalesce(v_precio, 0) else 0 end;
  v_multa := case
    when interno.fuera_de_ventana_salida(v_estancia.modalidad, v_estancia.hora_ingreso)
    then coalesce(v_multa_tarifa, 0) else 0
  end;
  v_cobro := v_cobro + v_multa;

  if v_cobro > 0 and coalesce(p_metodo_pago, '') not in ('efectivo', 'transferencia', 'datafono') then
    raise exception 'Indica el método de pago del cobro de parqueadero';
  end if;

  select id into v_turno_id from public.turnos_caja where rol = 'vigilante' and not cerrado;

  update public.estancias_parqueadero set
    estado = 'fuera',
    hora_salida = now(),
    cobro = v_cobro,
    multa = v_multa,
    metodo_pago = case when v_cobro > 0 then p_metodo_pago else null end,
    turno_id = v_turno_id
  where id = p_estancia_id
  returning * into v_estancia;

  return next v_estancia;
end;
$$;
