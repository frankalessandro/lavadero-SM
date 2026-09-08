-- Gastos de caja menuda imputados al turno — cierra un hueco que dejaba el arqueo siempre
-- sobreestimado.
--
-- `gastos.turno_id` existe desde 0007_caja_turnos.sql y `calcularValorEsperado()` ya resta
-- `gastos where turno_id = ? and origen = 'caja'` para los dos roles de caja... pero
-- `createGasto()` NUNCA escribió esa columna: todos los gastos quedaron con `turno_id` nulo, así
-- que la resta jamás encontró una fila. Efecto real: cada vez que alguien paga algo del cajón
-- (un domicilio, gasolina, un repuesto), el valor esperado del arqueo sigue contando esa plata
-- como si estuviera en la caja, y el conteo físico sale corto sin explicación. El lado del
-- cliente se corrige en `src/data/gastos.ts`; esta migración solo abre lo que falta en la base.
--
-- Lo único que falta a nivel de base de datos es el vigilante: 0012_rls_policies.sql le dio a
-- jefe_zona select+insert sobre `gastos` (caja diurna) pero al vigilante no le dio NADA, así que
-- hoy no puede registrar un gasto de su turno ni aunque tuviera la UI.

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- gastos — vigilante
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- OJO con el SELECT: la matriz de roles (CLAUDE.md §Roles) dice que el vigilante NO tiene acceso
-- a gastos. Eso se refiere al gasto del negocio (nómina, arriendo, insumos) — pero necesita ver
-- los de su propio turno o no puede cuadrar su arqueo. La policy se acota a las dos condiciones
-- juntas: `origen = 'caja'` Y que el turno sea de rol vigilante. Así ve la caja menuda de las
-- noches y ni una fila del gasto administrativo.

create policy gastos_vigilante_select on public.gastos
  for select to authenticated
  using (
    interno.rol_actual() = 'vigilante'
    and interno.es_activo()
    and origen = 'caja'
    and turno_id in (select id from public.turnos_caja where rol = 'vigilante')
  );

-- El INSERT exige turno de vigilante Y origen de caja: el vigilante no registra gasto
-- administrativo, solo lo que sale del cajón que él mismo va a contar al cierre.
create policy gastos_vigilante_insert on public.gastos
  for insert to authenticated
  with check (
    interno.rol_actual() = 'vigilante'
    and interno.es_activo()
    and origen = 'caja'
    and turno_id in (select id from public.turnos_caja where rol = 'vigilante' and not cerrado)
  );

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- categorias_gasto — vigilante (solo lectura)
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- Sin esto el formulario no tiene qué mostrar en el selector de categoría. Es un catálogo de
-- nombres, no lleva plata — mismo criterio con el que jefe_zona ya lo lee desde 0012.

create policy categorias_gasto_select_vigilante on public.categorias_gasto
  for select to authenticated
  using (interno.rol_actual() = 'vigilante' and interno.es_activo());

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- Índice
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- `gastosDeCaja(turnoId)` corre en cada cierre de turno y en cada refresco del bloque de gastos
-- del turno abierto. Parcial sobre `origen = 'caja'` porque es el único origen que el arqueo
-- consulta.

create index gastos_turno_caja_idx on public.gastos (turno_id) where origen = 'caja';
