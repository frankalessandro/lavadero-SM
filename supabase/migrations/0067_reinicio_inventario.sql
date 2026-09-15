-- Reinicio de inventario (decisión de Alessandro, 2026-09-15), tras la auditoría de falsos positivos
-- del conteo ciego (0048/0060). Conteo físico de nevera + bodega hecho hoy sin ventas registradas en
-- el día. Se vuelve el primer eslabón de la cadena de conteos: la próxima apertura se compara contra
-- este conteo base, el cierre contra la apertura, y así sucesivamente.
--
-- Nada se borra (regla 13):
--   - El stock del sistema se lleva al conteo físico con `ajuste`s motivados "Reinicio de inventario".
--   - Los faltantes 'pendiente' anteriores se marcan 'descartado' (estado nuevo), no se eliminan: la
--     auditoría mostró que varios eran falsos (fórmula de apertura previa a 0060, confusión Club 269 vs
--     330, cuentas anuladas cuyo producto sí se consumió) y no hay forma de separar los reales.

-- 1) Esquema: momento 'reinicio' y estado de faltante 'descartado'
alter table public.conteos_inventario drop constraint conteos_inventario_momento_check;
alter table public.conteos_inventario add constraint conteos_inventario_momento_check
  check (momento in ('apertura', 'cierre', 'reinicio'));

alter table public.conteos_inventario_lineas drop constraint conteos_inventario_lineas_estado_faltante_check;
alter table public.conteos_inventario_lineas add constraint conteos_inventario_lineas_estado_faltante_check
  check (estado_faltante in ('ninguno', 'pendiente', 'resuelto', 'descartado'));

-- 2) Datos: conteo base colgado del turno de jefe de zona abierto hoy
do $$
declare
  v_turno turnos_caja;
  v_conteo_id uuid;
  v_prod record;
  v_esperado integer;
  v_comprometido integer;
  v_diff integer;
  v_mov_id uuid;
  v_motivo constant text := 'Reinicio de inventario 2026-09-15 — conteo físico nevera + bodega';
begin
  select * into v_turno from turnos_caja
  where id = '07bf7597-9243-4483-871d-34a592177bda' and rol = 'jefe_zona' and not cerrado;
  if not found then
    raise exception 'El turno de jefe de zona del 2026-09-15 no existe o ya está cerrado';
  end if;

  insert into conteos_inventario (turno_id, momento, contado_por, contado_por_persona_id, justificacion)
  values (v_turno.id, 'reinicio', v_turno.responsable_actual, v_turno.responsable_actual_persona_id, v_motivo)
  returning id into v_conteo_id;

  for v_prod in
    select pr.id, pr.nombre, c.contado
    from (values
      ('Poker Lata 330cm', 24),
      ('Club Colombia 330 ml', 19),
      ('Club Colombia 269cm3', 24),
      ('Coronita', 23),
      ('Gatorade', 5),
      ('Quatro 400ml', 7),
      ('Coca Cola 400ml', 2),
      ('Agua Mía 600ml', 14),
      ('Doritos Bolsaza', 6),
      ('De Todito BBQ Bolsaza', 5),
      ('Margarita Pollo Bolsaza', 7),
      ('Margarita Limón Bolsaza', 7),
      ('Choclitos Bolsaza', 6),
      ('De Todito Mix Bolsaza', 0)
    ) as c(nombre, contado)
    left join productos pr on pr.nombre = c.nombre
  loop
    if v_prod.id is null then
      raise exception 'Producto no encontrado por nombre en el reinicio';
    end if;

    v_comprometido := interno.comprometido_producto(v_prod.id);
    v_esperado := interno.stock_producto(v_prod.id) - v_comprometido;
    v_diff := v_prod.contado - v_esperado;
    v_mov_id := null;

    if v_diff <> 0 then
      insert into movimientos_inventario (producto_id, tipo, cantidad, motivo, responsable)
      values (v_prod.id, 'ajuste', v_diff, v_motivo, v_turno.responsable_actual)
      returning id into v_mov_id;
    end if;

    insert into conteos_inventario_lineas (
      conteo_id, producto_id, esperado, contado, en_cuentas_pendientes,
      diferencia, valor_diferencia, ajuste_movimiento_id, estado_faltante
    ) values (
      v_conteo_id, v_prod.id, v_esperado, v_prod.contado, v_comprometido,
      v_diff, 0, v_mov_id, 'ninguno'
    );
  end loop;

  -- Todo producto vendible activo debe haber quedado en la base
  if exists (
    select 1 from productos pr
    where pr.activo and pr.precio_venta is not null
      and not exists (select 1 from conteos_inventario_lineas l where l.conteo_id = v_conteo_id and l.producto_id = pr.id)
  ) then
    raise exception 'Hay productos vendibles activos que no quedaron en el conteo base';
  end if;

  -- 3) Faltantes anteriores al reinicio
  update conteos_inventario_lineas
  set estado_faltante = 'descartado',
      motivo = coalesce(motivo || ' | ', '') || 'Descartado: anterior al reinicio de inventario 2026-09-15'
  where estado_faltante = 'pendiente';
end $$;
