-- Personal operativo: la persona real detrás de la cuenta compartida.
--
-- Hoy hay UNA cuenta de Supabase Auth por rol ('Gerencia', 'Jefe de patio', 'Vigilante'),
-- compartida por varias personas, y la persona real solo existe como texto tecleado a mano en
-- `turnos_caja.responsable` y `ordenes.jefe_zona_responsable`. Resultado medido en producción
-- antes de esta migración: 13 grafías distintas para 3 personas, y la comisión de jefe de patio
-- de Julián partida en SEIS pedazos —
--
--   Julian Salinas $38.100 · Julian $26.250 · JULIAN SALINAS $24.000 ·
--   Julian salinas $5.400 · Julián salinas $3.450 · Uulian $1.050   (total real $98.250)
--
-- El día que Admin generara el primer corte de jefe de patio le habría pagado seis colillas
-- parciales o se le habrían perdido cinco. Ninguna orden está liquidada todavía
-- (`liquidacion_jefe_zona_id` nulo en todas), así que se corrige a tiempo y sin plata mal pagada.
--
-- Mapeo confirmado con el negocio:
--   · todos los "julian/Julián/JULIAN/Uulian"  → Julián Salinas   (jefe de patio)
--   · "Frank/Frank Roldan/Frank roldan" + "Angel" → Frank Roldán  (administrador)
--   · "Laura/Laura Montealegre"                → Laura Montealegre (administradora)
--
-- Criterio de diseño: el texto original NO se reescribe. La columna de texto queda como
-- evidencia de lo que se tecleó en su momento (regla 13, histórico inmutable) y la FK nueva
-- `*_persona_id` pasa a ser la verdad para agrupar y liquidar. Mismo criterio que ya se usó con
-- `lavadores.posicion_cronograma_base` en 0020: resolver por id, no por nombre exacto, para que
-- renombrar o inactivar a alguien no rompa nada.

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- Tabla
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- Desacoplada de `auth.users` a propósito: las cuentas siguen siendo una por rol (no hay que
-- crear correos ni entrenar a nadie en logins nuevos). La cuenta identifica el rol y el
-- dispositivo; esta tabla identifica a la persona.

create table public.personal_operativo (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  -- Nivel jerárquico, NO el rol de la caja que abre: Frank y Laura son administradores aunque
  -- cubran el mostrador como jefes de patio. Es lo que decide, en Capa 2, si una operación
  -- excepcional necesita revisión posterior (la de un administrador no: él es el revisor).
  nivel text not null check (nivel in ('administrador', 'jefe_patio', 'vigilante')),
  telefono text,
  activo boolean not null default true,   -- regla 5: se inactiva, nunca se elimina
  creado_en timestamptz not null default now()
);
create index personal_operativo_activo_idx on public.personal_operativo (activo, nombre);

-- El PIN vive en tabla aparte, no como columna de `personal_operativo`. Motivo: RLS es por fila,
-- no por columna, y todo el personal necesita leer la lista de nombres para el selector de
-- "quién abre el turno". Si el hash viviera en la misma tabla, cualquiera con SELECT lo leería
-- (mismo problema que `productos.costo` en 0033/0034, pero ahí se resolvió con una vista porque
-- la columna ya existía). Acá se evita de raíz: esta tabla NO tiene ninguna policy de select, así
-- que solo la alcanzan las funciones `security definer` de Capa 2.
create table public.personal_operativo_pin (
  persona_id uuid primary key references public.personal_operativo(id),
  pin_hash text not null,
  intentos_fallidos integer not null default 0,
  bloqueado_hasta timestamptz,
  actualizado_en timestamptz not null default now()
);

alter table public.personal_operativo enable row level security;
alter table public.personal_operativo_pin enable row level security;

-- Todo el personal autenticado lee el roster (lo necesita el selector de responsable de turno);
-- solo admin lo modifica. Sin policy de delete — regla 13, igual que el resto del schema.
create policy personal_select on public.personal_operativo
  for select to authenticated using (interno.es_activo());
create policy personal_admin_insert on public.personal_operativo
  for insert to authenticated with check (interno.es_admin() and interno.es_activo());
create policy personal_admin_update on public.personal_operativo
  for update to authenticated using (interno.es_admin() and interno.es_activo())
  with check (interno.es_admin() and interno.es_activo());
grant select, insert, update on public.personal_operativo to authenticated;

-- `personal_operativo_pin` se queda SIN policies y SIN grants: RLS activo y cero políticas =
-- nadie llega por PostgREST, ni admin. Solo las RPC de Capa 2 (security definer) la tocan.
revoke all on public.personal_operativo_pin from anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- Roster inicial
-- ─────────────────────────────────────────────────────────────────────────────────────────────

insert into public.personal_operativo (nombre, nivel) values
  ('Frank Roldán',      'administrador'),
  ('Laura Montealegre', 'administrador'),
  ('Julián Salinas',    'jefe_patio');

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- Columnas de identidad
-- ─────────────────────────────────────────────────────────────────────────────────────────────

alter table public.turnos_caja
  add column responsable_persona_id uuid references public.personal_operativo(id),
  add column responsable_actual_persona_id uuid references public.personal_operativo(id);

alter table public.ordenes
  add column jefe_zona_persona_id uuid references public.personal_operativo(id);
create index ordenes_jefe_zona_persona_idx on public.ordenes (jefe_zona_persona_id)
  where liquidacion_jefe_zona_id is null;

alter table public.liquidaciones_jefe_zona
  add column persona_id uuid references public.personal_operativo(id);

alter table public.traspasos_turno
  add column de_persona_id uuid references public.personal_operativo(id),
  add column a_persona_id uuid references public.personal_operativo(id);

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- Resolución de las grafías históricas
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- `translate` en vez de la extensión `unaccent` para no depender de una extensión por una sola
-- tilde ("Julián salinas"). Devuelve NULL si el texto no cae en ninguna de las tres personas —
-- el backfill deja esas filas sin persona en vez de adivinar, y la verificación de abajo las
-- saca a la luz.

create function interno.persona_por_texto(p_texto text)
returns uuid
language plpgsql stable
set search_path = public
as $$
declare
  t text := translate(lower(trim(coalesce(p_texto, ''))), 'áéíóúü', 'aeiouu');
  v_nombre text;
begin
  if t = '' then return null; end if;
  v_nombre := case
    when t like '%julian%' or t like '%uulian%' then 'Julián Salinas'
    when t like '%frank%'  or t like '%angel%'  then 'Frank Roldán'
    when t like '%laura%'                       then 'Laura Montealegre'
    else null
  end;
  if v_nombre is null then return null; end if;
  return (select id from public.personal_operativo where nombre = v_nombre);
end;
$$;

revoke execute on function interno.persona_por_texto(text) from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- Backfill
-- ─────────────────────────────────────────────────────────────────────────────────────────────

update public.turnos_caja set
  responsable_persona_id        = interno.persona_por_texto(responsable),
  responsable_actual_persona_id = interno.persona_por_texto(responsable_actual);

update public.ordenes set
  jefe_zona_persona_id = interno.persona_por_texto(jefe_zona_responsable)
where jefe_zona_responsable is not null;

update public.traspasos_turno set
  de_persona_id = interno.persona_por_texto(de),
  a_persona_id  = interno.persona_por_texto(a);

update public.liquidaciones_jefe_zona set
  persona_id = interno.persona_por_texto(responsable);

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- Verificación — aborta la migración si alguna orden con comisión quedó sin persona
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- Preferible fallar acá y revisar el mapeo, que aplicar en silencio y descubrir después que hay
-- comisión que no le quedó atribuida a nadie y por lo tanto nunca se va a liquidar.

do $$
declare
  v_huerfanas integer;
  v_texto text;
begin
  select count(*), string_agg(distinct jefe_zona_responsable, ', ')
    into v_huerfanas, v_texto
  from public.ordenes
  where jefe_zona_responsable is not null
    and jefe_zona_persona_id is null
    and estado <> 'anulada';

  if v_huerfanas > 0 then
    raise exception 'Backfill incompleto: % orden(es) con responsable sin mapear a una persona (%). Agrega la regla en interno.persona_por_texto antes de aplicar.',
      v_huerfanas, v_texto;
  end if;
end;
$$;
