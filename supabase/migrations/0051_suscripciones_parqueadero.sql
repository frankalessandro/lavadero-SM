-- Suscriptores de parqueadero — modalidades `mensualidad` y `fijo` (regla de negocio 6).
--
-- Hoy esas dos modalidades solo existen como etiqueta: se pueden elegir en la entrada pero nada
-- las administra. Un vehículo de mensualidad sale con `cobro = 0` para siempre (correcto: no se
-- cobra por movimiento, regla 6) pero no hay registro de quién es el titular ni hasta cuándo
-- está al día. Esto agrega ese registro.
--
-- NO incluye la "multa" de la regla 7 (salida fuera de la ventana 7–8am): su monto/fórmula sigue
-- pendiente de confirmación con el negocio. `fueraDeVentanaSalida` (cliente) ya marca la alerta.
--
-- El `valor` (lo que paga el titular por el periodo) NO es un dato sensible de los que §Roles le
-- oculta al vigilante (costos, márgenes, comisiones) — es una tarifa de parqueadero. El vigilante
-- lee la tabla para saber, en la portería, si la placa está al día.

create table public.suscripciones_parqueadero (
  id uuid primary key default gen_random_uuid(),
  placa text not null,
  titular text not null,
  telefono text,
  modalidad text not null check (modalidad in ('mensualidad', 'fijo')),
  valor integer not null default 0,
  fecha_inicio date not null,
  fecha_fin date not null,
  activo boolean not null default true,   -- se inactiva, no se borra (mismo criterio que el resto)
  nota text,
  creado_por text,
  creado_en timestamptz not null default now(),
  check (fecha_fin >= fecha_inicio)
);
create index suscripciones_parqueadero_placa_idx on public.suscripciones_parqueadero (upper(placa));
create index suscripciones_parqueadero_vigencia_idx on public.suscripciones_parqueadero (fecha_fin) where activo;

alter table public.suscripciones_parqueadero enable row level security;

create policy suscripciones_admin_select on public.suscripciones_parqueadero
  for select to authenticated using (interno.es_admin() and interno.es_activo());
create policy suscripciones_admin_insert on public.suscripciones_parqueadero
  for insert to authenticated with check (interno.es_admin() and interno.es_activo());
create policy suscripciones_admin_update on public.suscripciones_parqueadero
  for update to authenticated using (interno.es_admin() and interno.es_activo())
  with check (interno.es_admin() and interno.es_activo());
create policy suscripciones_vigilante_select on public.suscripciones_parqueadero
  for select to authenticated using (interno.rol_actual() = 'vigilante' and interno.es_activo());
grant select, insert, update on public.suscripciones_parqueadero to authenticated;
