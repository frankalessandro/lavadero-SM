-- Conteo de inventario en la apertura y el cierre del turno de jefe de zona.
--
-- Hoy el cierre de turno solo cuadra la CAJA (arqueo ciego de efectivo). Si desaparece una
-- gaseosa, la caja cuadra igual y nadie se entera hasta un inventario general. Esto agrega un
-- cuadre de PRODUCTO en paralelo, con la misma lógica de conteo ciego → revelar → justificar.
--
-- Decisiones (confirmadas con Alessandro):
--  · Alcance: solo productos vendibles — `precio_venta is not null` y `activo` (nevera y vitrina;
--    cuando llegue el mecato entra solo). Los insumos de lavado NO se cuentan acá: su "faltante"
--    es consumo normal de operación, no robo.
--  · Solo el turno de jefe de zona. El vigilante no vende nevera (`registrar_venta` exige turno
--    jefe_zona abierto), así que su cierre no lleva conteo.
--  · DOS conteos por turno: apertura y cierre. La apertura debe cuadrar contra el cierre de la
--    noche anterior — así los "vacíos entre turnos" se cazan al abrir, no al final del mes.
--  · Faltante valorado a COSTO (`interno.costo_promedio_producto`), no a precio de venta.
--  · Quién responde por el faltante: por defecto el responsable del turno, editable a un lavador.
--  · El faltante NO se cobra en el momento — queda registrado con su monto y su responsable,
--    estado 'pendiente'. Cómo se salda (descuento de nómina, efectivo, se perdona) es otro
--    feature ("luego miramos cómo").
--  · Se puede cerrar el turno con CUENTAS ABIERTAS pendientes — igual que hoy se cierra la caja
--    con lavados por cobrar. El esperado del cierre resta las unidades que están en cuentas/
--    órdenes sin cobrar (ya salieron de la nevera pero el stock no las descontó todavía).
--  · La diferencia no bloquea el cierre, pero la UI obliga a recontar antes de registrarla; la
--    justificación es obligatoria si hay cualquier diferencia (mismo criterio que el arqueo de
--    caja, regla 15).

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- Tablas
-- ─────────────────────────────────────────────────────────────────────────────────────────────

create table public.conteos_inventario (
  id uuid primary key default gen_random_uuid(),
  turno_id uuid not null references public.turnos_caja(id),
  momento text not null check (momento in ('apertura', 'cierre')),
  contado_por text not null,
  contado_por_persona_id uuid references public.personal_operativo(id),
  justificacion text,
  creado_en timestamptz not null default now(),
  unique (turno_id, momento)
);
create index conteos_inventario_turno_idx on public.conteos_inventario (turno_id);
create index conteos_inventario_momento_idx on public.conteos_inventario (momento, creado_en desc);

create table public.conteos_inventario_lineas (
  id uuid primary key default gen_random_uuid(),
  conteo_id uuid not null references public.conteos_inventario(id) on delete cascade,
  producto_id uuid not null references public.productos(id),
  -- Lo que "debería haber" para la narrativa del cuadre:
  --  · apertura → el `contado` del cierre anterior (o el stock del sistema si es el primero).
  --  · cierre   → stock del sistema − unidades en cuentas/órdenes abiertas.
  esperado integer not null,
  contado integer not null check (contado >= 0),
  -- Unidades del producto en ventas 'pendiente' (cuentas/órdenes abiertas). Informativo: esas ya
  -- salieron físicamente pero el stock no las descontó, no son faltante.
  en_cuentas_pendientes integer not null default 0,
  diferencia integer not null,               -- contado − esperado (negativo = falta)
  -- abs(diferencia) × costo promedio, solo para faltantes de cierre. En apertura queda en 0
  -- (la apertura reconcilia, no genera deuda).
  valor_diferencia integer not null default 0,
  responde_persona_id uuid references public.personal_operativo(id),
  motivo text,
  ajuste_movimiento_id uuid references public.movimientos_inventario(id),
  estado_faltante text not null default 'ninguno'
    check (estado_faltante in ('ninguno', 'pendiente', 'resuelto')),
  unique (conteo_id, producto_id)
);
create index conteos_lineas_conteo_idx on public.conteos_inventario_lineas (conteo_id);
create index conteos_lineas_faltante_idx on public.conteos_inventario_lineas (estado_faltante, responde_persona_id)
  where estado_faltante = 'pendiente';

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- RLS
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- `conteos_inventario` (cabecera, sin datos sensibles): admin + jefe_zona leen — el jefe de zona
-- necesita saber si ya hizo el conteo de apertura de su turno.
-- `conteos_inventario_lineas`: SOLO admin. Lleva `valor_diferencia` (a costo), y el costo es
-- sensible (CLAUDE.md §Roles). El jefe de zona ve el detalle por unidad en el flujo de conteo a
-- través de las RPC (que no le devuelven pesos); el valor en $ vive en el reporte de admin.

alter table public.conteos_inventario enable row level security;
alter table public.conteos_inventario_lineas enable row level security;

create policy conteos_admin_select on public.conteos_inventario
  for select to authenticated using (interno.es_admin() and interno.es_activo());
create policy conteos_jefe_zona_select on public.conteos_inventario
  for select to authenticated using (interno.rol_actual() = 'jefe_zona' and interno.es_activo());
grant select on public.conteos_inventario to authenticated;

create policy conteos_lineas_admin_select on public.conteos_inventario_lineas
  for select to authenticated using (interno.es_admin() and interno.es_activo());
grant select on public.conteos_inventario_lineas to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- Helper: qué debería haber de cada producto vendible
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- `security definer` porque suma `movimientos_inventario` (tabla base, admin-only) — el jefe de
-- zona solo la lee por la vista operativa. `interno.` para que no quede expuesta como endpoint.
-- NO devuelve costo: eso es sensible y el jefe de zona llama esto.

create function interno.esperado_inventario(p_turno_id uuid, p_momento text)
returns table (
  producto_id uuid,
  nombre text,
  unidad_medida text,
  esperado integer,
  stock_sistema integer,
  en_cuentas_pendientes integer
)
language sql stable security definer set search_path = public
as $$
  select
    pr.id,
    pr.nombre,
    pr.unidad_medida,
    case
      when p_momento = 'cierre' then
        coalesce((select sum(m.cantidad)::int from movimientos_inventario m where m.producto_id = pr.id), 0)
        - coalesce((select sum(v.cantidad)::int from ventas v where v.producto_id = pr.id and v.estado = 'pendiente'), 0)
      else  -- apertura
        coalesce(
          (
            select cil.contado
            from conteos_inventario ci
            join conteos_inventario_lineas cil on cil.conteo_id = ci.id
            join turnos_caja t on t.id = ci.turno_id
            where ci.momento = 'cierre'
              and t.rol = 'jefe_zona'
              and ci.turno_id <> p_turno_id
              and cil.producto_id = pr.id
            order by ci.creado_en desc
            limit 1
          ),
          coalesce((select sum(m.cantidad)::int from movimientos_inventario m where m.producto_id = pr.id), 0)
        )
    end as esperado,
    coalesce((select sum(m.cantidad)::int from movimientos_inventario m where m.producto_id = pr.id), 0) as stock_sistema,
    coalesce((select sum(v.cantidad)::int from ventas v where v.producto_id = pr.id and v.estado = 'pendiente'), 0) as en_cuentas_pendientes
  from productos pr
  where pr.activo and pr.precio_venta is not null
  order by pr.nombre;
$$;

revoke execute on function interno.esperado_inventario(uuid, text) from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- preview_conteo_inventario — lo que la UI muestra al revelar, después del conteo ciego
-- ─────────────────────────────────────────────────────────────────────────────────────────────

create function public.preview_conteo_inventario(p_turno_id uuid, p_momento text)
returns table (
  producto_id uuid,
  nombre text,
  unidad_medida text,
  esperado integer,
  en_cuentas_pendientes integer
)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not interno.es_activo() or interno.rol_actual() not in ('jefe_zona', 'admin') then
    raise exception 'No autorizado';
  end if;
  if p_momento not in ('apertura', 'cierre') then
    raise exception 'Momento inválido: %', p_momento;
  end if;
  return query
    select e.producto_id, e.nombre, e.unidad_medida, e.esperado, e.en_cuentas_pendientes
    from interno.esperado_inventario(p_turno_id, p_momento) e;
end;
$$;

revoke execute on function public.preview_conteo_inventario(uuid, text) from public, anon;
grant execute on function public.preview_conteo_inventario(uuid, text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- abrir_conteo_inventario — conteo de apertura
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- La apertura RECONCILIA: el ajuste lleva el stock del sistema al conteo físico
-- (`contado − stock_sistema`), no a `contado − esperado`. Si algo se movió entre turnos fuera de
-- un conteo, `esperado` (= cierre anterior) y `stock_sistema` difieren y el ajuste tiene que
-- apuntar a la realidad física, no a la narrativa. No genera faltante 'pendiente': la deuda se
-- crea en el cierre, contra quien estuvo de turno.

create function public.abrir_conteo_inventario(
  p_turno_id uuid,
  p_lineas jsonb,       -- [{ "producto_id": uuid, "contado": int }]
  p_justificacion text
)
returns setof public.conteos_inventario
language plpgsql security definer set search_path = public
as $$
declare
  v_turno turnos_caja;
  v_conteo conteos_inventario;
  v_justif text := nullif(trim(p_justificacion), '');
  v_prod record;
  v_contado integer;
  v_diff integer;
  v_ajuste integer;
  v_mov_id uuid;
  v_hay_diferencia boolean := false;
begin
  if not interno.es_activo() or interno.rol_actual() not in ('jefe_zona', 'admin') then
    raise exception 'No autorizado para registrar el conteo de inventario';
  end if;
  if p_lineas is null or jsonb_typeof(p_lineas) <> 'array' then
    raise exception 'Se requiere el conteo de cada producto';
  end if;

  select * into v_turno from turnos_caja where id = p_turno_id for update;
  if not found then raise exception 'El turno no existe'; end if;
  if v_turno.rol <> 'jefe_zona' then raise exception 'El conteo de inventario es solo del turno de jefe de zona'; end if;
  if v_turno.cerrado then raise exception 'El turno ya está cerrado'; end if;
  if exists (select 1 from conteos_inventario where turno_id = p_turno_id and momento = 'apertura') then
    raise exception 'Este turno ya tiene conteo de apertura';
  end if;

  -- Primera pasada: ¿hay alguna diferencia? (para exigir justificación antes de escribir nada)
  for v_prod in select * from interno.esperado_inventario(p_turno_id, 'apertura')
  loop
    v_contado := (
      select (l->>'contado')::int
      from jsonb_array_elements(p_lineas) l
      where (l->>'producto_id')::uuid = v_prod.producto_id
    );
    if v_contado is null then
      raise exception 'Falta contar: %', v_prod.nombre;
    end if;
    if v_contado <> v_prod.esperado then v_hay_diferencia := true; end if;
  end loop;

  if v_hay_diferencia and v_justif is null then
    raise exception 'Hay diferencias en el conteo — la justificación es obligatoria';
  end if;

  insert into conteos_inventario (turno_id, momento, contado_por, contado_por_persona_id, justificacion)
  values (p_turno_id, 'apertura', v_turno.responsable_actual, v_turno.responsable_actual_persona_id, v_justif)
  returning * into v_conteo;

  for v_prod in select * from interno.esperado_inventario(p_turno_id, 'apertura')
  loop
    v_contado := (
      select (l->>'contado')::int
      from jsonb_array_elements(p_lineas) l
      where (l->>'producto_id')::uuid = v_prod.producto_id
    );
    v_diff := v_contado - v_prod.esperado;
    v_ajuste := v_contado - v_prod.stock_sistema;  -- lleva el sistema a la realidad física
    v_mov_id := null;

    if v_ajuste <> 0 then
      insert into movimientos_inventario (producto_id, tipo, cantidad, motivo, responsable)
      values (
        v_prod.producto_id, 'ajuste', v_ajuste,
        'Conteo de apertura' || coalesce(' — ' || v_justif, ''),
        v_turno.responsable_actual
      )
      returning id into v_mov_id;
    end if;

    insert into conteos_inventario_lineas (
      conteo_id, producto_id, esperado, contado, en_cuentas_pendientes,
      diferencia, valor_diferencia, ajuste_movimiento_id, estado_faltante
    ) values (
      v_conteo.id, v_prod.producto_id, v_prod.esperado, v_contado, v_prod.en_cuentas_pendientes,
      v_diff, 0, v_mov_id, 'ninguno'
    );
  end loop;

  return next v_conteo;
end;
$$;

revoke execute on function public.abrir_conteo_inventario(uuid, jsonb, text) from public, anon;
grant execute on function public.abrir_conteo_inventario(uuid, jsonb, text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- cerrar_conteo_inventario — conteo de cierre
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- Esperado = stock del sistema − unidades en cuentas/órdenes abiertas. El ajuste es
-- `contado − esperado`: deja el sistema en `contado + pendientes` (físico + lo que está en
-- cuentas por cobrar). Un faltante (diferencia < 0) genera una línea 'pendiente' valorada a
-- costo, contra `p_responde` o, si no viene, el responsable del turno.

create function public.cerrar_conteo_inventario(
  p_turno_id uuid,
  p_lineas jsonb,       -- [{ "producto_id": uuid, "contado": int, "responde_persona_id"?: uuid, "motivo"?: text }]
  p_justificacion text
)
returns setof public.conteos_inventario
language plpgsql security definer set search_path = public
as $$
declare
  v_turno turnos_caja;
  v_conteo conteos_inventario;
  v_justif text := nullif(trim(p_justificacion), '');
  v_prod record;
  v_linea jsonb;
  v_contado integer;
  v_diff integer;
  v_mov_id uuid;
  v_costo integer;
  v_valor integer;
  v_responde uuid;
  v_motivo text;
  v_estado text;
  v_hay_diferencia boolean := false;
begin
  if not interno.es_activo() or interno.rol_actual() not in ('jefe_zona', 'admin') then
    raise exception 'No autorizado para registrar el conteo de inventario';
  end if;
  if p_lineas is null or jsonb_typeof(p_lineas) <> 'array' then
    raise exception 'Se requiere el conteo de cada producto';
  end if;

  select * into v_turno from turnos_caja where id = p_turno_id for update;
  if not found then raise exception 'El turno no existe'; end if;
  if v_turno.rol <> 'jefe_zona' then raise exception 'El conteo de inventario es solo del turno de jefe de zona'; end if;
  if v_turno.cerrado then raise exception 'El turno ya está cerrado'; end if;
  if not exists (select 1 from conteos_inventario where turno_id = p_turno_id and momento = 'apertura') then
    raise exception 'Primero registra el conteo de apertura de este turno';
  end if;
  if exists (select 1 from conteos_inventario where turno_id = p_turno_id and momento = 'cierre') then
    raise exception 'Este turno ya tiene conteo de cierre';
  end if;

  for v_prod in select * from interno.esperado_inventario(p_turno_id, 'cierre')
  loop
    v_contado := (
      select (l->>'contado')::int
      from jsonb_array_elements(p_lineas) l
      where (l->>'producto_id')::uuid = v_prod.producto_id
    );
    if v_contado is null then
      raise exception 'Falta contar: %', v_prod.nombre;
    end if;
    if v_contado <> v_prod.esperado then v_hay_diferencia := true; end if;
  end loop;

  if v_hay_diferencia and v_justif is null then
    raise exception 'Hay diferencias en el conteo — la justificación es obligatoria';
  end if;

  insert into conteos_inventario (turno_id, momento, contado_por, contado_por_persona_id, justificacion)
  values (p_turno_id, 'cierre', v_turno.responsable_actual, v_turno.responsable_actual_persona_id, v_justif)
  returning * into v_conteo;

  for v_prod in select * from interno.esperado_inventario(p_turno_id, 'cierre')
  loop
    v_linea := (
      select l from jsonb_array_elements(p_lineas) l
      where (l->>'producto_id')::uuid = v_prod.producto_id
    );
    v_contado := (v_linea->>'contado')::int;
    v_diff := v_contado - v_prod.esperado;
    v_mov_id := null;
    v_valor := 0;
    v_responde := null;
    v_estado := 'ninguno';
    v_motivo := nullif(trim(v_linea->>'motivo'), '');

    if v_diff <> 0 then
      insert into movimientos_inventario (producto_id, tipo, cantidad, motivo, responsable)
      values (
        v_prod.producto_id, 'ajuste', v_diff,
        'Conteo de cierre' || coalesce(' — ' || coalesce(v_motivo, v_justif), ''),
        v_turno.responsable_actual
      )
      returning id into v_mov_id;
    end if;

    if v_diff < 0 then
      v_costo := coalesce(interno.costo_promedio_producto(v_prod.producto_id), 0);
      v_valor := abs(v_diff) * v_costo;
      v_responde := coalesce(
        nullif(v_linea->>'responde_persona_id', '')::uuid,
        v_turno.responsable_actual_persona_id
      );
      v_estado := 'pendiente';
    end if;

    insert into conteos_inventario_lineas (
      conteo_id, producto_id, esperado, contado, en_cuentas_pendientes,
      diferencia, valor_diferencia, responde_persona_id, motivo, ajuste_movimiento_id, estado_faltante
    ) values (
      v_conteo.id, v_prod.producto_id, v_prod.esperado, v_contado, v_prod.en_cuentas_pendientes,
      v_diff, v_valor, v_responde, v_motivo, v_mov_id, v_estado
    );
  end loop;

  return next v_conteo;
end;
$$;

revoke execute on function public.cerrar_conteo_inventario(uuid, jsonb, text) from public, anon;
grant execute on function public.cerrar_conteo_inventario(uuid, jsonb, text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- El cierre del turno de jefe de zona exige el conteo de cierre
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- Solo si el turno YA tiene conteo de apertura: los turnos abiertos antes de esta migración
-- (sin apertura) siguen cerrándose sin bloqueo. Todo turno nuevo hace la apertura desde la UI,
-- así que queda cubierto. Trigger aparte del de inmutabilidad de 0045 (una responsabilidad
-- por trigger).

create function interno.jefe_zona_cierre_requiere_conteo()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.cerrado and not old.cerrado and new.rol = 'jefe_zona'
     and exists (select 1 from conteos_inventario where turno_id = new.id and momento = 'apertura')
     and not exists (select 1 from conteos_inventario where turno_id = new.id and momento = 'cierre')
  then
    raise exception 'Antes de cerrar el turno hay que registrar el conteo de inventario de cierre';
  end if;
  return new;
end;
$$;

create trigger turnos_caja_cierre_requiere_conteo
  before update on public.turnos_caja
  for each row execute function interno.jefe_zona_cierre_requiere_conteo();

-- Nota de advisor: `preview_conteo_inventario`, `abrir_conteo_inventario` y
-- `cerrar_conteo_inventario` salen como WARN "Signed-In Users Can Execute SECURITY DEFINER
-- Function" — intencional, mismo criterio que 0032/0035/0036/0041/0045: necesitan definir para
-- sumar `movimientos_inventario` (admin-only) y escribir el ajuste; el candado es el chequeo de
-- rol y de estado al entrar.
