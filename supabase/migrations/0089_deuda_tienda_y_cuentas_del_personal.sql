-- Cuentas abiertas del personal cruzadas con su deuda, y deuda en dos bolsas: préstamos y tienda
-- (decisiones de Alessandro, 2026-10-28).
--
-- Antes: el titular de una cuenta abierta era texto libre, así que lo que un trabajador iba
-- cargando en la nevera vivía aparte de sus préstamos hasta que alguien cerraba la cuenta con
-- "Cargar a un trabajador" (nunca se usó: las cuentas quedaban abiertas semanas). Y la deuda era
-- una sola bolsa: la colilla decía "Debe $X" sin distinguir préstamo de consumo.
--
--   · `cuentas.lavador_id` / `persona_id`: la cuenta se vincula a una persona AL ABRIRLA (opcional:
--     un cliente o acompañante sigue siendo texto libre). Una cuenta a costo de gerencia queda
--     vinculada a su destinatario.
--   · `deudas_personal.bolsa`: 'prestamo' (préstamos) o 'tienda' (consumo de nevera + faltantes de
--     inventario cobrados). Cada abono y cada descuento de liquidación dice a qué bolsa va, y
--     ninguna bolsa puede quedar negativa.
--   · Fiado continuo: la cuenta del trabajador SIGUE ABIERTA aunque abone. Lo pendiente de sus
--     cuentas vinculadas cuenta como deuda de tienda "en vivo" (`saldos_deuda_personal`). Cuando se
--     abona o se descuenta tienda, el trigger primero CONSOLIDA esas cuentas: sus ventas pendientes
--     pasan a activas (sale el stock, se estampa el costo, igual que `cargar_cuenta_a_personal`) y
--     su total entra al ledger como 'consumo'. La cuenta queda abierta y vacía para seguir cargando.
--   · Abono a tienda: en efectivo a la caja del turno (jefe de patio) o por fuera / directo a
--     gerencia — el mismo `registrar_abono_deuda` de siempre, con la bolsa como parámetro nuevo.
--
-- Los vínculos de las cuentas que ya estaban abiertas se hacen aparte (datos, no esquema).

-- ── 0) Cuentas vinculadas a una persona ─────────────────────────────────────────────────────────
alter table public.cuentas
  add column lavador_id uuid references public.lavadores(id),
  add column persona_id uuid references public.perfiles(id);

alter table public.cuentas add constraint cuentas_deudor_check
  check (lavador_id is null or persona_id is null);

-- Una cuenta a costo vinculada solo puede ser de su destinatario (una a costo vieja puede quedar
-- sin vincular, p. ej. una compartida).
alter table public.cuentas add constraint cuentas_a_costo_deudor_check
  check (not a_costo or (lavador_id is null and (persona_id is null or persona_id = destinatario_id)));

create index cuentas_deudor_abiertas_idx on public.cuentas (coalesce(lavador_id, persona_id)) where estado = 'abierta';

comment on column public.cuentas.lavador_id is 'Lavador dueño de la cuenta (0089): lo pendiente cuenta como su deuda de tienda.';
comment on column public.cuentas.persona_id is 'Jefe de patio o gerencia dueño de la cuenta (0089): lo pendiente cuenta como su deuda de tienda.';

drop trigger bitacora_cuentas_update on public.cuentas;
create trigger bitacora_cuentas_update after update on public.cuentas
  for each row execute function interno.bitacora_trigger('editar', 'estado', 'titular', 'turno_id', 'lavador_id', 'persona_id');

-- ── 1) Bolsa de cada movimiento de deuda ────────────────────────────────────────────────────────
alter table public.deudas_personal add column bolsa text;

-- Al migrar no hay ningún 'consumo' en producción: todo abono/descuento previo fue de préstamos.
update public.deudas_personal set bolsa = case when tipo in ('consumo', 'faltante') then 'tienda' else 'prestamo' end;

alter table public.deudas_personal alter column bolsa set not null;
alter table public.deudas_personal add constraint deudas_personal_bolsa_check
  check (
    (tipo = 'prestamo' and bolsa = 'prestamo')
    or (tipo in ('consumo', 'faltante') and bolsa = 'tienda')
    or (tipo in ('abono', 'liquidacion') and bolsa in ('prestamo', 'tienda'))
  );

comment on column public.deudas_personal.bolsa is
  'prestamo = préstamos de caja · tienda = consumo de nevera y faltantes cobrados (0089). Cada bolsa nunca queda negativa.';

-- ── 2) Saldo por bolsa ──────────────────────────────────────────────────────────────────────────
create function interno.deuda_pendiente(p_lavador_id uuid, p_persona_id uuid, p_bolsa text)
returns integer
language sql stable security definer set search_path to 'public'
as $$
  select coalesce(sum(monto), 0)::integer from deudas_personal
  where estado = 'activo' and bolsa = p_bolsa
    and ((p_lavador_id is not null and lavador_id = p_lavador_id)
      or (p_persona_id is not null and persona_id = p_persona_id));
$$;
revoke execute on function interno.deuda_pendiente(uuid, uuid, text) from public, anon, authenticated;

-- ── 3) Consolidar las cuentas abiertas de una persona en su deuda de tienda ─────────────────────
-- Mismo efecto que `cargar_cuenta_a_personal` sobre cada pendiente (stock + costo + 'consumo'), pero
-- la cuenta NO se cierra: es fiado continuo. Devuelve el total consolidado.
create function interno.consolidar_cuentas_deudor(p_lavador_id uuid, p_persona_id uuid, p_responsable text)
returns integer
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_cuenta cuentas;
  v_pendiente record;
  v_total integer;
  v_suma integer := 0;
  v_turno uuid;
  v_deudor text := interno.deudor_nombre(p_lavador_id, p_persona_id);
  v_responsable text := coalesce(nullif(trim(p_responsable), ''), 'Sistema');
begin
  select id into v_turno from turnos_caja where rol = 'jefe_zona' and not cerrado;

  for v_cuenta in
    select * from cuentas
    where estado = 'abierta'
      and ((p_lavador_id is not null and lavador_id = p_lavador_id)
        or (p_persona_id is not null and persona_id = p_persona_id))
    order by abierta_en
    for update
  loop
    select coalesce(sum(total), 0) into v_total from ventas where cuenta_id = v_cuenta.id and estado = 'pendiente';
    continue when v_total <= 0;

    for v_pendiente in select * from ventas where cuenta_id = v_cuenta.id and estado = 'pendiente' for update
    loop
      update ventas set estado = 'activa', metodo_pago = 'cuenta_lavador', turno_id = v_turno, cobrada_en = now()
      where id = v_pendiente.id;

      insert into movimientos_inventario (producto_id, tipo, cantidad, costo_unitario, motivo, responsable, venta_id)
      values (
        v_pendiente.producto_id, 'salida', -v_pendiente.cantidad, interno.costo_promedio_producto(v_pendiente.producto_id),
        'Venta #' || v_pendiente.consecutivo || ' (cargada' || (case when v_cuenta.a_costo then ' a costo' else '' end)
          || ' a ' || v_deudor || ' — cuenta: ' || v_cuenta.titular || ')',
        v_responsable, v_pendiente.id
      );
    end loop;

    insert into deudas_personal (lavador_id, persona_id, tipo, bolsa, monto, cuenta_id, motivo, registrado_por)
    values (p_lavador_id, p_persona_id, 'consumo', 'tienda', v_total, v_cuenta.id,
      case when v_cuenta.a_costo then 'Retiro a costo' else 'Consumo de nevera' end
        || ' — cuenta "' || v_cuenta.titular || '" (sigue abierta)',
      v_responsable);

    v_suma := v_suma + v_total;
  end loop;

  return v_suma;
end;
$$;
revoke execute on function interno.consolidar_cuentas_deudor(uuid, uuid, text) from public, anon, authenticated;

-- ── 4) Trigger: bolsa por defecto, consolidación y guarda por bolsa ─────────────────────────────
create or replace function interno.deuda_no_negativa()
returns trigger
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_saldo integer;
begin
  -- Préstamo → préstamos; consumo y faltante → tienda. Un abono/descuento sin bolsa (cliente
  -- anterior a 0089) se toma de préstamos, que era lo único que existía.
  if new.bolsa is null then
    new.bolsa := case when new.tipo in ('consumo', 'faltante') then 'tienda' else 'prestamo' end;
  end if;

  if new.estado = 'activo' and new.monto < 0 then
    perform pg_advisory_xact_lock(hashtext('deuda:' || coalesce(new.lavador_id, new.persona_id)::text));
    -- Lo que está cargado en sus cuentas abiertas también es deuda de tienda: se pasa al ledger
    -- antes de abonar o descontar, así el abono puede cubrirlo.
    if new.bolsa = 'tienda' then
      perform interno.consolidar_cuentas_deudor(new.lavador_id, new.persona_id, new.registrado_por);
    end if;
    v_saldo := interno.deuda_pendiente(new.lavador_id, new.persona_id, new.bolsa);
    if v_saldo + new.monto < 0 then
      raise exception 'El abono o descuento (%) supera la deuda de % pendiente (%)',
        -new.monto, case when new.bolsa = 'tienda' then 'tienda' else 'préstamos' end, v_saldo;
    end if;
  end if;
  return new;
end;
$$;

-- ── 5) Saldos de todo el personal, por bolsa, con lo pendiente en cuentas abiertas ──────────────
create function public.saldos_deuda_personal()
returns table (lavador_id uuid, persona_id uuid, prestamo integer, tienda integer, tienda_en_cuenta integer)
language plpgsql stable security definer set search_path to 'public'
as $$
begin
  if not interno.es_activo() or interno.rol_actual() not in ('jefe_zona', 'admin') then
    raise exception 'No autorizado para ver deudas del personal';
  end if;

  return query
  with ledger as (
    select d.lavador_id, d.persona_id,
      sum(d.monto) filter (where d.bolsa = 'prestamo') as prestamo,
      sum(d.monto) filter (where d.bolsa = 'tienda') as tienda
    from deudas_personal d where d.estado = 'activo'
    group by d.lavador_id, d.persona_id
  ), en_cuenta as (
    select c.lavador_id, c.persona_id, sum(v.total) as total
    from cuentas c join ventas v on v.cuenta_id = c.id and v.estado = 'pendiente'
    where c.estado = 'abierta' and (c.lavador_id is not null or c.persona_id is not null)
    group by c.lavador_id, c.persona_id
  )
  select coalesce(l.lavador_id, e.lavador_id), coalesce(l.persona_id, e.persona_id),
    coalesce(l.prestamo, 0)::integer,
    (coalesce(l.tienda, 0) + coalesce(e.total, 0))::integer,
    coalesce(e.total, 0)::integer
  from ledger l
  full join en_cuenta e
    on l.lavador_id is not distinct from e.lavador_id and l.persona_id is not distinct from e.persona_id;
end;
$$;
revoke execute on function public.saldos_deuda_personal() from public, anon;
grant execute on function public.saldos_deuda_personal() to authenticated;

-- ── 6) Abrir cuenta: a nombre de una persona del sistema ────────────────────────────────────────
drop function public.abrir_cuenta(text, text, text, boolean, uuid, text, text);

create function public.abrir_cuenta(
  p_titular text,
  p_nota text default null,
  p_abierta_por text default null,
  p_a_costo boolean default false,
  p_destinatario_id uuid default null,
  p_motivo text default null,
  p_autorizado_por text default null,
  p_lavador_id uuid default null,
  p_persona_id uuid default null
)
returns setof public.cuentas
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_titular text := nullif(trim(p_titular), '');
  v_responsable text := nullif(trim(p_abierta_por), '');
  v_nota text := nullif(trim(p_nota), '');
  v_a_costo boolean := coalesce(p_a_costo, false);
  v_motivo text := nullif(trim(p_motivo), '');
  v_autoriza text := nullif(trim(p_autorizado_por), '');
  v_lavador_id uuid := p_lavador_id;
  v_persona_id uuid := p_persona_id;
  v_cuenta public.cuentas;
begin
  if not interno.es_activo() or interno.rol_actual() not in ('jefe_zona', 'admin') then
    raise exception 'No autorizado para abrir cuentas';
  end if;
  if v_responsable is null then
    raise exception 'Indica quién abre la cuenta';
  end if;

  if v_a_costo then
    perform interno.exigir_gerencia(p_destinatario_id);
    if v_motivo is null or length(v_motivo) < 5 then
      raise exception 'Indica el motivo de la cuenta a costo';
    end if;
    if v_autoriza is null then
      raise exception 'Indica quién autoriza la cuenta a costo';
    end if;
    -- La cuenta a costo es siempre del gerente que la recibe.
    v_lavador_id := null;
    v_persona_id := p_destinatario_id;
  end if;

  if v_lavador_id is not null or v_persona_id is not null then
    v_titular := coalesce(v_titular, interno.deudor_nombre(v_lavador_id, v_persona_id));
  end if;
  if v_titular is null or length(v_titular) < 2 then
    raise exception 'El nombre de la cuenta es obligatorio';
  end if;

  insert into public.cuentas (titular, nota, abierta_por, a_costo, destinatario_id, motivo, autorizado_por, lavador_id, persona_id)
  values (
    v_titular, v_nota, v_responsable,
    v_a_costo,
    case when v_a_costo then p_destinatario_id end,
    case when v_a_costo then v_motivo end,
    case when v_a_costo then v_autoriza end,
    v_lavador_id, v_persona_id
  )
  returning * into v_cuenta;

  return next v_cuenta;
end;
$$;
revoke execute on function public.abrir_cuenta(text, text, text, boolean, uuid, text, text, uuid, uuid) from public, anon;
grant execute on function public.abrir_cuenta(text, text, text, boolean, uuid, text, text, uuid, uuid) to authenticated;

-- ── 7) Cerrar cargando a deuda: una cuenta vinculada se carga a su dueño ────────────────────────
create or replace function public.cargar_cuenta_a_personal(p_cuenta_id uuid, p_lavador_id uuid, p_persona_id uuid, p_cerrada_por text)
returns setof cuentas
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_cuenta cuentas;
  v_total integer;
  v_responsable text := nullif(trim(p_cerrada_por), '');
  v_pendiente record;
  v_turno_actual uuid;
  v_deudor text;
  v_lavador_id uuid;
  v_persona_id uuid;
begin
  if not interno.es_activo() or interno.rol_actual() not in ('jefe_zona', 'admin') then
    raise exception 'No autorizado para cerrar cuentas';
  end if;
  if v_responsable is null then
    raise exception 'Indica quién cierra la cuenta';
  end if;

  select * into v_cuenta from cuentas where id = p_cuenta_id for update;
  if not found then raise exception 'La cuenta no existe'; end if;
  if v_cuenta.estado <> 'abierta' then
    raise exception 'La cuenta ya está % — no se puede cerrar de nuevo', v_cuenta.estado;
  end if;

  -- El deudor quedó decidido al abrir (persona vinculada o gerente de la cuenta a costo): lo que
  -- mande el cliente se ignora.
  if v_cuenta.lavador_id is not null or v_cuenta.persona_id is not null then
    v_lavador_id := v_cuenta.lavador_id;
    v_persona_id := v_cuenta.persona_id;
  elsif v_cuenta.a_costo then
    v_lavador_id := null;
    v_persona_id := v_cuenta.destinatario_id;
  else
    v_lavador_id := p_lavador_id;
    v_persona_id := p_persona_id;
  end if;
  v_deudor := interno.deudor_nombre(v_lavador_id, v_persona_id);

  select coalesce(sum(total), 0) into v_total from ventas where cuenta_id = p_cuenta_id and estado = 'pendiente';
  if v_total <= 0 then
    raise exception 'La cuenta no tiene productos pendientes — usa "Anular cuenta" si no se va a cobrar nada';
  end if;

  select id into v_turno_actual from turnos_caja where rol = 'jefe_zona' and not cerrado;

  update cuentas set estado = 'cerrada', cerrada_en = now(), cerrada_por = v_responsable, turno_id = v_turno_actual
  where id = p_cuenta_id returning * into v_cuenta;

  for v_pendiente in select * from ventas where cuenta_id = p_cuenta_id and estado = 'pendiente' for update
  loop
    update ventas set estado = 'activa', metodo_pago = 'cuenta_lavador', turno_id = v_turno_actual, cobrada_en = now()
    where id = v_pendiente.id;

    insert into movimientos_inventario (producto_id, tipo, cantidad, costo_unitario, motivo, responsable, venta_id)
    values (
      v_pendiente.producto_id, 'salida', -v_pendiente.cantidad, interno.costo_promedio_producto(v_pendiente.producto_id),
      'Venta #' || v_pendiente.consecutivo || ' (cargada' || (case when v_cuenta.a_costo then ' a costo' else '' end)
        || ' a ' || v_deudor || ' — cuenta: ' || v_cuenta.titular || ')',
      v_responsable, v_pendiente.id
    );
  end loop;

  insert into deudas_personal (lavador_id, persona_id, tipo, bolsa, monto, cuenta_id, motivo, registrado_por)
  values (v_lavador_id, v_persona_id, 'consumo', 'tienda', v_total, p_cuenta_id,
    case when v_cuenta.a_costo then 'Retiro a costo — cuenta "' || v_cuenta.titular || '"'
         else 'Consumo de nevera — cuenta "' || v_cuenta.titular || '"' end,
    v_responsable);

  return next v_cuenta;
end;
$$;

-- ── 8) Abono a una bolsa ────────────────────────────────────────────────────────────────────────
drop function public.registrar_abono_deuda(uuid, uuid, integer, text, text);

create function public.registrar_abono_deuda(
  p_lavador_id uuid,
  p_persona_id uuid,
  p_monto integer,
  p_metodo text,
  p_motivo text,
  p_bolsa text default 'prestamo'
)
returns setof deudas_personal
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_turno turnos_caja;
  v_motivo text := nullif(trim(p_motivo), '');
  v_registra text;
  v_deuda deudas_personal;
begin
  if not interno.es_activo() or interno.rol_actual() not in ('jefe_zona', 'admin') then
    raise exception 'No autorizado para registrar abonos';
  end if;
  if p_monto is null or p_monto <= 0 then
    raise exception 'El abono debe ser mayor a cero';
  end if;
  if p_metodo not in ('efectivo', 'fuera') then
    raise exception 'Método de abono inválido: %', p_metodo;
  end if;
  if p_bolsa is null or p_bolsa not in ('prestamo', 'tienda') then
    raise exception 'Indica si el abono es a préstamos o a tienda';
  end if;
  perform interno.deudor_nombre(p_lavador_id, p_persona_id);

  select * into v_turno from turnos_caja where rol = 'jefe_zona' and not cerrado for update;

  if p_metodo = 'efectivo' then
    if v_turno.id is null then
      raise exception 'Un abono en efectivo entra a la caja: abre el turno de caja primero';
    end if;
  elsif v_motivo is null or length(v_motivo) < 5 then
    raise exception 'Indica cómo se pagó (ej. transferencia Nequi, directo a gerencia)';
  end if;

  v_registra := case
    when interno.rol_actual() = 'jefe_zona' and v_turno.id is not null then v_turno.responsable_actual
    else coalesce(nullif(trim(interno.actor() ->> 'persona_nombre'), ''), 'Administrador')
  end;

  insert into deudas_personal (lavador_id, persona_id, tipo, bolsa, monto, turno_id, metodo_abono, motivo, registrado_por)
  values (
    p_lavador_id, p_persona_id, 'abono', p_bolsa, -p_monto,
    case when p_metodo = 'efectivo' then v_turno.id end,
    p_metodo, v_motivo, v_registra
  )
  returning * into v_deuda;

  return next v_deuda;
end;
$$;
revoke execute on function public.registrar_abono_deuda(uuid, uuid, integer, text, text, text) from public, anon;
grant execute on function public.registrar_abono_deuda(uuid, uuid, integer, text, text, text) to authenticated;

-- ── 9) Anular préstamo o faltante: la guarda mira su bolsa ──────────────────────────────────────
create or replace function public.anular_deuda(p_id uuid, p_motivo text)
returns setof deudas_personal
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_deuda deudas_personal;
  v_motivo text := nullif(trim(p_motivo), '');
  v_por text := coalesce(nullif(trim(interno.actor() ->> 'persona_nombre'), ''), 'Administrador');
begin
  if not interno.es_activo() or not interno.es_admin() then
    raise exception 'Solo un administrador puede anular una deuda';
  end if;
  if v_motivo is null or length(v_motivo) < 5 then
    raise exception 'El motivo de anulación es obligatorio';
  end if;

  select * into v_deuda from deudas_personal where id = p_id for update;
  if not found then raise exception 'El registro no existe'; end if;
  if v_deuda.estado <> 'activo' then raise exception 'Ya está anulado'; end if;
  if v_deuda.tipo not in ('prestamo', 'abono', 'faltante') then
    raise exception 'Un % no se anula acá (consumo: anula la venta; descuento: anula la liquidación)', v_deuda.tipo;
  end if;
  if v_deuda.tipo in ('prestamo', 'faltante')
     and interno.deuda_pendiente(v_deuda.lavador_id, v_deuda.persona_id, v_deuda.bolsa) - v_deuda.monto < 0 then
    raise exception 'No se puede anular: ya se abonó o descontó más de lo que quedaría debiendo. Anula primero ese abono o liquidación';
  end if;

  update deudas_personal set estado = 'anulado', motivo_anulacion = v_motivo, anulada_por = v_por, anulada_en = now()
  where id = p_id returning * into v_deuda;

  if v_deuda.tipo = 'faltante' and v_deuda.conteo_linea_id is not null then
    update conteos_inventario_lineas set estado_faltante = 'pendiente',
      motivo = coalesce(motivo || ' | ', '') || 'Cobro anulado: ' || v_motivo
    where id = v_deuda.conteo_linea_id;
  end if;

  return next v_deuda;
end;
$$;
