-- Parqueadero por clase de vehículo + multa por salida fuera de ventana + consecutivo de tiquete.
--
-- Confirmado con Alessandro (2026-09-28):
--  · El parqueadero no maneja cupos, pero sí tarifa según el vehículo. Tres clases propias del
--    parqueadero, independientes de `tipos_vehiculo` del lavadero: carro (automóvil y
--    camionetas), moto y motocarro. Aplica a las TRES modalidades → matriz modalidad × clase.
--  · Multa de la regla 7 (salir después de las 8:00 am): su forma de cobro sigue sin definirse
--    (Plan §13), así que queda como un valor fijo configurable por modalidad × clase que arranca en
--    $0. Con $0 el sistema solo avisa "Fuera de ventana"; con un valor, se suma solo al cobro.
--  · Consecutivo continuo para el tiquete de parqueadero (PAR-n), igual que LAV-n en el lavadero
--    (control antifraude: huecos visibles).
--
-- Aditiva: no cambia el cobro de ninguna estancia existente. Las tarifas nuevas de moto y
-- motocarro arrancan con el MISMO precio que carro (nadie queda cobrando $0 por accidente);
-- gerencia las ajusta en Catálogo › Parqueadero.

-- ── Estancias ────────────────────────────────────────────────────────────────────────────────
alter table public.estancias_parqueadero
  add column if not exists clase_vehiculo text not null default 'carro'
    check (clase_vehiculo in ('carro', 'moto', 'motocarro')),
  add column if not exists multa integer not null default 0 check (multa >= 0),
  add column if not exists consecutivo bigint generated always as identity;

create unique index if not exists estancias_parqueadero_consecutivo_key
  on public.estancias_parqueadero (consecutivo);

-- ── Tarifas: de una fila por modalidad a una por modalidad × clase ──────────────────────────
alter table public.tarifas_parqueadero
  add column if not exists clase_vehiculo text not null default 'carro'
    check (clase_vehiculo in ('carro', 'moto', 'motocarro')),
  add column if not exists multa_fuera_ventana integer not null default 0 check (multa_fuera_ventana >= 0);

alter table public.tarifas_parqueadero drop constraint if exists tarifas_parqueadero_modalidad_key;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'tarifas_parqueadero_modalidad_clase_key') then
    alter table public.tarifas_parqueadero
      add constraint tarifas_parqueadero_modalidad_clase_key unique (modalidad, clase_vehiculo);
  end if;
end $$;

insert into public.tarifas_parqueadero (modalidad, clase_vehiculo, precio)
select t.modalidad, c.clase, t.precio
from public.tarifas_parqueadero t
cross join (values ('moto'), ('motocarro')) as c(clase)
where t.clase_vehiculo = 'carro'
on conflict (modalidad, clase_vehiculo) do nothing;

-- ── Bitácora: la multa es un precio más, y la clase/multa de una estancia se auditan ────────
drop trigger if exists bitacora_tarifas_update on public.tarifas_parqueadero;
create trigger bitacora_tarifas_update
  after update on public.tarifas_parqueadero
  for each row execute function interno.bitacora_trigger('cambiar_precio', 'precio', 'multa_fuera_ventana');

drop trigger if exists bitacora_estancias_update on public.estancias_parqueadero;
create trigger bitacora_estancias_update
  after update on public.estancias_parqueadero
  for each row execute function interno.bitacora_trigger(
    'editar', 'estado', 'placa', 'modalidad', 'clase_vehiculo', 'cobro', 'multa', 'metodo_pago', 'turno_id');

-- ── Ventana de salida (regla 7) ──────────────────────────────────────────────────────────────
-- Límite = las 8:00 am (hora Colombia) siguientes al ingreso. Antes se consideraba "fuera de
-- ventana" cualquier salida entre 8 am y 7 pm, sin mirar el ingreso: un carro que entró a las
-- 10:00 y salía a las 15:00 el mismo día salía marcado como tarde. `fijo` nunca aplica.
create or replace function interno.fuera_de_ventana_salida(
  p_modalidad text,
  p_hora_ingreso timestamptz,
  p_ahora timestamptz default now()
) returns boolean
language sql stable
as $$
  select p_modalidad in ('noche', 'mensualidad')
    and (p_ahora at time zone 'America/Bogota') > (
      date_trunc('day', p_hora_ingreso at time zone 'America/Bogota') + interval '8 hours'
      + case
          when (p_hora_ingreso at time zone 'America/Bogota')
               >= date_trunc('day', p_hora_ingreso at time zone 'America/Bogota') + interval '8 hours'
          then interval '1 day'
          else interval '0'
        end
    );
$$;

-- ── Salida: tarifa por clase + multa, todo resuelto en la base (regla 17) ────────────────────
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
  if v_estancia.estado <> 'adentro' then
    raise exception 'Ese vehículo ya salió del parqueadero';
  end if;

  select coalesce(precio, 0), multa_fuera_ventana into v_precio, v_multa_tarifa
  from public.tarifas_parqueadero
  where modalidad = v_estancia.modalidad and clase_vehiculo = v_estancia.clase_vehiculo;

  -- Regla 17: solo la modalidad noche cobra por movimiento; mensualidad y fijo se facturan aparte.
  v_cobro := case when v_estancia.modalidad = 'noche' then coalesce(v_precio, 0) else 0 end;
  -- Regla 7: multa por salir después de la ventana (noche y mensualidad). En $0 = solo aviso.
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

-- ── Cobro previsto (para mostrarlo ANTES de confirmar la salida) ─────────────────────────────
-- Misma cuenta que registrar_salida_parqueadero, sin modificar nada. Así la pantalla del
-- vigilante nunca calcula el cobro por su lado.
create or replace function public.cobro_previsto_parqueadero(p_estancia_id uuid)
returns table (tarifa integer, multa integer, total integer, fuera_de_ventana boolean)
language plpgsql stable security definer set search_path = public
as $$
declare
  v_estancia public.estancias_parqueadero;
  v_precio integer;
  v_multa_tarifa integer;
  v_fuera boolean;
begin
  if not interno.es_activo() or interno.rol_actual() not in ('vigilante', 'admin') then
    raise exception 'No autorizado';
  end if;
  select * into v_estancia from public.estancias_parqueadero where id = p_estancia_id;
  if not found then raise exception 'La estancia no existe'; end if;

  select coalesce(precio, 0), multa_fuera_ventana into v_precio, v_multa_tarifa
  from public.tarifas_parqueadero
  where modalidad = v_estancia.modalidad and clase_vehiculo = v_estancia.clase_vehiculo;

  v_fuera := interno.fuera_de_ventana_salida(v_estancia.modalidad, v_estancia.hora_ingreso);
  tarifa := case when v_estancia.modalidad = 'noche' then coalesce(v_precio, 0) else 0 end;
  multa := case when v_fuera then coalesce(v_multa_tarifa, 0) else 0 end;
  total := tarifa + multa;
  fuera_de_ventana := v_fuera;
  return next;
end;
$$;

revoke all on function public.cobro_previsto_parqueadero(uuid) from public, anon;
grant execute on function public.cobro_previsto_parqueadero(uuid) to authenticated;
revoke all on function interno.fuera_de_ventana_salida(text, timestamptz, timestamptz) from public, anon;
grant execute on function interno.fuera_de_ventana_salida(text, timestamptz, timestamptz) to authenticated;
