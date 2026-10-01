-- 0078 — Otros ingresos: plata que entra al negocio y no viene del lavado, la nevera ni el
-- parqueadero (hoy el alquiler del carro de comidas; mañana patrocinios, publicidad, etc.).
--
-- Por qué una tabla propia y no un gasto negativo ni una mensualidad de parqueadero:
--  · `gastos` es lo que sale; mezclar ingresos ahí falsea los totales por categoría, las
--    tendencias y el punto de equilibrio.
--  · Una mensualidad de parqueadero es un vehículo con placa, clase y tarifa; un carro de comidas
--    no encaja y distorsionaría la rotación y el arqueo del vigilante.
--
-- Es gestión de gerencia: solo admin lee y escribe, y NO entra a ningún arqueo de caja (el pago
-- llega a gerencia, no al turno del jefe de patio ni del vigilante). `metodo_pago` es informativo.
-- Regla 13: nada se borra, se anula con motivo y queda visible. La escritura va solo por RPC.

create table public.categorias_ingreso (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  activo boolean not null default true,
  creado_en timestamptz not null default now()
);
create unique index categorias_ingreso_nombre_idx on public.categorias_ingreso (lower(nombre));

create table public.ingresos_otros (
  id uuid primary key default gen_random_uuid(),
  consecutivo integer generated always as identity,
  fecha date not null default current_date,
  categoria_id uuid not null references public.categorias_ingreso(id),
  descripcion text not null,
  monto integer not null check (monto > 0),
  metodo_pago text not null check (metodo_pago in ('efectivo', 'transferencia', 'datafono')),
  registrado_por text not null,
  estado text not null default 'activa' check (estado in ('activa', 'anulada')),
  motivo_anulacion text,
  anulada_por text,
  anulada_en timestamptz,
  creado_en timestamptz not null default now()
);
create index ingresos_otros_fecha_idx on public.ingresos_otros (fecha desc);
create index ingresos_otros_categoria_idx on public.ingresos_otros (categoria_id);

insert into public.categorias_ingreso (nombre) values ('Alquiler carro de comidas');

-- ── RLS: solo gerencia ───────────────────────────────────────────────────────────────────────
alter table public.categorias_ingreso enable row level security;
create policy categorias_ingreso_admin_select on public.categorias_ingreso
  for select to authenticated using (interno.es_admin() and interno.es_activo());
create policy categorias_ingreso_admin_insert on public.categorias_ingreso
  for insert to authenticated with check (interno.es_admin() and interno.es_activo());
create policy categorias_ingreso_admin_update on public.categorias_ingreso
  for update to authenticated
  using (interno.es_admin() and interno.es_activo())
  with check (interno.es_admin() and interno.es_activo());
grant select, insert, update on public.categorias_ingreso to authenticated;

alter table public.ingresos_otros enable row level security;
create policy ingresos_otros_admin_select on public.ingresos_otros
  for select to authenticated using (interno.es_admin() and interno.es_activo());
grant select on public.ingresos_otros to authenticated;

-- ── Registrar ────────────────────────────────────────────────────────────────────────────────
-- Quién registra lo fija el servidor (cuenta autenticada), no se teclea: misma idea que 0072.
create function public.registrar_ingreso_otro(
  p_fecha date,
  p_categoria_id uuid,
  p_descripcion text,
  p_monto integer,
  p_metodo_pago text
) returns setof public.ingresos_otros
language plpgsql security definer set search_path = public
as $$
declare
  v_ingreso public.ingresos_otros;
  v_descripcion text := nullif(trim(p_descripcion), '');
  v_actor jsonb := interno.actor();
  v_por text := coalesce(nullif(v_actor ->> 'persona_nombre', ''), nullif(v_actor ->> 'usuario_nombre', ''));
begin
  if not interno.es_activo() or interno.rol_actual() <> 'admin' then
    raise exception 'No autorizado';
  end if;
  if v_descripcion is null then raise exception 'La descripción es obligatoria'; end if;
  if p_monto is null or p_monto <= 0 then raise exception 'El monto debe ser mayor a 0'; end if;
  if p_metodo_pago not in ('efectivo', 'transferencia', 'datafono') then
    raise exception 'Método de pago inválido';
  end if;
  if v_por is null then raise exception 'No se pudo identificar a quien registra'; end if;
  if not exists (select 1 from public.categorias_ingreso where id = p_categoria_id and activo) then
    raise exception 'La categoría no existe o está inactiva';
  end if;

  insert into public.ingresos_otros (fecha, categoria_id, descripcion, monto, metodo_pago, registrado_por)
  values (coalesce(p_fecha, current_date), p_categoria_id, v_descripcion, p_monto, p_metodo_pago, v_por)
  returning * into v_ingreso;

  return next v_ingreso;
end;
$$;

revoke execute on function public.registrar_ingreso_otro(date, uuid, text, integer, text) from public, anon;
grant execute on function public.registrar_ingreso_otro(date, uuid, text, integer, text) to authenticated;

-- ── Anular ───────────────────────────────────────────────────────────────────────────────────
create function public.anular_ingreso_otro(p_ingreso_id uuid, p_motivo text)
returns setof public.ingresos_otros
language plpgsql security definer set search_path = public
as $$
declare
  v_ingreso public.ingresos_otros;
  v_motivo text := nullif(trim(p_motivo), '');
  v_actor jsonb := interno.actor();
  v_por text := coalesce(nullif(v_actor ->> 'persona_nombre', ''), nullif(v_actor ->> 'usuario_nombre', ''));
begin
  if not interno.es_activo() or interno.rol_actual() <> 'admin' then
    raise exception 'No autorizado';
  end if;
  if v_motivo is null or length(v_motivo) < 3 then
    raise exception 'El motivo de anulación es obligatorio (mínimo 3 caracteres)';
  end if;
  if v_por is null then raise exception 'No se pudo identificar a quien anula'; end if;

  select * into v_ingreso from public.ingresos_otros where id = p_ingreso_id for update;
  if not found then raise exception 'El ingreso no existe'; end if;
  if v_ingreso.estado = 'anulada' then raise exception 'Este ingreso ya está anulado'; end if;

  update public.ingresos_otros set
    estado = 'anulada', motivo_anulacion = v_motivo, anulada_por = v_por, anulada_en = now()
  where id = p_ingreso_id
  returning * into v_ingreso;

  return next v_ingreso;
end;
$$;

revoke execute on function public.anular_ingreso_otro(uuid, text) from public, anon;
grant execute on function public.anular_ingreso_otro(uuid, text) to authenticated;

-- ── Bitácora (0044): creación y anulación, mismo patrón que compras ──────────────────────────
create trigger bitacora_ingresos_otros_insert after insert on public.ingresos_otros
  for each row execute function interno.bitacora_trigger('crear');
create trigger bitacora_ingresos_otros_update after update on public.ingresos_otros
  for each row execute function interno.bitacora_trigger('editar', 'estado', 'motivo_anulacion', 'anulada_por');

create trigger bitacora_categorias_ingreso_insert after insert on public.categorias_ingreso
  for each row execute function interno.bitacora_trigger('crear');
create trigger bitacora_categorias_ingreso_update after update on public.categorias_ingreso
  for each row execute function interno.bitacora_trigger('editar', 'nombre', 'activo');
