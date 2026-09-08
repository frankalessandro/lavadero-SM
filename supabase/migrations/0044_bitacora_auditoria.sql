-- Bitácora de auditoría — el requisito antifraude que faltaba entero.
--
-- El Plan de Alcance lo pide como no negociable: "Bitácora de auditoría (usuario, fecha, hora) en
-- toda creación, anulación, cambio de precio, ajuste de inventario". Hasta acá lo que había era
-- parcial y disperso: columnas inline en `ordenes` (solo anulación), el log de `traspasos_turno`
-- (solo traspasos), y campos de texto tecleados a mano. No existía registro de quién creó una
-- orden, quién cambió un precio, quién movió la comisión en Configuración ni quién ajustó stock.
--
-- Dos decisiones de fondo:
--
-- 1. SE ESCRIBE POR TRIGGER, NO DESDE EL CLIENTE. Un log que el frontend tiene que acordarse de
--    llamar es un log con huecos: basta una ruta nueva que olvide la llamada, o una escritura por
--    PostgREST directo, para que el evento no quede. Por trigger queda registrado venga de donde
--    venga — UI, RPC `security definer` o un PATCH crudo. Es también lo que hace que P2 (mover los
--    UPDATE planos a RPC) no tenga que instrumentar función por función.
--
-- 2. SE REGISTRAN DOS IDENTIDADES, PORQUE NINGUNA SOLA ALCANZA. `usuario_id` (auth.uid()) dice con
--    qué CUENTA se hizo — pero hay una sola cuenta por rol, compartida, así que identifica el rol y
--    el dispositivo, no a la persona. `persona_id` (0043) dice QUIÉN estaba a cargo del turno en
--    ese momento. Juntas responden "quién lo hizo"; por separado ninguna de las dos.
--
-- La tabla es append-only de verdad: RLS activo, policy de SELECT solo para admin, y CERO policies
-- de insert/update/delete. Ni siquiera admin puede escribirla o corregirla desde PostgREST — la
-- única vía de escritura es el trigger, que es `security definer`.

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- Tabla
-- ─────────────────────────────────────────────────────────────────────────────────────────────

create table public.bitacora (
  id bigint generated always as identity primary key,
  ocurrido_en timestamptz not null default now(),

  -- Cuenta con la que se ejecutó (una por rol, compartida).
  usuario_id uuid,
  usuario_nombre text,
  usuario_rol text,

  -- Persona real a cargo del turno en ese momento. Null cuando no aplica: acciones de admin (no
  -- abre turno) o escrituras sin turno abierto.
  persona_id uuid references public.personal_operativo(id),
  persona_nombre text,

  entidad text not null,        -- nombre de la tabla
  entidad_id text,              -- pk como texto (todas las tablas instrumentadas usan `id` simple)
  accion text not null,         -- crear | anular | editar | cambiar_precio | ajustar_inventario | cambiar_configuracion
  antes jsonb,                  -- solo las columnas que cambiaron
  despues jsonb                 -- fila completa en un insert; solo lo que cambió en un update
);

create index bitacora_ocurrido_idx on public.bitacora (ocurrido_en desc);
create index bitacora_entidad_idx on public.bitacora (entidad, entidad_id);
create index bitacora_accion_idx on public.bitacora (accion, ocurrido_en desc);
create index bitacora_persona_idx on public.bitacora (persona_id, ocurrido_en desc);

alter table public.bitacora enable row level security;

create policy bitacora_admin_select on public.bitacora
  for select to authenticated using (interno.es_admin() and interno.es_activo());
grant select on public.bitacora to authenticated;
-- Sin grant de insert/update/delete a nadie: append-only, solo el trigger definer escribe.

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- Quién está actuando
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- `auth.uid()` sigue disponible dentro de una función `security definer`: definer cambia el rol de
-- ejecución en Postgres, no el claim del JWT que Supabase inyecta en la sesión. Por eso las RPC de
-- 0032/0035/0036/0037/0041 quedan igual de auditadas que un UPDATE directo.
--
-- La persona se resuelve por el turno abierto del rol de quien actúa. Para admin da null a
-- propósito: un administrador no abre turno, su identidad ES la cuenta.

create function interno.actor()
returns jsonb
language sql stable security definer set search_path = public
as $$
  with u as (
    select p.id, p.nombre, p.rol from public.perfiles p where p.id = auth.uid()
  ),
  persona as (
    -- `interno.rol_actual()` y no `(select rol from u)`: es el helper canónico del proyecto
    -- (0011/0017) y además está shimeado en el sandbox local, donde no hay fila en `perfiles`.
    select po.id, po.nombre
    from public.turnos_caja t
    join public.personal_operativo po on po.id = t.responsable_actual_persona_id
    where not t.cerrado and t.rol = interno.rol_actual()
    limit 1
  )
  select jsonb_build_object(
    'usuario_id',     (select id from u),
    'usuario_nombre', (select nombre from u),
    'usuario_rol',    (select rol from u),
    'persona_id',     (select id from persona),
    'persona_nombre', (select nombre from persona)
  );
$$;

revoke execute on function interno.actor() from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- Trigger genérico
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- Uso:  execute function interno.bitacora_trigger('<accion_update>', 'col1', 'col2', ...)
--
--   · TG_ARGV[0]  = etiqueta de acción para los UPDATE de esta tabla.
--   · TG_ARGV[1:] = columnas vigiladas. Un UPDATE que no toque ninguna NO deja fila — así el log
--                   no se llena de ruido (`notificado_listo`, por ejemplo, no se vigila).
--
-- Un INSERT siempre es 'crear' y guarda la fila entera. Un UPDATE que lleva `estado` a 'anulada'
-- se reetiqueta 'anular' aunque la tabla tenga otra acción por defecto: la anulación es el evento
-- que el Plan nombra explícitamente y tiene que poder filtrarse solo.

create function interno.bitacora_trigger()
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
    -- La etiqueta de TG_ARGV[0] también manda en el INSERT, no solo en el UPDATE: los triggers de
    -- creación pasan 'crear', pero los de precio pasan 'cambiar_precio' (crear la fila de precio
    -- ES el cambio de precio — es lo que habilita esa combinación, regla 1) y el de inventario
    -- pasa 'ajustar_inventario'. Forzar 'crear' acá dejaba esas dos acciones sin registrar nunca
    -- bajo su propia etiqueta, y los filtros de /admin/operacion/auditoria no encontraban nada.
    v_accion := TG_ARGV[0];
    v_despues := v_new;
  else
    v_new := to_jsonb(NEW);
    v_old := to_jsonb(OLD);

    -- TG_ARGV es 0-based: el índice 0 es la etiqueta de acción y de 1 en adelante van las
    -- columnas vigiladas. Se recorre con índice entero en vez de un slice `TG_ARGV[1:...]` a
    -- propósito — el slice sobre un arreglo 0-based es fácil de leer mal y esto no admite
    -- sorpresas.
    for v_i in 1 .. (TG_NARGS - 1)
    loop
      v_col := TG_ARGV[v_i];
      if v_new -> v_col is distinct from v_old -> v_col then
        v_antes   := v_antes   || jsonb_build_object(v_col, v_old -> v_col);
        v_despues := v_despues || jsonb_build_object(v_col, v_new -> v_col);
        v_hubo_cambio := true;
      end if;
    end loop;

    -- Nada vigilado cambió: no se registra. En un trigger AFTER el valor de retorno se ignora.
    if not v_hubo_cambio then
      return null;
    end if;

    if v_new ->> 'estado' = 'anulada' and v_old ->> 'estado' is distinct from 'anulada' then
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

revoke execute on function interno.bitacora_trigger() from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 1) Creación
-- ─────────────────────────────────────────────────────────────────────────────────────────────

create trigger bitacora_ordenes_insert after insert on public.ordenes
  for each row execute function interno.bitacora_trigger('crear');
create trigger bitacora_ventas_insert after insert on public.ventas
  for each row execute function interno.bitacora_trigger('crear');
create trigger bitacora_estancias_insert after insert on public.estancias_parqueadero
  for each row execute function interno.bitacora_trigger('crear');
create trigger bitacora_cuentas_insert after insert on public.cuentas
  for each row execute function interno.bitacora_trigger('crear');

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 2) Anulación y edición del histórico
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- La lista de columnas de `ordenes` es deliberada: cubre el hueco de `editarInfoCliente` (que
-- cambia la PLACA de una orden con un UPDATE plano y sin traza) y todo lo que mueve plata —
-- precio, las tres comisiones, descuento, método de pago y la marca de liquidación. `estado` entra
-- para que se vea el ciclo en_proceso → listo → entregado y para detectar la anulación.
-- `notificado_listo` queda fuera a propósito: es un check operativo, no un hecho auditable.

create trigger bitacora_ordenes_update after update on public.ordenes
  for each row execute function interno.bitacora_trigger(
    'editar',
    'placa', 'cliente_nombre', 'cliente_telefono', 'cliente_correo',
    'tipo_vehiculo_id', 'combo_id', 'lavador_id', 'lavador_id_2',
    'estado', 'precio', 'descuento', 'descuento_motivo', 'descuento_autorizado_por',
    'comision_lavador', 'comision_jefe_zona', 'comision_negocio',
    'metodo_pago', 'turno_id', 'liquidacion_id', 'liquidacion_id_2', 'liquidacion_jefe_zona_id',
    'motivo_anulacion', 'anulada_por'
  );

create trigger bitacora_ventas_update after update on public.ventas
  for each row execute function interno.bitacora_trigger(
    'editar', 'estado', 'cantidad', 'precio_unitario', 'total', 'metodo_pago', 'turno_id',
    'motivo_anulacion', 'anulada_por'
  );

create trigger bitacora_cuentas_update after update on public.cuentas
  for each row execute function interno.bitacora_trigger('editar', 'estado', 'titular', 'turno_id');

-- El cobro del parqueadero se fija en la salida — es el movimiento de plata de ese módulo.
create trigger bitacora_estancias_update after update on public.estancias_parqueadero
  for each row execute function interno.bitacora_trigger(
    'editar', 'estado', 'placa', 'modalidad', 'cobro', 'metodo_pago', 'turno_id'
  );

-- Un turno cerrado es inmodificable (regla 14). Hoy el candado es de UI y de app; hasta que P2 lo
-- baje a la base, al menos queda registro de cualquier toque a las cifras del arqueo.
create trigger bitacora_turnos_update after update on public.turnos_caja
  for each row execute function interno.bitacora_trigger(
    'editar', 'cerrado', 'base_inicial', 'conteo_fisico', 'valor_esperado', 'diferencia',
    'justificacion_diferencia', 'responsable_actual', 'responsable_actual_persona_id'
  );

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 3) Cambio de precio
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- Los tres caminos de precio de lavado (combo compuesto, servicio suelto, combo de precio fijo)
-- más las tarifas de parqueadero y el precio/costo de los productos de nevera. Se registra el
-- INSERT además del UPDATE porque crear la fila de precio es lo que HABILITA esa combinación
-- (regla 1) — es un cambio de precio, no un dato de catálogo cualquiera.

create trigger bitacora_precios_combo_insert after insert on public.precios_servicios_combo
  for each row execute function interno.bitacora_trigger('cambiar_precio');
create trigger bitacora_precios_combo_update after update on public.precios_servicios_combo
  for each row execute function interno.bitacora_trigger('cambiar_precio', 'precio');

create trigger bitacora_precios_indiv_insert after insert on public.precios_servicios_individual
  for each row execute function interno.bitacora_trigger('cambiar_precio');
create trigger bitacora_precios_indiv_update after update on public.precios_servicios_individual
  for each row execute function interno.bitacora_trigger('cambiar_precio', 'precio');

create trigger bitacora_precios_fijo_insert after insert on public.precios_combo_fijo
  for each row execute function interno.bitacora_trigger('cambiar_precio');
create trigger bitacora_precios_fijo_update after update on public.precios_combo_fijo
  for each row execute function interno.bitacora_trigger('cambiar_precio', 'precio');

create trigger bitacora_tarifas_update after update on public.tarifas_parqueadero
  for each row execute function interno.bitacora_trigger('cambiar_precio', 'precio');

create trigger bitacora_productos_update after update on public.productos
  for each row execute function interno.bitacora_trigger('cambiar_precio', 'precio_venta', 'costo', 'activo');

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 4) Ajuste de inventario
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- Los tres tipos (entrada/salida/ajuste). El Plan solo nombra el ajuste, pero filtrar sale más
-- caro que registrar, y una salida sin venta asociada es tan interesante como un ajuste.

create trigger bitacora_movimientos_insert after insert on public.movimientos_inventario
  for each row execute function interno.bitacora_trigger('ajustar_inventario');

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 5) Configuración
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- Cambiar el % de comisión o la base de cálculo afecta la plata de todas las órdenes futuras y
-- hasta ahora no dejaba ningún rastro. `configuracion` es una sola fila mutable sin historial —
-- esto no lo versiona (eso queda para la ola siguiente), pero al menos deja quién y cuándo.

create trigger bitacora_configuracion_update after update on public.configuracion
  for each row execute function interno.bitacora_trigger(
    'cambiar_configuracion',
    'comision_lavador_porcentaje', 'comision_jefe_zona_porcentaje', 'comision_base',
    'recargo_alto_cilindraje', 'periodicidad_liquidacion'
  );

-- Nota de advisor: `interno.actor()` e `interno.bitacora_trigger()` viven en el schema `interno`
-- (fuera de los "Exposed schemas" de la API, igual que los helpers movidos en 0017) y tienen el
-- EXECUTE revocado a `authenticated`, así que no aparecen como endpoints RPC ni salen en el WARN
-- de "Signed-In Users Can Execute SECURITY DEFINER Function".
