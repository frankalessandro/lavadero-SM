# CLAUDE.md — lavadero-SM

Sistema de gestión para lavadero de carros que opera como parqueadero nocturno. Referencia completa de negocio: `Plan-de-Alcance-Lavadero-Parqueadero.pdf` (raíz del repo o `/docs`).

## Stack

- React 19.2 + TypeScript 5.9
- Tailwind CSS 4 vía `@tailwindcss/vite` (sin `tailwind.config`; se activa con `@import "tailwindcss";` en `src/index.css`). El CSS custom existente (`src/index.css`/`src/App.css`, variables `--accent`, etc.) convive con Tailwind — no migrado a utilidades todavía.
- TanStack Router (`@tanstack/react-router` + devtools)
- Vite 8, plugin rolldown-babel, React Compiler vía `babel-plugin-react-compiler`
- Zod 4 para validación (schemas = fuente de verdad de los tipos de dominio)
- ESLint 10 + typescript-eslint
- pnpm — nunca usar npm/yarn, respetar `pnpm-lock.yaml`
- Backend/datos: Supabase (PostgreSQL, auth, RLS, realtime)
- Despliegue: Vercel o Cloudflare

## Comandos

```bash
pnpm install
pnpm dev          # vite dev server
pnpm build        # vite build (no corre tsc — usar pnpm typecheck aparte)
pnpm lint         # eslint .
pnpm typecheck    # tsc -b (sin emitir)
pnpm preview      # sirve el build de producción
```

No hay suite de tests configurada todavía (no existe `pnpm test`).

## Reglas de trabajo con Claude

- Los commits se firman con el nombre configurado en `git config user.name`/`user.email` del entorno, **nunca** como Claude ni con coautoría de Claude en el mensaje.
- No abrir el navegador para probar cambios (`pnpm dev` seguido de abrir URL, `open`, `xdg-open`, etc.). Verificar con build, lint, tipos y, si aplica, tests. Si algo requiere verificación visual, pedírselo a Alessandro en vez de lanzar el navegador.
- Cambios en reglas de negocio (comisiones, arqueo, rotación, tarifas) requieren confirmación explícita antes de tocar código — ver sección "Reglas de negocio" abajo, son la fuente de verdad y no deben inferirse ni "mejorarse" sin preguntar.

## Arquitectura y convenciones (frontend)

- Componentes funcionales, tipados con TypeScript estricto; nada de `any` salvo justificación explícita en comentario.
- Un schema Zod por entidad de dominio (`Orden`, `TurnoCaja`, `Lavador`, `Vehiculo`, etc.), y los tipos TS se infieren de esos schemas (`z.infer<...>`), no se duplican a mano.
- Rutas con TanStack Router organizadas por rol (`/admin/*`, `/jefe-zona/*`, `/vigilante/*`); el guard de rol vive en el loader de la ruta, no solo en la UI — la restricción real de datos ocurre en Supabase vía RLS (ver Roles).
- Layout de recepción (M2) optimizado para teclado y flujo rápido: minimizar clics, autocompletar por placa, evitar modales innecesarios en el camino crítico de cobro.
- Mantener CSS de tiquetes (80mm) separado del resto de estilos de la app — no debe heredar Tailwind global que rompa el layout de impresión.
- Nada de datos sensibles (costos, márgenes, utilidad) debe llegar al bundle o al estado del cliente cuando el usuario autenticado es jefe de zona o vigilante — la restricción se hace a nivel de query/RLS, no ocultando componentes en el frontend.
- `src/routeTree.gen.ts` es generado por el plugin `@tanstack/router-plugin` a partir de `src/routes/**` (file-based routing) — no editarlo a mano, está en `globalIgnores` de ESLint. En `vite.config.ts` el plugin `tanstackRouter()` debe ir antes que `@vitejs/plugin-react` (comentario explícito en el archivo).
- Los archivos de ruta exportan `Route` junto al componente por convención de TanStack Router; por eso `react-refresh/only-export-components` está desactivado solo para `src/routes/**/*` en `eslint.config.js`.

### Estado actual

El repo es un scaffold temprano: rutas de ejemplo (`src/routes/services/*`) contra datos mock en memoria (`src/data/services.ts`), sin integración a Supabase todavía. Al implementar los módulos M1–M11 reales, este demo de "services" se reemplaza.

### Paneles por rol (`/admin/*`, `/jefe-zona/*`, `/vigilante/*`)

- Cada rol tiene su propio layout (`src/routes/{admin,jefe-zona,vigilante}/route.tsx`) pero comparten el mismo shell visual desde `src/components/layout/`: `Sidebar` (recibe `navItems` + `roleLabel`), `Topbar` (recibe `title` + `avatarInitial`), `Card`, `StatCard`, `ComingSoon` (placeholder para módulos aún no implementados). No dupliques estos componentes por rol — solo cambia la lista de `navItems` y los textos.
- Estilo inspirado en Purity UI / Horizon UI (cards blancas `rounded-2xl` con sombra suave, sidebar claro). Cada layout usa `fixed inset-0` para salirse del contenedor angosto (`#root`, `width: 1126px`) del sitio público — cada área por rol es su propia superficie visual, no hereda el layout de marketing.
- Iconos: `lucide-react` (import nombrado por ícono → tree-shaking real, cada ícono queda en su propio chunk de ~0.2–0.5 kB, ver `pnpm build`). Mantener esa librería como estándar de íconos del proyecto por el peso.
- **Dashboard de jefe de zona = M3 Seguimiento, no hay pestaña aparte (`src/routes/jefe-zona/index.tsx`)** — decisión explícita del usuario: ya había acceso a Recepción desde el dashboard, así que en vez de una pantalla "Seguimiento" separada, el dashboard ES el seguimiento. Se eliminó `/jefe-zona/seguimiento` (`ComingSoon`) y su ítem de nav.
  - **Tablero de 2 columnas** (`lg:grid-cols-2`, pensado para escritorio — es donde el jefe de zona realmente opera esto, a diferencia de recepción/vigilante que son mobile-first): "En proceso" y "Listos para cobrar", cada una con sus propias tarjetas (`OrdenCard`, componente compartido entre ambas columnas).
  - Cada tarjeta: acento de borde izquierdo por estado (`border-l-warning-600 bg-warning-50/40` en proceso, `border-l-primary-500 bg-primary-50/40 shadow-nav-active` listo, `transition-all duration-300`), placa en `font-mono text-lg font-bold`, chips de combo/lavador (`Sparkles`/`Car`, mismos íconos que `/recepcion`), contador de tiempo en vivo (`Clock`, "12 min"/"1 h 5 min" — un solo `setInterval` de 60s a nivel del dashboard, no uno por tarjeta, se limpia en el cleanup del `useEffect`) desde `creadoEn` (en proceso) o `listaEn` (listo).
  - **Reasignar lavador** (ícono `Repeat`, solo en tarjetas "en proceso"): abre `ReasignarModal` → `reasignarLavador(id, nuevoLavadorId)` en `src/data/ordenes.ts` — no recalcula precio/comisión (dependen del combo, no de quién lava), solo cambia `lavador_id` y actualiza la cola de rotación a favor del nuevo lavador vía `registrarAsignacion`.
  - **Tiempo promedio de atención (hoy), por combo y por lavador** — calculado en el cliente sobre `entregadasHoy` (`entregadaEn − creadoEn` en minutos, promediado por `comboId`/`lavadorId` con `useMemo`), sin tabla ni query aparte.
  - **Caja visible en el dashboard**: tarjeta con el estado del turno (`fetchTurnoAbierto('jefe_zona')`) — abierto (candado verde, responsable, hora, base) o cerrado (candado ámbar, invita a abrir) — con link a `/jefe-zona/caja` para la apertura/cierre completa (arqueo ciego); no se duplicó esa lógica aquí, solo el estado a la vista.
  - **Al confirmar el cobro** (`CobroModal`, sin cambios de lógica), se abre `ReciboModal` con `variant="pago"` — mismo componente que usa `/recepcion` para el comprobante de ingreso, ahora extraído a `src/components/layout/ReciboModal.tsx` (compartido) para no duplicar el diseño. La variante `pago` muestra método de pago/referencia y "Vehículo entregado — pago confirmado" en vez de "se cobra al entregar".
- Menús actuales — **admin**: Dashboard, Tipos de vehículo, Combos, Parqueadero, Lavadores, Liquidaciones, Gastos, Órdenes, Turnos, Inventario, Configuración (M1 completo). **Jefe de zona**: Dashboard (= Seguimiento), Recepción (enlaza a `/recepcion`, fuera de este layout — ver abajo), Caja, Inventario (M2/M3/M5/M7/M10, sin costos/márgenes). **Vigilante**: sin dashboard ni sub-rutas — una sola vista (`src/routes/vigilante/index.tsx`), ver abajo.
- **`/recepcion` y `/vigilante` son rutas top-level, no anidadas bajo `/jefe-zona` ni `/admin`** — así no heredan el `Sidebar`/`MobileTabBar` de esos layouts y quedan como pantallas de una sola tarea, igual de accesibles en celular que en desktop. Cada una trae su propio header liviano (marca + rol, sin nav) en su `route.tsx`. `/recepcion` además tiene un link "Panel" de vuelta a `/jefe-zona` porque ese rol sí tiene otras secciones (Caja, Inventario); `/vigilante` no lo necesita porque es la única pantalla de ese rol.
- **Comprobante de ingreso en `/recepcion`** también usa `ReciboModal` (`variant="ingreso"`) — número de referencia `LAV-{consecutivo}`, borde superior azul y efecto de recibo perforado (fila de círculos + `border-dashed`), botón "Registrar otro vehículo" que cierra el modal (el formulario ya se reseteó por debajo). Explícitamente **no es una impresión real** — no hay integración de impresora configurada, es un comprobante interno en pantalla.
- Patrón de CRUD de referencia: `src/routes/admin/tipos-vehiculo/index.tsx` + `src/data/tiposVehiculo.ts` + `src/schemas/tipoVehiculo.ts` — ya contra Postgres real vía PostgREST (ver "Base de datos local" abajo), no memoria. `src/data/services.ts` (demo de `/services`) sigue siendo el único mock en memoria que queda en el repo.
- Filosofía "nunca se elimina" (regla 5 y 13 de negocio) aplicada también a maestros como tipos de vehículo: se inactivan (`activo: boolean`), no hay borrado duro en la UI.
- **Formularios de creación amplios, no un solo input de nombre.** Modales `max-w-lg`/`max-w-xl` (no `max-w-sm`), con `gap-5` entre campos, grids `sm:grid-cols-2` para campos cortos relacionados, y un footer con separador (`border-t`) antes de los botones — patrón a seguir en cualquier CRUD nuevo. Ejemplos: `tipos_vehiculo` ahora pide `categoria` (auto/moto, ver arriba); `lavadores` pide teléfono, fecha de ingreso y cumpleaños además de nombre (Plan §M8, foto queda fuera por no haber storage configurado). El objetivo es que cada entidad capture la información real del Plan, no solo lo mínimo para que la fila exista.
- **Combos** (`/admin/combos`), **Parqueadero** (`/admin/parqueadero`) y **Configuración** (`/admin/configuracion`) ya son CRUD real contra Postgres, no `ComingSoon`:
  - Combos: `combos` tiene `descripcion` (qué incluye) y `categoria` (`'auto'|'moto'`, ver `categoriaVehiculoSchema` en `src/schemas/tipoVehiculo.ts` — compartido porque `tipos_vehiculo` también tiene `categoria`, es lo que separa el catálogo de autos/camionetas del de motos aunque compartan nombres tipo "Combo 2"). **El formulario de creación de combo pide el precio ahí mismo** (un input por cada tipo activo de esa categoría, opcional) — al guardar, crea/edita el combo y hace `upsertPrecio` por cada tipo con valor, en un solo paso. Modal `max-w-xl` con scroll (`max-h-[90vh] overflow-y-auto`), no el `max-w-sm` genérico.
  - **No existe una pantalla separada de "Lista de precios"** — se eliminó (`/admin/lista-precios`) porque quedó redundante: crear o editar un combo ya cubre poner/actualizar sus precios. `src/data/precios.ts` sigue existiendo (`fetchPrecios`, `findPrecio`, `upsertPrecio`) — lo usan `combos/index.tsx` y `recepcion/index.tsx`, no lo borres ni lo dupliques si hace falta ajustar un precio desde otro lado; agrégalo al formulario de combo, no resucites una página de matriz aparte sin que el usuario lo pida explícitamente.
  - Parqueadero: 3 tarjetas (una por modalidad), precio editable inline; mensualidad/fijo sin tarifa definida muestran "Sin definir" en vez de $0, con aviso de que está pendiente de confirmación del cliente (Plan §13, ver "Pendiente de confirmación" abajo).
  - Configuración: input de comisión del lavador (se edita como % 0–100 en la UI, se guarda como 0–1) y segmented-control de dos opciones para la base de cálculo de la comisión, con la redacción exacta del Plan §6 ("Manejo de descuentos"): *sobre precio de lista* (el negocio absorbe el descuento) vs. *sobre valor cobrado* (se reparte entre negocio y lavador).

### Responsive — celular/tablet como caso principal, no secundario

Jefe de zona y vigilante registran todo desde el teléfono/tablet en el mostrador, no desde un PC de oficina. Eso condiciona el layout:

- `Sidebar` se oculta por debajo de `md` (`hidden md:flex`). Todo layout con sidebar (admin, jefe-zona) **debe** incluir `MobileTabBar` (`src/components/layout/MobileTabBar.tsx`, mismo `navItems` que el `Sidebar`) para no dejar al usuario de celular sin navegación — es una barra inferior fija, con scroll horizontal si hay muchos ítems. El `<main>` de esos layouts lleva `pb-24 md:pb-6` para que el contenido no quede tapado detrás de la barra.
- Vigilante no tiene `Sidebar`/`MobileTabBar` porque no tiene sub-rutas: es una sola pantalla mobile-first con dos botones grandes (Entrada/Salida) y una lista de tarjetas (no tabla) para que funcione bien en una columna angosta.
- Patrón de formulario en modal sobre móvil: `ModalSheet` en `vigilante/index.tsx` ancla la hoja abajo (`items-end`) en pantallas chicas y la centra (`sm:items-center`) en desktop — replicar ese patrón para nuevos formularios modales en vez del modal centrado fijo que usa `tipos-vehiculo`.

### M2 — Recepción de lavado (`src/routes/recepcion/`)

Primer flujo funcional de principio a fin, no solo placeholder. Formulario en 3 pasos de acordeón (Vehículo → Servicio → Pago, numerados, con resumen al cerrar y check al completar) → precio (desde la matriz, nunca hardcodeado) → lavador (sugerido por cola de rotación) → tiquete, con la lista de "vehículos de hoy" debajo — todo en una columna, mobile-first (`max-w-2xl mx-auto`).

- Datos ya contra Postgres real (ver "Base de datos local" arriba), no memoria: `src/data/combos.ts`, `src/data/precios.ts` (matriz combo×tipo — la existencia de la fila es lo que habilita esa combinación en el formulario, regla de negocio 1; `findPrecio(precios, comboId, tipoId)` es una búsqueda pura sobre el array ya cargado por el loader, no una consulta nueva por cada combinación que el usuario prueba), `src/data/lavadores.ts` (cola de rotación persistida en `lavadores.ultima_asignacion`, sin registro de asistencia real todavía — `suggestNextLavador()`/`registrarAsignacion()` son async), `src/data/ordenes.ts` (consecutivo por `identity` de Postgres, cálculo de comisión 40/60 antes del insert, `buscarPorPlaca` para el autocompletado por histórico).
- **Precios de ejemplo, no reales** (sembrados en `supabase/migrations/0002_seed_combos_precios.sql`) — pendientes de la lista que debe suministrar el cliente (Plan §11). No usarlos como referencia de negocio.
- Simplificaciones conscientes pendientes de módulos futuros: no hay noción de lavador "ocupado" (depende de M3/seguimiento), ni fecha de apertura de turno (regla 11, depende de M5/caja) — el filtro "hoy" en `fetchOrdenesHoy` usa la fecha calendario del cliente como aproximación.
- Paso "Vehículo" del acordeón incluye **Correo** (opcional, `type="email"`) junto a Cliente/Teléfono — Cliente en su propia fila, Teléfono/Correo en un grid de 2 columnas debajo. Se autocompleta desde `buscarPorPlaca` igual que los demás campos del historial y viaja en el payload de `createOrden` (`clienteCorreo` → `cliente_correo`, ya soportado por `src/schemas/orden.ts`/`src/data/ordenes.ts`, no tocar esos archivos por este cambio).
- Al registrar con éxito se abre un **modal de comprobante** (`ReciboModal` en `recepcion/index.tsx`) en vez del texto "Tiquete #X registrado." de antes — tarjeta `max-w-sm` estilo recibo (franja superior `primary-600`, borde inferior punteado con fila de círculos simulando la perforación), referencia `LAV-{consecutivo}`, datos del vehículo/cliente/combo/lavador, precio destacado y aviso de que se cobra al entregar. Cubre toda la pantalla (`fixed inset-0`) para que el usuario no vea el formulario ya reseteado detrás; el reset (mismo patrón de siempre, con el siguiente lavador sugerido) ocurre en segundo plano al guardar, y el botón "Registrar otro vehículo" solo cierra el modal. Sin impresión real — es comprobante interno en pantalla.

### Controles propios, no nativos del navegador

Por pedido explícito: nada de `<select>`/`<details>` nativos en las pantallas operativas — usan controles propios del sistema de diseño:

- `CustomSelect` (`src/components/layout/CustomSelect.tsx`): reemplazo de `<select>`. Botón + panel flotante propio, con backdrop de pantalla completa para cerrar al tocar afuera (mismo patrón que ya usaban los modales, no un listener de `document` aparte). Acepta `size="sm"|"md"` (default `md`) — ver siguiente sección, es el mismo mecanismo que resuelve que combine con los inputs de texto vecinos.
- `AccordionSection` (`src/components/layout/Accordion.tsx`): pasos numerados con estado (pendiente/activo/completo vía check), resumen cuando está cerrado, y anima el alto con la técnica CSS `grid-template-rows` (`grid-rows-[0fr]` ↔ `grid-rows-[1fr]`) — sin medir con JS ni usar `<details>`.
- Selecciones binarias/ternarias (método de pago, modalidad de parqueadero) usan grupos de botones tipo *segmented control* en vez de `<select>` — ya se hacía así en `vigilante/index.tsx` antes de este cambio; `recepcion` sigue el mismo patrón.
- Usar estos componentes para cualquier desplegable nuevo en vez de volver a un `<select>` nativo.

### Dos escalas de tamaño para labels/inputs — usar la que toca, no una tercera

Hay exactamente dos tamaños de campo en todo el sistema. Cualquier formulario nuevo debe usar uno de los dos completo, sin mezclar valores sueltos:

- **Admin (`sm`) — pantallas de escritorio con densidad de tabla**: label `flex flex-col gap-1.5 text-sm` + `span` en `font-medium text-neutral-700`; input/textarea/`CustomSelect` en `px-3 py-2.5 text-sm`; `CustomSelect` con `size="sm"` explícito (el default es `md`, hay que pasarlo). Modal: `max-w-lg` (`max-w-xl` si lleva un bloque grande como precios, `max-w-md` si es un confirm corto de 1–2 campos) + `p-6 sm:p-7`, título `text-base font-semibold`, botón de cerrar `size-8` con ícono `size={18}`, footer de acciones separado con `border-t border-neutral-100 pt-4`. Ejemplos: `tipos-vehiculo`, `combos`, `lavadores`, `gastos`, `configuracion`, `parqueadero`, `ordenes` (modal de anular).
- **Operativo mobile-first (`md`, el default) — `/recepcion` y `/vigilante`**: label igual (`gap-1.5 text-sm`), pero input/textarea en `px-3 py-3 text-base` (más grande, para dedo en celular) y `CustomSelect` sin pasar `size` (usa el default `md`). Segmented controls (método de pago, modalidad) en `px-3 py-2.5 text-sm` dentro de su grupo — ahí sí es más chico a propósito, son botones no campos de texto.
- Grids de campos cortos relacionados van en filas propias y balanceadas (ej. `sm:grid-cols-3` para 3 campos cortos, `sm:grid-cols-2` para 2) — evitar mezclar un campo `col-span-2` en medio de una grilla de campos de 1 columna, porque el auto-placement de CSS Grid deja huecos dispares según el ancho de pantalla (le pasó al formulario de Gastos: Fecha/Categoría/Monto ahora son su propia fila de 3, Descripción es su propia fila completa, Responsable/Origen su propia fila de 2 — no una sola grilla con spans mezclados).

### M4 — Parqueadero, vista del vigilante (`src/routes/vigilante/index.tsx`)

Una sola pantalla: stats (vehículos adentro, dinero recaudado hoy) + dos botones grandes (Entrada/Salida) + lista de vehículos en el patio (tarjetas, no tabla — cada una abre el flujo de salida al tocarla).

- Datos ya contra Postgres real: `src/data/estanciasParqueadero.ts` — `registrarEntrada`/`registrarSalida`, `cobroPorModalidad` (solo la modalidad *noche* cobra por movimiento, $8.000 fijo, al retiro no al ingreso — regla de negocio 17; mensualidad y fijo no cobran por visita porque se facturan aparte), `fueraDeVentanaSalida` (marca la alerta de la ventana 7–8am, regla 7 — **no calcula la multa**, su fórmula sigue pendiente de confirmación, Plan §13).
- El resumen de dinero (`fetchResumenHoy`) sirve como preview de lo que después será el arqueo de M5 (caja de la noche) — no reemplaza esa caja, solo muestra el total del día mientras M5 no existe para el vigilante.

### Trampa de cascade layers — CSS global sin capa gana siempre, sin importar especificidad

`src/index.css` tiene CSS "legacy" del sitio público (`h1, h2 { color: var(--text-h) }`, `.nav`, `.service-list`, etc.) que vive fuera de cualquier `@layer`. Tailwind v4 mete sus utilidades en `@layer utilities` — y una regla sin capa le gana a **cualquier** regla en capa, sin importar especificidad. Como el DOM de React es uno solo, un `<h2 className="text-neutral-900">` dentro de admin/jefe-zona/vigilante seguía recibiendo `color: var(--text-h)` del selector global `h2`, no el de Tailwind — y `--text-h` es casi blanco bajo `prefers-color-scheme: dark` del SO, así que los títulos quedaban invisibles en modo oscuro del sistema aunque el panel es intencionalmente light-only.

Arreglado envolviendo ese bloque en `@layer base` (línea ~120 de `src/index.css`), que es donde Tailwind espera los estilos base — así las utilidades (capa posterior) vuelven a ganar como se espera. **Si agregas más CSS con selector de elemento bare (`h3 {}`, `button {}`, etc.) fuera de un componente, métela en `@layer base` también**, o te va a volver a pasar.

### Sistema de diseño (`src/index.css`, `@theme`)

Paleta y tokens definidos una sola vez en el bloque `@theme` de `src/index.css` — Tailwind v4 genera las utilidades automáticamente desde ahí, no hay `tailwind.config`. Usar estos tokens en vez de la paleta por defecto de Tailwind (nada de `slate-*`, `violet-*`, `blue-*` sueltos):

- **Color de marca — azul-celeste:** `primary-50`…`primary-950` (base `primary-600` = `#1c7fd6`). Botones/estados activos usan `primary-600` con hover `primary-700`; fondos suaves (chips, íconos, hover de fila) usan `primary-50`/`primary-100`.
- **Neutros con tinte azulado:** `neutral-50`…`neutral-900`, en vez de `slate`/`gray` — para que convivan visualmente con el primario.
- **Semánticos:** `success-*` (verde, estado activo), `warning-*`, `danger-*` (errores de formulario). Cada uno con variante `-50` para fondo suave y `-600`/`-700` para texto/ícono.
- **Sombras por capas:** `shadow-card` (reposo) / `shadow-card-hover` (hover, con `transition-shadow`) — usan el tinte azul del primario en vez de negro puro, más "premium" que un `shadow-sm` genérico. `shadow-nav-active` para botones/badges primarios (glow sutil).
- **Tipografía:** Plus Jakarta Sans (self-hosted vía `@fontsource/plus-jakarta-sans`, pesos 400/500/600/700 nada más — ver `src/main.tsx`). Fallback a system-ui. No agregar más pesos sin revisar el impacto en tamaño del bundle (cada peso ~12 kB woff2).
- El sitio público (`/`, `/services/*`) comparte el mismo `--accent` (ahora azul, antes morado) vía las variables CSS en `:root`, así no hay dos sistemas de color en la misma app.
- Patrón de hover/focus: todo elemento interactivo lleva `transition-colors` (o `transition-shadow` en cards) + un estado `hover:` distinguible; inputs usan `focus:border-primary-500 focus:ring-1 focus:ring-primary-500`.
- **Confirmaciones de un clic:** `ConfirmModal` (`src/components/layout/ConfirmModal.tsx`) — para acciones que hoy se ejecutan directo al tocar un botón (activar/inactivar, marcar pagada, etc.). Se muestra condicionalmente con un estado `useState<Tipo | null>` que guarda qué ítem se va a confirmar; `variant="danger"` para acciones que restringen algo (inactivar), `"primary"` para las que no (activar). No usarlo donde ya existe un modal con campos propios (cobrar, anular) — ahí el formulario ya es la confirmación.
- **Campos de dinero:** `CurrencyInput` (`src/components/layout/CurrencyInput.tsx`) — reemplazo directo de `<input type="number">` para montos, con separador de miles es-CO mientras se escribe. El estado sigue siendo un string de dígitos crudos (`Number(valor)` en el consumidor no cambia). Usar en cualquier campo de precio/monto nuevo en vez de un `<input type="number">` con prefijo `$` manual.
- Aplicados en caja/turnos: "Base inicial" y "Conteo físico" con `CurrencyInput` en `/jefe-zona/caja` (`size="sm"`, escritorio) y en `/vigilante` (`size="md"`, mobile-first) — el flujo de cierre (arqueo ciego de 2 pasos) no lleva `ConfirmModal` encima porque ya es su propia confirmación. En `/jefe-zona` (dashboard), "Finalizar lavado" de `OrdenCard` sí usa `ConfirmModal` (`variant="primary"`) vía un estado `finalizando: Orden | null` a nivel de `JefeZonaDashboard`.
- Aplicados en `/admin/inventario` (costo unitario del movimiento con `CurrencyInput`; activar/inactivar producto con `ConfirmModal`), `/admin/gastos` (monto del formulario con `CurrencyInput`; activar/inactivar categoría con `ConfirmModal`), `/admin/liquidaciones` (generar liquidación semanal y marcar pagada, ambos con `ConfirmModal` — antes se ejecutaban directo al clic) y `/admin/parqueadero` (tarifa por modalidad con `CurrencyInput`; sin `ConfirmModal` ahí porque editar+guardar ya es confirmación en dos pasos).

### Base de datos local (desarrollo) — Postgres + PostgREST, conectado de verdad

`docker-compose.yml` levanta dos servicios: `db` (Postgres) y `postgrest` (PostgREST, expone la base como API REST en `http://localhost:3001`). El frontend ya no usa datos mock — `src/data/*.ts` llama a Postgres real a través de esa API.

- Levantar: `docker compose up -d`. Apagar: `docker compose down` (sin `-v`, para no perder el volumen). Credenciales en `.env` (gitignored; plantilla en `.env.example`).
- **Migraciones en `supabase/migrations/*.sql`** (formato Supabase CLI, portable — se aplican con `supabase db push` el día que haya un proyecto Supabase real). Localmente se aplican a mano porque no usamos el CLI de Supabase: `docker exec -i lavadero-sm-db psql -U $POSTGRES_USER -d $POSTGRES_DB < supabase/migrations/000N_archivo.sql` (con `.env` cargado en el shell). Al agregar una tabla o columna nueva, crear el siguiente `000N_*.sql` numerado — no editar migraciones ya aplicadas.
- `db/postgrest-roles.local.sql` — bootstrap de los roles `web_anon`/`authenticator` que PostgREST necesita para hablar con Postgres. **No es portable a Supabase** (allá los roles `anon`/`authenticated` ya los gestiona GoTrue) — vive fuera de `supabase/migrations/` a propósito.
- **`web_anon` tiene SELECT/INSERT/UPDATE sobre todo el schema `public`, sin RLS ni Auth todavía.** Es aceptable solo porque Postgres corre en `localhost` sin exponerse a internet. El candado real por rol (jefe de zona sin ver costos, vigilante sin ver comisiones, etc. — ver tabla de Roles abajo) **llega recién cuando el proyecto se conecte a Supabase**; hasta entonces cualquier row del frontend puede leer/escribir cualquier tabla. No tratar este estado como si ya cumpliera la sección de Roles y visibilidad.
- `src/lib/db.ts` expone el cliente (`PostgrestClient` de `@supabase/postgrest-js`, no el paquete completo `@supabase/supabase-js` — más liviano, sin Auth/Realtime/Storage que no se usan todavía). Apunta a `VITE_POSTGREST_URL` (default `http://localhost:3001`). El día del cambio a Supabase, solo cambia esa URL — el resto de `data/*.ts` sigue igual porque `db.from(...)` es la misma API contra PostgREST o contra Supabase.
- **Columnas snake_case en Postgres, tipos camelCase en Zod** — el puente es el alias de PostgREST en el `select` (`select('id, tipoVehiculoId:tipo_vehiculo_id, ...')`), no una capa de mapeo aparte. En inserts/updates el payload sí va en snake_case (los alias de PostgREST solo aplican a lectura).
- Rotación de lavadores (regla de negocio 9) persistida en la propia tabla: columna `lavadores.ultima_asignacion` (nullable, NULL = nunca asignado y va primero). No hay tabla de cola aparte — `suggestNextLavador()`/`registrarAsignacion()` en `src/data/lavadores.ts` ordenan/actualizan esa columna.
- El consecutivo de `ordenes` es `generated always as identity` — Postgres lo asigna al insertar, el frontend nunca lo calcula ni lo envía.

## Roles y visibilidad (fuente: Plan de Alcance §4)

| Rol | Acceso |
|---|---|
| Administrador | Todo: configuración, ambos dashboards, costos, márgenes, gastos, PIN para operaciones sensibles |
| Jefe de zona | Recepción, seguimiento, caja diurna, inventario. **Sin** acceso a costos/márgenes/histórico financiero |
| Vigilante | Parqueadero y su propia caja. **Sin** acceso a operación de lavadero, comisiones, gastos ni dashboards |

La restricción de datos se implementa con RLS en Supabase — nunca confiar solo en ocultar UI.

## Reglas de negocio (no romper sin confirmación explícita)

1. Combo + tipo de vehículo define el precio; precios siempre desde la lista configurada, nunca hardcodeados.
2. Comisión: 40% lavador / 60% negocio por combo. Base de cálculo configurable (sobre precio de lista u sobre valor cobrado) cuando haya descuentos.
3. Un vehículo = un solo lavador.
4. Liquidación de lavadores: semanal sobre acumulado, sin descuentos al lavador — excepción parametrizable de pago diario por lavador (caso trabajador en periodo de inicio).
5. Lavadores se inactivan, nunca se eliminan (preservar histórico).
6. Parqueadero: 3 modalidades independientes — noche ($8.000, 7pm–7am, se cobra al retiro no al ingreso), mensualidad, fijo 24h (entradas/salidas ilimitadas).
7. Ventana de salida 7:00–8:00am para modalidad noche y mensualidad; fuera de esa ventana aplica cobro tipo "multa" (monto/fórmula aún sin definir — ver pendientes).
8. Vehículos lavados no generan cobro combinado con parqueadero (se retiran al terminar el servicio, ~1h promedio).
9. Rotación de lavadores por orden de llegada; si el lavador en turno está ocupado, la cola avanza y él conserva su posición para la siguiente ronda.
10. Cliente puede pedir lavador específico; ese servicio cuenta dentro de la rotación normal de ese lavador.
11. Todo movimiento pertenece a la fecha de apertura del turno en que se registró (turno nocturno que cruza medianoche se contabiliza completo en la fecha de apertura).
12. Cajas de jefe de zona y vigilante no se traslapan (lavadero cierra 6pm, parqueadero abre 7pm); cada una con su propio arqueo.
13. Ningún registro se elimina — órdenes se anulan con motivo obligatorio y quedan visibles en reportes/auditoría.
14. Turno de caja cerrado es inmodificable.
15. Arqueo ciego en cierre de turno: se pide el conteo físico antes de mostrar el valor esperado del sistema.
16. Indicador de rotación mide cantidad de vehículos atendidos, no ingresos (evitar que el valor distinto de los combos distorsione la métrica de equidad).

## Control antifraude (no negociable)

- Consecutivo continuo de tiquetes con alerta ante huecos.
- Bitácora de auditoría (usuario, fecha, hora) en toda creación, anulación, cambio de precio, ajuste de inventario.
- Precios bloqueados por defecto; descuentos deshabilitados por defecto y sujetos a PIN de administrador cuando se habiliten.
- Registros históricos inmutables (no editar/borrar).
- Cierre de sesión automático por inactividad; sesión individual por usuario, sin cuentas compartidas.

## Módulos (mapeo M1–M11 del Plan de Alcance)

M1 Configuración y maestros · M2 Recepción de lavado · M3 Seguimiento de servicios (En proceso → Listo → Entregado) · M4 Parqueadero (vigilante) · M5 Caja y turnos · M6 Gastos · M7 Inventario · M8 Lavadores y liquidación · M9 Asistencia y rotación de lavadores · M10 Dashboard operativo (jefe de zona + admin, sin datos sensibles) · M11 Dashboard administrativo (financiero, control, auditoría — exclusivo admin).

Al implementar un módulo, referenciar el código Mx correspondiente en commits/PRs para trazabilidad contra el alcance cotizado (COT-2026-033).

## Fuera de alcance (no implementar sin que Alessandro lo confirme como adicional)

Facturación electrónica DIAN, integración con datáfono/pasarelas de pago, nómina/prestaciones sociales, app móvil nativa, operación offline, múltiples sedes, migración de datos históricos.

## Infraestructura

- Plan inicial: todo en tier gratuito (Vercel/Cloudflare, Supabase free, backups vía GitHub Actions a Google Drive). El proyecto Supabase free se suspende tras 7 días sin actividad — tenerlo en cuenta al planear demos o pausas largas.
- IDs generados en cliente, operaciones idempotentes, consecutivo de tiquete independiente del ID interno — diseño pensado para soportar operación offline futura sin reescribir el sistema; no implementar el offline en sí (está excluido).

## M6 — Gastos

- Datos: `src/data/gastos.ts` (`fetchCategoriasGasto`, `createCategoriaGasto`, `setCategoriaGastoActivo`, `fetchGastos`, `createGasto`, `fetchTotalGastosPorCategoria`). Schemas en `src/schemas/gasto.ts` (ya existían, no se tocaron).
- Ruta: `src/routes/admin/gastos/index.tsx` — formulario de registro + tabla del mes actual (total visible arriba) + modal "Gestionar categorías" (crear/activar/inactivar, nunca eliminar, mismo patrón que tipos de vehículo).
- Embedding de categoría en el `select` de `fetchGastos` vía FK de PostgREST: `categorias_gasto(nombre)` — confirmado con curl que resuelve a un objeto `{ nombre }` (no a array), porque `categoria_id` es `not null references categorias_gasto(id)` (relación many-to-one). Se mapea a `categoriaNombre: string` plano en `GastoConCategoria` para el cliente.
- Importante: el `order` de PostgREST debe usar el nombre real de columna (`creado_en`), no el alias camelCase del `select` (`creadoEn`) — alias solo aplica a la forma del JSON de salida.
- `fetchTotalGastosPorCategoria` no agrega en SQL: trae `fetchGastos` del rango y agrupa en JS (suficiente para el volumen esperado; se puede mover a una vista/RPC si el dashboard M11 lo necesita más eficiente).

## M8 — Lavadores y liquidación

- Datos: `src/data/lavadores.ts` ampliado con `createLavador`/`updateLavador`/`setLavadorActivo` (mismo patrón que `tiposVehiculo.ts` — nunca borrado duro, regla 5). Nuevo `src/schemas/lavador.ts:lavadorInputSchema` (`nombre`, `pagoDiario`). Nuevo `src/data/liquidaciones.ts`: `fetchLiquidaciones`, `fetchComisionesPendientes`, `generarLiquidacion`, `marcarLiquidacionPagada`.
- Ruta `/admin/lavadores`: CRUD completo (tabla + modal crear/editar con checkbox "pago diario, en periodo de inicio", badges de activo/inactivo y de modalidad de pago). Reemplaza el `ComingSoon` anterior.
- Ruta nueva `/admin/liquidaciones`: sección "Comisiones pendientes" (una tarjeta por lavador activo sin `pagoDiario`, con botón "Generar liquidación semanal") + "Histórico de liquidaciones" (tabla con botón "Marcar pagada"). Nota visible listando lavadores con `pagoDiario=true` que quedan fuera del flujo (regla 4).
- `fetchComisionesPendientes` **no filtra por fecha** — suma todo `comision_lavador` de `ordenes` con `liquidacion_id is null` y `estado != 'anulada'` por lavador, sin importar cuándo se generó la orden (así ninguna orden vieja se pierde entre liquidaciones). El botón "Generar liquidación semanal" sí usa un rango fijo de los últimos 7 días (`hoy-7` a `hoy`) para `periodo_inicio`/`periodo_fin` de la fila creada — si hay comisiones pendientes de más de 7 días atrás, quedan pendientes tras generar (visible de nuevo en la tarjeta) en vez de perderse o incluirse silenciosamente fuera de ese rango.
- `generarLiquidacion` no es atómico porque PostgREST plano no da transacciones multi-tabla: 1) calcula con `fetchOrdenesEnRango` + filtros, 2) inserta la fila en `liquidaciones`, 3) hace `update` de las órdenes con `liquidacion_id`. Si el paso 3 falla, lanza un error explícito con el id de la liquidación ya creada y cuántas órdenes quedaron sin marcar — no fallar en silencio; requiere revisión manual (`psql` directo) en ese caso excepcional.
- Verificado contra la base real: creado un lavador de prueba (confirmado con curl) y una liquidación real para un lavador con órdenes sin liquidar — el monto insertado coincidió con la suma manual de `comision_lavador` y las 3 órdenes quedaron con `liquidacion_id` actualizado (confirmado con curl). Liquidación y lavador de prueba revertidos después con `psql` directo (`web_anon` no tiene DELETE).

## M5 — Caja y turnos, jefe de zona

- Ruta `/jefe-zona/caja` (`src/routes/jefe-zona/caja/index.tsx`) reemplaza el `ComingSoon` anterior. Usa exclusivamente `src/data/turnos.ts` y `src/schemas/turnoCaja.ts` ya existentes — no se tocaron.
- Sin turno abierto: formulario de apertura (responsable + base inicial) → `abrirTurno({ rol: 'jefe_zona', ... })`. Con turno abierto: tarjeta de resumen (responsable, apertura, base) + botón "Cerrar turno".
- Cierre en modal de 2 pasos, arqueo ciego (regla 15): paso 1 solo pide el conteo físico (sin mostrar nada del sistema); al confirmar, recién ahí se llama `calcularValorEsperado(turno)` y se revela esperado/conteo/diferencia (verde si diferencia=0, rojo si no). Si hay diferencia, la justificación es obligatoria (validado en el modal antes de habilitar el submit, además de la validación que ya hace `cerrarTurno` en el data layer). Campo nuevo "Quién cierra" (obligatorio, no se asume igual al responsable de apertura) y "Recibido por" (opcional) antes de llamar `cerrarTurno`.
- Tras cerrar, la vista vuelve automáticamente al estado "sin turno abierto" (refetch de `fetchTurnoAbierto`/`fetchTurnos`).
- Sección "Turnos recientes": últimos 5 de `fetchTurnos('jefe_zona')`, solo lectura — responsable, apertura, cierre, base, esperado, conteo, diferencia y justificación si la hay.
- Verificado contra la base real con curl: turno de prueba abierto (`responsable: 'TEST-AGENT-CAJA'`), cerrado con conteo distinto al esperado (diferencia intencional de 5.000) confirmando que `cerrado=true`, `diferencia`, `justificacion_diferencia`, `cerrado_por` y `recibido_por` quedaron correctos — turno de prueba borrado después con `psql` directo (`web_anon` no tiene DELETE).

## M5 — Caja y turnos, vigilante

- `src/routes/vigilante/index.tsx` ampliado con el mismo `src/data/turnos.ts`/`src/schemas/turnoCaja.ts` (rol `'vigilante'`) — no se tocaron. La pantalla sigue siendo única, sin sub-rutas: el control de turno es un banner arriba de las stats, no una pantalla aparte.
- Loader agrega `fetchTurnoAbierto('vigilante')` junto a `fetchEstanciasAdentro`/`fetchResumenHoy`. Sin turno abierto: banner de aviso (fondo `warning`) + botón "Abrir turno" que abre un `ModalSheet` (responsable + base inicial) → `abrirTurno`. Con turno abierto: banner (fondo `success`) con responsable y hora de apertura + botón "Cerrar turno" — los botones de Entrada/Salida del parqueadero siguen habilitados sin turno abierto (el movimiento simplemente queda sin `turno_id`, ya resuelto en `registrarSalida`), la exigencia es solo de visibilidad, no de bloqueo.
- Cierre en `ModalSheet` de 2 pasos, arqueo ciego (regla 15): paso 1 pide solo el conteo físico; al confirmar, recién ahí se llama `calcularValorEsperado(turno)` y se pasa a un paso 2 que revela conteo/esperado/diferencia (verde si es 0, ámbar si no). Si hay diferencia, textarea de justificación obligatoria antes de habilitar el cierre (mismo doble check que `cerrarTurno` ya hace en el data layer). Campos "Cierra el turno" (obligatorio) y "Recibido por" (opcional) antes de llamar `cerrarTurno`.
- No se agregó sección de "turnos recientes" en esta pantalla a propósito (indicación explícita de la tarea) — el vigilante es operativo, el histórico de turnos queda para el panel de admin.
- Verificado contra la base real con curl: turno de prueba abierto (`rol: 'vigilante'`, `responsable: 'Prueba Agente'`, `base_inicial: 50000`), cerrado con el mismo PATCH que ejecuta `cerrarTurno` simulando una diferencia intencional de 5.000 (`conteo_fisico: 55000` vs `valor_esperado: 50000`) — confirmado que `cerrado`, `diferencia`, `justificacion_diferencia`, `cerrado_por` y `recibido_por` quedaron correctos. Turno de prueba borrado después con `psql` directo (`web_anon` no tiene DELETE).

## M7 — Inventario (`/admin/inventario`)

- Tablas `productos` (catálogo: nombre, unidad de medida, stock mínimo, activo — nunca se elimina, se inactiva) y `movimientos_inventario` (`tipo`: `'entrada'|'salida'|'ajuste'`, `cantidad` **con signo** ya aplicado por la UI — entrada positiva, salida negativa, ajuste lo que el usuario indique con el toggle "Aumenta/Disminuye stock`). `costo_unitario`/`proveedor` solo aplican a entradas; `motivo` es obligatorio para ajustes (validado en `movimientoInventarioInputSchema` con `.refine`, no en el constraint de la tabla).
- **No hay columna de "stock actual" desnormalizada** — `src/data/movimientosInventario.ts:fetchStockProductos()` trae todos los movimientos y suma `cantidad` en JS por producto (mismo patrón que `fetchTotalGastosPorCategoria`). Evita que el stock se desincronice del histórico.
- **Valorización = costo promedio ponderado de las entradas** (`sum(cantidad×costo_unitario de entradas) / sum(cantidad de entradas)`) × stock actual — no el costo de la última compra ni el total histórico de compras (eso sobreestimaría el valor una vez que se ha consumido inventario). Productos sin ninguna entrada con costo registrado tienen costo promedio $0.
- Página: `StatCard`s (productos activos, cuántos bajo el stock mínimo, valorización total) + formulario de registro de movimiento (producto, tipo, cantidad, costo/proveedor si es entrada, motivo, responsable) + tabla de stock actual (fila en rojo si stock < mínimo) + histórico de movimientos recientes (últimos 15).
- Verificado contra la base real: producto de prueba con entrada de 20 a $15.000, salida de 3, ajuste de -1 → confirmado con curl que la suma de movimientos da stock=16 y que `fetchStockProductos()` calcularía valorización=$240.000 (16 × 15.000), coincide exactamente. Producto y movimientos de prueba borrados después con `psql` directo.
- **Fuera de esta iteración**: no hay UI para que jefe de zona registre movimientos (el Plan lo sugiere en los CRUDs de M10, pero por ahora solo existe en `/admin`, mismo criterio ya usado en M6/Gastos); no hay alertas push/notificación de stock bajo, solo el indicador visual en la tabla.

## M11 — Dashboard administrativo (primera iteración)

- Dashboard principal (`src/routes/admin/index.tsx`) ampliado con sección financiera de HOY: ingresos por método de pago (efectivo/transferencia del lavadero, parqueadero aparte porque `fetchResumenHoy().dineroHoy` no distingue método), ingresos por línea de negocio (lavadero vs. parqueadero), gastos de hoy y por categoría (`fetchGastos`/`fetchTotalGastosPorCategoria` con rango `hoy`–`hoy`), utilidad neta de hoy aproximada, y comisiones pendientes de pago (`fetchComisionesPendientes`). Todas las sumas excluyen explícitamente `estado === 'anulada'`.
- Utilidad neta de hoy = ingresos totales (lavadero + parqueadero) − comisiones de lavadores del día − gastos del día. Etiquetada visiblemente como aproximada, con nota "no incluye consumo de inventario (M7 no implementado)".
- Ruta nueva `/admin/ordenes` (`src/routes/admin/ordenes/index.tsx`): histórico con filtro por rango (hoy / últimos 7 días / últimos 30 días, botones — no `<select>`) usando `fetchOrdenesEnRango`; tabla con nombres de combo y lavador resueltos en cliente vía `fetchCombos`/`fetchLavadores` (mapa id→nombre, sin nueva query por fila); total de ingresos del rango visible (sin anuladas); acción "Anular" con modal (motivo obligatorio mín. 3 caracteres + quién anula, texto libre porque no hay sesión real todavía) que llama a `anularOrden` ya existente en `src/data/ordenes.ts` — no se tocó esa función.
- Sección "Anulaciones" (control/auditoría básico de M11): tarjeta de anulaciones de hoy en el dashboard principal, y tarjeta de anulaciones del rango visible al final de `/admin/ordenes` — ambas muestran motivo, quién anuló y cuándo. No hay tabla de bitácora aparte todavía, se lee directo de las columnas de auditoría de `ordenes`.
- Verificado contra la base real: sumas de ingresos/comisiones por método de pago calculadas a mano con `curl` coincidieron con lo mostrado. Se creó una orden de prueba por `curl`, se anuló con el mismo PATCH que ejecuta `anularOrden` (confirmando `estado`, `motivo_anulacion`, `anulada_por`, `anulada_en`), y se borró después con `psql` directo — no se tocó ninguna orden real del negocio.
- **Explícitamente fuera de esta iteración** (no confundir con "M11 completo"): inventario (M7, no existe la tabla), exportación a Excel/PDF, arqueo de caja/turnos (M5, "caja esperada" sigue siendo aproximación sin arqueo), tracking de vencimiento de mensualidades, punto de equilibrio y comparativos semana/mes/año (solo hay cifras de "hoy"). Cualquiera de estos requiere confirmación de alcance con Alessandro antes de implementarse.

## M11 — Histórico de turnos y arqueos

- Ruta nueva `/admin/turnos` (`src/routes/admin/turnos/index.tsx`), solo lectura — un turno cerrado es inmodificable (regla 14), así que no hay ninguna acción de edición en esta pantalla. Usa `fetchTurnos()`/`fetchTurnos(rol)` ya existentes en `src/data/turnos.ts`, sin tocar ese archivo ni `src/schemas/turnoCaja.ts`.
- Filtro por rol tipo *segmented control* ("Todos" / "Jefe de zona" / "Vigilante"), 3 `StatCard` (turnos mostrados, cuántos tienen diferencia distinta de cero sobre el total de cerrados, suma con signo de las diferencias — positivo = sobrante, negativo = faltante) y una tabla con badge de rol, apertura/cierre (badge "Abierto" si `cerrado=false`), base inicial, valor esperado, conteo físico, diferencia (verde=0, rojo=faltante, amarillo=sobrante, con `justificacionDiferencia` visible debajo en texto pequeño y en `title` tooltip), quién cerró y quién recibió.
- Columnas que solo aplican a turnos cerrados (`valorEsperado`, `conteoFisico`, `diferencia`, `cerradoPor`) muestran "—" mientras el turno sigue abierto, en vez de "$0" o vacío.
- Ítem de nav agregado a `NAV_ITEMS` en `src/routes/admin/route.tsx` con ícono `ClipboardCheck` de `lucide-react` (existe en el paquete instalado, confirmado antes de usarlo), entre "Órdenes" y "Configuración".
- Verificado contra la base real: turno de prueba creado y cerrado por `curl` con diferencia negativa (faltante) y `justificacion_diferencia`, confirmando que la lógica de colores/badges/tooltip de la página lo clasifica correctamente; borrado después con `psql` directo (`web_anon` no tiene DELETE).

## Charts (Chart.js) — identidad visual de admin y jefe de zona

- `chart.js` + `react-chartjs-2` instalados. `src/lib/chartTheme.ts` registra solo lo que se usa (`BarElement`, `CategoryScale`, `LinearScale`, `Tooltip` — nada de `ArcElement`/donut ni `PointElement`/`LineElement`, para no meter peso al bundle que no se aprovecha) y define `CHART_COLORS` tomado literal de los tokens de `src/index.css` (`primary-600`, `success-600`, `danger-600`, `neutral-200`/`500`), más `baseBarOptions()` con el estilo compartido (gridlines hairline sólidas, sin leyenda, tooltip oscuro con la tipografía del sistema).
- `src/components/layout/BarChart.tsx` es el único componente de chart del sistema — cubre todos los casos actuales porque son "una métrica por categoría" (tiempo promedio, comisiones, gastos, stock), nunca varias series a la vez. Props: `labels`, `data`, `color`/`colors` (override por barra, solo para estado — ver abajo), `horizontal` (default `true`, mejor para nombres largos), `valueFormatter`, `height`, `emptyLabel`.
- **Regla de color:** nominal-categórico de una sola serie (tiempo por combo, comisiones por lavador, gastos por categoría) = **un solo color** (`primary`), nunca una barra de un color distinto por categoría — colorear por categoría gastaría el canal de identidad en algo que el largo de la barra ya muestra. La única excepción es **estado real**: stock de inventario usa `colors` por barra (`danger` si `stock < stockMinimo`, si no `primary`) porque ahí el color sí encodea información nueva.
- **Regla de cuándo SÍ es un chart** (no todo lo numérico se grafica — corregido tras primera pasada que graficaba de más): un puñado fijo de 2–3 cifras (ingresos por método de pago, ingresos por línea de negocio en `admin/index.tsx`) es una **fila de KPI/`dl`**, no una barra — un chart de 2 barras no le gana a leer el número directo. El chart solo aplica cuando hay una lista dinámica de categorías que puede crecer (gastos por categoría, comisiones por lavador, stock por producto, tiempo promedio por combo/lavador), y aun ahí con un umbral: **> 2 categorías**, si no se queda en lista de texto (`totalesPorCategoria.length > 2`, `pendientes.length > 2`, `promedios.porCombo.length > 2`, etc.) — con 1 o 2 valores el número es más legible que una barra.
- No usar grids angostos para meter un chart de barras horizontales con nombres largos — antes vivía dentro de una tarjeta a mitad de página dividida en 2 columnas más (cuarto de página, barras ilegibles). `jefe-zona/index.tsx` saca "Tiempo promedio de atención" a su propia tarjeta de ancho completo, con combo/lavador en 2 columnas (`sm:grid-cols-2`) dentro de esa tarjeta ancha, no anidado en el grid de 2 columnas de la página.
- Dónde se usa (solo donde hay >2 categorías dinámicas): `admin/index.tsx` (gastos por categoría), `admin/liquidaciones/index.tsx` (comparativo de comisiones pendientes por lavador), `admin/inventario/index.tsx` (stock actual por producto, coloreado por estado), `jefe-zona/index.tsx` (tiempo promedio de atención por combo y por lavador).
- Metodología seguida: skill `dataviz` interno — `references/choosing-a-form.md` ("A handful of headline numbers → KPI row of stat tiles, not a grouped bar chart") es la que forzó la corrección; seis checks de paleta categórica solo aplican si hay ≥2 series reales — aquí casi todo es 1 serie así que no aplica paleta categórica de 8 colores ni validador.

## Pendiente de confirmación con el cliente

- Monto/fórmula de la "multa" por vehículo no retirado antes de las 8:00am (fijo, por fracción, o tarifa de noche adicional completa).