# CLAUDE.md — lavadero-SM

Sistema de gestión para lavadero de carros que opera como parqueadero nocturno. Referencia completa de negocio: `Plan-de-Alcance-Lavadero-Parqueadero.pdf` (raíz del repo o `/docs`). Detalle técnico migración por migración (RPCs, esquema, decisiones puntuales de cada feature): `docs/historial-tecnico.md` — este archivo es la referencia de convenciones y reglas vigentes, no el changelog.

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

- **No hacer `git commit` ni `git merge`/`push` sin autorización explícita de Alessandro en ese momento.** Hacer los cambios, verificar (build/lint/tipos) y dejarlos en el working tree; commitear solo cuando lo pida. "Autorización en un paso no se extiende al siguiente" — cada commit/merge se pide aparte.
- Los commits se firman con el nombre configurado en `git config user.name`/`user.email` del entorno, **nunca** como Claude ni con coautoría de Claude en el mensaje.
- No abrir el navegador para probar cambios (`pnpm dev` seguido de abrir URL, `open`, `xdg-open`, etc.). Verificar con build, lint, tipos y, si aplica, tests. Si algo requiere verificación visual, pedírselo a Alessandro en vez de lanzar el navegador.
- Cambios en reglas de negocio (comisiones, arqueo, rotación, tarifas) requieren confirmación explícita antes de tocar código — ver sección "Reglas de negocio" abajo, son la fuente de verdad y no deben inferirse ni "mejorarse" sin preguntar.
- Este archivo se mantiene bajo ~150k caracteres a propósito (límite del harness) — el detalle migración por migración va en `docs/historial-tecnico.md`, no aquí. Al documentar una feature nueva grande, escribe el resumen (qué hace, qué constraint hay que respetar) acá y el detalle completo (RPCs, esquema, verificación) allá.

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
- **Dashboard de jefe de zona = M3 Seguimiento, no hay pestaña aparte (`src/routes/jefe-zona/index.tsx`)** — decisión explícita del usuario: ya había acceso a Recepción desde el dashboard, así que en vez de una pantalla "Seguimiento" separada, el dashboard ES el seguimiento.
  - **Tablero de 2 columnas** (`lg:grid-cols-2`, pensado para escritorio — es donde el jefe de zona realmente opera esto, a diferencia de recepción/vigilante que son mobile-first): "En proceso" y "Listos para cobrar", cada una con sus propias tarjetas (`OrdenCard`, componente compartido entre ambas columnas).
  - Cada tarjeta: acento de borde izquierdo por estado (en proceso / listo / sin lavador asignado, ver abajo), placa en `font-mono text-lg font-bold`, chips de combo/lavador, contador de tiempo en vivo (`Clock`, "12 min"/"1 h 5 min" — un solo `setInterval` de 60s a nivel del dashboard, no uno por tarjeta) desde `creadoEn` (en proceso) o `listaEn` (listo).
  - **Reasignar lavador** (`ReasignarModal` → `reasignarLavador(id, nuevoLavadorId)` en `src/data/ordenes.ts`): no recalcula precio/comisión (dependen del combo, no de quién lava); actualiza la cola de rotación a favor del nuevo lavador. Mismo modal sirve para **asignar por primera vez** una orden sin lavador y para **quitar asignación** (`reasignarLavador(id, null)`).
  - **Vehículo sin lavador asignado** (`lavador_id` nullable en `ordenes`, `ordenInputSchema.lavadorId` opcional): tarjeta con badge "En cola"; no ofrece "Finalizar lavado" hasta que se asigne lavador.
  - **Acciones por tarjeta**: "Avisado" (toggle `ordenes.notificado_listo`), buscador por placa + filtro por lavador (incluye "Sin asignar"), "Volver a proceso" (deshace un "Finalizar lavado" accidental), "Finalizar y cobrar" en un solo paso (llama `marcarListo` + `cobrarYEntregarOrden` seguidos), "Producto" (carga un producto de vitrina a la orden — ver "Ventas de productos" en `docs/historial-tecnico.md`), "Corregir" (encadena anulación + reemplazo — ver `docs/historial-tecnico.md`).
  - **Mensaje de WhatsApp de "Contactar"** (`construirMensajeWhatsapp`): saluda con nombre del cliente si lo hay, menciona "CarWash SM ✨", dice "carro"/"moto" según `categoria` del tipo de vehículo.
  - **Tiempo promedio de atención (hoy)**, por combo y por lavador, calculado en cliente sobre `entregadasHoy`.
  - **Caja visible en el dashboard**: tarjeta con el estado del turno (`fetchTurnoAbierto('jefe_zona')`), link a `/jefe-zona/caja` para la apertura/cierre completa.
  - **Al confirmar el cobro**, se abre `ReciboModal` variant="pago" (compartido con `/recepcion`).
- Menús actuales — **admin**: 6 secciones, ver "Panel admin: 6 secciones con pestañas" abajo. **Jefe de zona**: Dashboard (= Seguimiento), Caja, Ventas, Inventario, Liquidaciones, Asistencia (Recepción se llega desde un banner del dashboard, sin ítem de nav propio). **Vigilante**: sin dashboard ni sub-rutas — una sola vista (`src/routes/vigilante/index.tsx`).

#### Panel admin: 6 secciones con pestañas, no 14 destinos planos

El menú de admin estaba organizado por *tabla de base de datos* (un ítem por CRUD), lo que dejaba la misma tarea repartida en varias pantallas y la misma información repetida en varias. Se reagrupó por *pregunta de negocio*. **Ninguna funcionalidad se eliminó al mover — solo cambió dónde vive.**

| Sección (ítem del sidebar) | Pestañas (`SectionTabs`) |
|---|---|
| Dashboard (`/admin`) | — |
| Operación (`/admin/operacion`) | Órdenes · Clientes · Turnos y arqueos · Auditoría · Reportes |
| Dinero (`/admin/dinero`) | Liquidaciones · Gastos · Inventario y ventas |
| Catálogo y precios (`/admin/catalogo`) | Combos y precios · Servicios · Tipos de vehículo · Parqueadero |
| Personal (`/admin/personal`) | Lavadores · Usuarios del sistema |
| Configuración (`/admin/configuracion`) | — |

`/admin/rentabilidad` es ítem propio del sidebar (no pestaña de Dinero) — decisión explícita de Alessandro: es *la* pregunta del dueño y quiere el panel completo a un clic.

- Cada sección es una ruta padre con `route.tsx` (renderiza `SectionTabs` + `<Outlet/>`) e `index.tsx` que redirige a su primera pestaña — así el ítem del sidebar apunta a la sección, no a una ruta hija concreta.
- `src/components/layout/SectionTabs.tsx` es la barra de pestañas; son **rutas reales** (cada pestaña con su loader), no estado local.
- `NavItem` tiene `exact?: boolean` (default `true`): las secciones lo pasan en `false` para seguir resaltadas mientras se navega entre sus pestañas.
- **Al agregar una pantalla nueva de admin, va como pestaña de una sección existente, no como ítem nuevo del sidebar** — salvo que sea una sexta pregunta de negocio de verdad.
- **`/recepcion` y `/vigilante` son rutas top-level, no anidadas bajo `/jefe-zona` ni `/admin`** — así no heredan el `Sidebar` de esos layouts y quedan como pantallas de una sola tarea. `/recepcion` tiene un link "Panel" de vuelta a `/jefe-zona`; `/vigilante` no lo necesita porque es la única pantalla de ese rol.
- **Comprobante de ingreso en `/recepcion`** usa `ReciboModal` (`variant="ingreso"`) — referencia `LAV-{consecutivo}`. Explícitamente **no es una impresión real**, es un comprobante interno en pantalla.
- Patrón de CRUD de referencia: `src/routes/admin/catalogo/tipos-vehiculo/index.tsx` + `src/data/tiposVehiculo.ts` + `src/schemas/tipoVehiculo.ts` — ya contra Postgres real, no memoria. `src/data/services.ts` (demo de `/services`) sigue siendo el único mock en memoria que queda en el repo.
- Filosofía "nunca se elimina" (regla 5 y 13 de negocio) aplicada también a maestros como tipos de vehículo: se inactivan (`activo: boolean`), no hay borrado duro en la UI.
- **Formularios de creación amplios, no un solo input de nombre.** Modales `max-w-lg`/`max-w-xl` (no `max-w-sm`), con `gap-5` entre campos, grids `sm:grid-cols-2` para campos cortos relacionados, y un footer con separador (`border-t`) antes de los botones — patrón a seguir en cualquier CRUD nuevo.
- **Combos, Parqueadero y Configuración** ya son CRUD real contra Postgres:
  - Combos: el formulario de creación pide el precio ahí mismo (un input por cada tipo activo de esa categoría) — crea/edita el combo y hace `upsertPrecio` por cada tipo con valor, en un solo paso. **No existe pantalla separada de "Lista de precios"** — crear/editar un combo ya cubre eso; no resucitar una página de matriz aparte sin que el usuario lo pida.
  - Parqueadero: 3 tarjetas (una por modalidad), precio editable inline; mensualidad/fijo sin tarifa definida muestran "Sin definir" (Plan §13, pendiente de confirmación del cliente).
  - Configuración: input de comisión del lavador (% 0–100 en UI, 0–1 en BD) y segmented-control de dos opciones para la base de cálculo de la comisión (sobre precio de lista vs. sobre valor cobrado, Plan §6).

### Responsive — celular/tablet como caso principal, no secundario

Jefe de zona y vigilante registran todo desde el teléfono/tablet en el mostrador, no desde un PC de oficina. Eso condiciona el layout:

- **Regla dura: nada de scroll horizontal en la app.** La única excepción son tablas anchas de verdad, y aun esas van envueltas en su propio contenedor `overflow-x-auto` — el `<body>`/`<main>` nunca hace scroll en X. Cualquier grid, fila flex o bloque con ancho fijo debe apilarse/envolver por debajo de ~375px. No usar `min-w-*` mayor que el viewport, ni `whitespace-nowrap` en contenido largo.
- `Sidebar` se oculta por debajo de `md` (`hidden md:flex`); por debajo de `md` la navegación vive en el **drawer del hamburguesa del Topbar** (`Sidebar` ya renderiza esa hoja lateral cuando recibe `mobileOpen`/`onMobileClose`, ver `src/components/layout/Sidebar.tsx`). **No hay `MobileTabBar`** — se eliminó; una barra inferior fija + el drawer eran dos navegaciones compitiendo. Cualquier layout con sidebar cablea `onMenuClick={() => setMenuOpen(true)}` en el `Topbar` y pasa `mobileOpen`/`onMobileClose` al `Sidebar`.
- Vigilante no tiene `Sidebar` porque no tiene sub-rutas: es una sola pantalla mobile-first con dos botones grandes (Entrada/Salida) y una lista de tarjetas (no tabla) para que funcione bien en una columna angosta.
- Patrón de formulario en modal sobre móvil: `ModalSheet` en `vigilante/index.tsx` ancla la hoja abajo (`items-end`) en pantallas chicas y la centra (`sm:items-center`) en desktop — replicar ese patrón para nuevos formularios modales en vez del modal centrado fijo que usa `tipos-vehiculo`.

### M2 — Recepción de lavado (`src/routes/recepcion/`)

Primer flujo funcional de principio a fin, no solo placeholder. Formulario en 3 pasos de acordeón (Vehículo → Servicio → Pago, numerados, con resumen al cerrar y check al completar) → precio (desde la matriz, nunca hardcodeado) → lavador (sugerido por cola de rotación, **opcional** — si los 4 están ocupados se puede dejar sin asignar y asignarlo después desde el tablero de seguimiento, ver M3) → tiquete, con la lista de "vehículos de hoy" debajo — todo en una columna, mobile-first (`max-w-2xl mx-auto`).

- Datos ya contra Postgres real: `src/data/combos.ts`, `src/data/precios.ts` (matriz combo×tipo — la existencia de la fila es lo que habilita esa combinación en el formulario, regla de negocio 1; `findPrecio(precios, comboId, tipoId)` es una búsqueda pura sobre el array ya cargado por el loader), `src/data/lavadores.ts` (cola de rotación persistida en `lavadores.ultima_asignacion`, sin registro de asistencia real todavía), `src/data/ordenes.ts` (consecutivo por `identity` de Postgres, cálculo de comisión 40/60 antes del insert, `buscarPorPlaca` para el autocompletado por histórico).
- **Precios de ejemplo, no reales** (sembrados en `supabase/migrations/0002_seed_combos_precios.sql`) — pendientes de la lista que debe suministrar el cliente (Plan §11). No usarlos como referencia de negocio.
- Simplificaciones conscientes pendientes de módulos futuros: no hay noción de lavador "ocupado" (depende de M3/seguimiento), ni fecha de apertura de turno (regla 11, depende de M5/caja) — el filtro "hoy" en `fetchOrdenesHoy` usa la fecha calendario del cliente como aproximación.
- Paso "Vehículo" del acordeón incluye **Correo** (opcional) junto a Cliente/Teléfono, autocompletado desde `buscarPorPlaca`.
- Al registrar con éxito se abre un **modal de comprobante** (`ReciboModal`) — referencia `LAV-{consecutivo}`, datos del vehículo/cliente/combo/lavador, precio destacado, aviso de que se cobra al entregar. Sin impresión real.
- Puede recibir `?corrige=<ordenId>` para precargar el formulario en modo "corregir una orden anulada" — ver "Corregir orden" en `docs/historial-tecnico.md`.

### Controles propios, no nativos del navegador

Por pedido explícito: nada de `<select>`/`<details>` nativos en las pantallas operativas — usan controles propios del sistema de diseño:

- `CustomSelect` (`src/components/layout/CustomSelect.tsx`): reemplazo de `<select>`. Botón + panel flotante propio, con backdrop de pantalla completa para cerrar al tocar afuera. Acepta `size="sm"|"md"` (default `md`) — ver siguiente sección.
- `AccordionSection` (`src/components/layout/Accordion.tsx`): pasos numerados con estado (pendiente/activo/completo vía check), resumen cuando está cerrado, y anima el alto con la técnica CSS `grid-template-rows` (`grid-rows-[0fr]` ↔ `grid-rows-[1fr]`) — sin medir con JS ni usar `<details>`.
- Selecciones binarias/ternarias (método de pago, modalidad de parqueadero) usan grupos de botones tipo *segmented control* en vez de `<select>`.
- Usar estos componentes para cualquier desplegable nuevo en vez de volver a un `<select>` nativo.

### Dos escalas de tamaño para labels/inputs — usar la que toca, no una tercera

Hay exactamente dos tamaños de campo en todo el sistema. Cualquier formulario nuevo debe usar uno de los dos completo, sin mezclar valores sueltos:

- **Admin (`sm`) — pantallas de escritorio con densidad de tabla**: label `flex flex-col gap-1.5 text-sm` + `span` en `font-medium text-neutral-700`; input/textarea/`CustomSelect` en `px-3 py-2.5 text-sm`; `CustomSelect` con `size="sm"` explícito (el default es `md`, hay que pasarlo). Modal: `max-w-lg` (`max-w-xl` si lleva un bloque grande como precios, `max-w-md` si es un confirm corto de 1–2 campos) + `p-6 sm:p-7`, título `text-base font-semibold`, botón de cerrar `size-8` con ícono `size={18}`, footer de acciones separado con `border-t border-neutral-100 pt-4`.
- **Operativo mobile-first (`md`, el default) — `/recepcion` y `/vigilante`**: label igual (`gap-1.5 text-sm`), pero input/textarea en `px-3 py-3 text-base` (más grande, para dedo en celular) y `CustomSelect` sin pasar `size` (usa el default `md`). Segmented controls en `px-3 py-2.5 text-sm` dentro de su grupo.
- Grids de campos cortos relacionados van en filas propias y balanceadas (ej. `sm:grid-cols-3` para 3 campos cortos, `sm:grid-cols-2` para 2) — evitar mezclar un campo `col-span-2` en medio de una grilla de campos de 1 columna, porque el auto-placement de CSS Grid deja huecos dispares según el ancho de pantalla.

### M4 — Parqueadero, vista del vigilante (`src/routes/vigilante/index.tsx`)

Una sola pantalla: stats (vehículos adentro, dinero recaudado hoy) + dos botones grandes (Entrada/Salida) + lista de vehículos en el patio (tarjetas, no tabla — cada una abre el flujo de salida al tocarla).

- Datos ya contra Postgres real: `src/data/estanciasParqueadero.ts` — `registrarEntrada`/`registrarSalida`, `cobroPorModalidad` (solo la modalidad *noche* cobra por movimiento, $8.000 fijo, al retiro no al ingreso — regla de negocio 17; mensualidad y fijo no cobran por visita porque se facturan aparte), `fueraDeVentanaSalida` (marca la alerta de la ventana 7–8am, regla 7 — **no calcula la multa**, su fórmula sigue pendiente de confirmación, Plan §13).
- El resumen de dinero (`fetchResumenHoy`) sirve como preview de lo que después será el arqueo de M5 (caja de la noche) — no reemplaza esa caja, solo muestra el total del día.
- Al registrar entrada o salida, avisa si el vehículo tiene un lavado hoy (regla 8, no cobro combinado) o si la placa es suscriptora de mensualidad/fijo con su estado de vigencia — detalle en `docs/historial-tecnico.md` §Cierre de brechas contra el Plan.

### Trampa de cascade layers — CSS global sin capa gana siempre, sin importar especificidad

`src/index.css` tiene CSS "legacy" del sitio público (`h1, h2 { color: var(--text-h) }`, `.nav`, `.service-list`, etc.) que vive fuera de cualquier `@layer`. Tailwind v4 mete sus utilidades en `@layer utilities` — y una regla sin capa le gana a **cualquier** regla en capa, sin importar especificidad. Como el DOM de React es uno solo, un `<h2 className="text-neutral-900">` dentro de admin/jefe-zona/vigilante seguía recibiendo `color: var(--text-h)` del selector global `h2`, no el de Tailwind — y `--text-h` es casi blanco bajo `prefers-color-scheme: dark` del SO, así que los títulos quedaban invisibles en modo oscuro del sistema aunque el panel es intencionalmente light-only.

Arreglado envolviendo ese bloque en `@layer base` (línea ~120 de `src/index.css`), que es donde Tailwind espera los estilos base — así las utilidades (capa posterior) vuelven a ganar como se espera. **Si agregas más CSS con selector de elemento bare (`h3 {}`, `button {}`, etc.) fuera de un componente, métela en `@layer base` también**, o te va a volver a pasar.

### Dos trampas de tablas largas dentro de modales

Las dos aparecieron juntas en la tabla "Ingresos del lavadero" de `/admin/rentabilidad` al filtrar un mes completo (203 órdenes entregadas en agosto): con pocos registros no hay scroll y no se notan.

- **`position: sticky` en `<thead>`/`<tr>` no pinta fondo.** Chrome no aplica `background` a esos elementos de tabla, así que un `<thead className="sticky top-0 bg-white">` deja ver las filas por debajo y el encabezado se vuelve un amasijo ilegible apenas hay scroll. **El `sticky` y el `bg-*` van en las celdas** (`<th>`/`<td>`), no en el contenedor de fila. Por lo mismo el borde del encabezado va como `shadow-[inset_0_-1px_0_...]`: un `border` en celda sticky se corta al desplazarse. Ver `src/components/layout/TablaDetalleModal.tsx`.
- **`.custom-scroll::-webkit-scrollbar` necesita `height`, no solo `width`.** Al declarar ese pseudo-elemento el navegador deja de usar su tamaño por defecto en **ambos** ejes; sin `height` la barra horizontal queda en 0px y cualquier contenedor con scroll en X se vuelve inarrastrable con el mouse. Ya está corregido en `src/index.css`, pero tenerlo en cuenta si se crea otra clase de scrollbar propia.

Aparte: en un modal `flex flex-col` con `max-h-[90vh]`, ponerle `shrink-0` al encabezado, a la tira de resumen y al pie — si no, con una lista larga el navegador puede aplastarlos.

### Sistema de diseño (`src/index.css`, `@theme`)

Paleta y tokens definidos una sola vez en el bloque `@theme` de `src/index.css` — Tailwind v4 genera las utilidades automáticamente desde ahí, no hay `tailwind.config`. Usar estos tokens en vez de la paleta por defecto de Tailwind (nada de `slate-*`, `violet-*`, `blue-*` sueltos):

- **Color de marca — azul-celeste:** `primary-50`…`primary-950` (base `primary-600` = `#1c7fd6`). Botones/estados activos usan `primary-600` con hover `primary-700`; fondos suaves (chips, íconos, hover de fila) usan `primary-50`/`primary-100`.
- **Neutros con tinte azulado:** `neutral-50`…`neutral-900`, en vez de `slate`/`gray` — para que convivan visualmente con el primario.
- **Semánticos:** `success-*` (verde, estado activo), `warning-*`, `danger-*` (errores de formulario). Cada uno con variante `-50` para fondo suave y `-600`/`-700` para texto/ícono. **Solo existen en 50/600/700** — no hay `-100`, `-500`, etc.; para tintes suaves usar el modificador de opacidad (`bg-success-600/10`), nunca `bg-success-100` (Tailwind v4 no genera esa utilidad y la clase queda muerta en silencio).
- **Sombras por capas:** `shadow-card` (reposo) / `shadow-card-hover` (hover, con `transition-shadow`) — usan el tinte azul del primario en vez de negro puro. `shadow-nav-active` para botones/badges primarios (glow sutil).
- **Tipografía:** Plus Jakarta Sans (self-hosted vía `@fontsource/plus-jakarta-sans`, pesos 400/500/600/700 nada más). Fallback a system-ui. No agregar más pesos sin revisar el impacto en tamaño del bundle. **Excepción — Outfit para los dos títulos de marca** (Topbar/Sidebar, utilidad `font-display`): un solo peso (700).
- El sitio público (`/`, `/services/*`) comparte el mismo `--accent` (ahora azul, antes morado) vía las variables CSS en `:root`, así no hay dos sistemas de color en la misma app.
- Patrón de hover/focus: todo elemento interactivo lleva `transition-colors` (o `transition-shadow` en cards) + un estado `hover:` distinguible; inputs usan `focus:border-primary-500 focus:ring-1 focus:ring-primary-500`.
- **Confirmaciones de un clic:** `ConfirmModal` (`src/components/layout/ConfirmModal.tsx`) — para acciones que hoy se ejecutan directo al tocar un botón (activar/inactivar, marcar pagada, etc.). `variant="danger"` para acciones que restringen algo, `"primary"` para las que no. No usarlo donde ya existe un modal con campos propios (cobrar, anular) — ahí el formulario ya es la confirmación.
- **Campos de dinero:** `CurrencyInput` (`src/components/layout/CurrencyInput.tsx`) — reemplazo directo de `<input type="number">` para montos, con separador de miles es-CO mientras se escribe. El estado sigue siendo un string de dígitos crudos. Usar en cualquier campo de precio/monto nuevo.

### Base de datos — Supabase es producción, el Postgres de Docker es el sandbox de pruebas

**Supabase (proyecto real, con Auth/RLS) es la base de producción.** El frontend habla contra ella por defecto (`createClient` de `@supabase/supabase-js` en `src/lib/db.ts`, con `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`). Hay login real (`/login`, `src/lib/auth.ts`), tabla `perfiles` con roles por usuario, y políticas RLS aplicadas — el candado por rol de la tabla de Roles y visibilidad (abajo) **ya está vigente**, no es un "cuando conectemos a Supabase" futuro.

**El Postgres+PostgREST de `docker-compose.yml` es solo el sandbox de pruebas** para sembrar/borrar datos libremente sin tocar KPIs ni datos reales de producción — se activa con `VITE_USE_LOCAL_DB=true` en `.env`. En ese modo `src/lib/db.ts` devuelve un `PostgrestClient` liviano en vez del cliente de Supabase, y `src/lib/auth.ts`/`App.tsx` sintetizan un perfil fijo (`VITE_LOCAL_ROL`, default `admin`) porque ese stack no tiene Auth. **`web_anon` tiene SELECT/INSERT/UPDATE sobre todo el schema `public` sin RLS** en ese sandbox — aceptable solo porque corre en `localhost`.

- Levantar el sandbox: `docker compose up -d`. Apagar: `docker compose down` (sin `-v`, para no perder el volumen). Credenciales en `.env` (gitignored; plantilla en `.env.example`).
- **Migraciones en `supabase/migrations/*.sql`** (formato Supabase CLI) — misma fuente de verdad para ambas bases. Al Supabase real se aplican con `supabase db push`; al sandbox local se aplican a mano: `docker exec -i lavadero-sm-db psql -U $POSTGRES_USER -d $POSTGRES_DB < supabase/migrations/000N_archivo.sql`. Al agregar una tabla o columna nueva, crear el siguiente `000N_*.sql` numerado — no editar migraciones ya aplicadas, y aplicarlo a **ambas** bases si vas a seguir probando en el sandbox.
- `db/postgrest-roles.local.sql` — bootstrap de los roles `web_anon`/`authenticator` que PostgREST necesita en el sandbox. **No es portable a Supabase**.
- `db/local-shims.sql` — stubs de `interno.rol_actual()`/`es_admin()`/`es_activo()`/`actor()`, `auth.uid()` y tablas mínimas para poder aplicar migraciones Supabase-only al sandbox. Hay que re-ejecutarlo (idempotente) después de cualquier migración que reescriba esos helpers.
- **Columnas snake_case en Postgres, tipos camelCase en Zod** — el puente es el alias en el `select` (`select('id, tipoVehiculoId:tipo_vehiculo_id, ...')`), no una capa de mapeo aparte. En inserts/updates el payload sí va en snake_case (los alias solo aplican a lectura).
- Rotación de lavadores (regla de negocio 9) persistida en la propia tabla: columna `lavadores.ultima_asignacion` (nullable, NULL = nunca asignado y va primero). No hay tabla de cola aparte.
- El consecutivo de `ordenes` es `generated always as identity` — Postgres lo asigna al insertar, el frontend nunca lo calcula ni lo envía.
- **Al hacer pruebas contra el Supabase real de producción**, crear el registro de prueba, verificar, y borrarlo después con `psql` directo o el método que corresponda — `web_anon`/el rol autenticado no tienen DELETE desde el frontend a propósito.

## Roles y visibilidad (fuente: Plan de Alcance §4)

| Rol | Acceso |
|---|---|
| Administrador | Todo: configuración, ambos dashboards, costos, márgenes, gastos |
| Jefe de zona | Recepción, seguimiento, caja diurna, inventario. **Sin** acceso a costos/márgenes/histórico financiero |
| Vigilante | Parqueadero y su propia caja. **Sin** acceso a operación de lavadero, comisiones, gastos ni dashboards |

La restricción de datos se implementa con RLS en Supabase — nunca confiar solo en ocultar UI. **No hay compuerta de PIN implementada** (el Plan la pedía para operaciones sensibles) — decisión explícita, ver "Autoridad del jefe de patio" abajo: el jefe de patio opera todo sin PIN, el control es posterior vía bitácora, no previo.

Desde la migración 0053, una cuenta puede tener 1–3 roles a la vez (`perfiles.roles`), con un `rol_activo` que decide qué RLS aplica en cada sesión — detalle completo en `docs/historial-tecnico.md` §Cuentas individuales y acceso multi-rol.

## Reglas de negocio (no romper sin confirmación explícita)

1. Combo + tipo de vehículo define el precio; precios siempre desde la lista configurada, nunca hardcodeados.
2. Comisión: 40% lavador / 60% negocio por combo. Base de cálculo configurable (sobre precio de lista u sobre valor cobrado) cuando haya descuentos.
3. Un vehículo = un solo lavador.
4. Liquidación de lavadores: sobre acumulado — admin puede generar la liquidación diaria o semanal para cualquier lavador (decisión manual en cada generación, sin bandera de excepción persistida por lavador). **Actualizada 2026-09-15** (0070): lavadores, jefes de patio y gerencia pueden tener deuda (préstamo en efectivo, consumo de nevera a precio de venta —a costo solo en el retiro de gerencia, 0073—, faltante de inventario a costo que gerencia decidió cobrar). Se salda con abonos entre semana (efectivo a la caja del turno o por fuera) o con un descuento **parcial o total que admin elige al generar la liquidación** (lavador o jefe de patio; gerencia no liquida, abona). Nunca queda saldo a favor ni liquidación negativa (ver "Deudas del personal" en `docs/historial-tecnico.md`).
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
- Bitácora de auditoría (usuario, fecha, hora) en toda creación, anulación, cambio de precio, ajuste de inventario — implementada por trigger, no desde el cliente (detalle en `docs/historial-tecnico.md` §Bitácora de auditoría).
- Precios bloqueados por defecto; descuentos habilitados sin PIN pero con motivo + quién autoriza obligatorios (ver "Autoridad del jefe de patio" abajo).
- Registros históricos inmutables (no editar/borrar) — reforzado a nivel de RLS/RPC, no solo de UI (detalle en `docs/historial-tecnico.md` §Inmutabilidad del histórico).
- Cierre de sesión automático por inactividad; sesión individual por usuario, sin cuentas compartidas.

## Módulos (mapeo M1–M11 del Plan de Alcance)

M1 Configuración y maestros · M2 Recepción de lavado · M3 Seguimiento de servicios (En proceso → Listo → Entregado) · M4 Parqueadero (vigilante) · M5 Caja y turnos · M6 Gastos · M7 Inventario · M8 Lavadores y liquidación · M9 Asistencia y rotación de lavadores · M10 Dashboard operativo (jefe de zona + admin, sin datos sensibles) · M11 Dashboard administrativo (financiero, control, auditoría — exclusivo admin).

Al implementar un módulo, referenciar el código Mx correspondiente en commits/PRs para trazabilidad contra el alcance cotizado (COT-2026-033).

## Fuera de alcance (no implementar sin que Alessandro lo confirme como adicional)

Facturación electrónica DIAN, integración con datáfono/pasarelas de pago, nómina/prestaciones sociales, app móvil nativa, operación offline, múltiples sedes, migración de datos históricos.

## Infraestructura

- Plan inicial: todo en tier gratuito (Vercel/Cloudflare, Supabase free, backups vía GitHub Actions a Google Drive). El proyecto Supabase free se suspende tras 7 días sin actividad — tenerlo en cuenta al planear demos o pausas largas.
- IDs generados en cliente, operaciones idempotentes, consecutivo de tiquete independiente del ID interno — diseño pensado para soportar operación offline futura sin reescribir el sistema; no implementar el offline en sí (está excluido).

## Resumen de módulos implementados (detalle completo en `docs/historial-tecnico.md`)

Cada punto abajo es el estado actual de una pieza del sistema ya construida; el "por qué"/RPCs/esquema completo vive en el historial técnico bajo el mismo título de sección.

- **M6 — Gastos** (`/admin/dinero/gastos`): categorías + registro + total del periodo. `src/data/gastos.ts`, `src/schemas/gasto.ts`.
- **M8 — Lavadores y liquidación** (`/admin/personal/lavadores`, `/admin/dinero/liquidaciones`): CRUD de lavadores + generación de liquidaciones diaria/semanal con desglose por categoría de vehículo y colilla imprimible térmica 58mm. Selector "Lavadores | Jefe de patio" como dos flujos paralelos.
- **M5 — Caja y turnos** (`/jefe-zona/caja`, banner en `/vigilante`): apertura/cierre con arqueo ciego de 2 pasos (regla 15), justificación obligatoria si hay diferencia.
- **Ventas de productos** (nevera/vitrina): venta aparte de mostrador (`/jefe-zona/ventas`, carrito con pago partido) y producto cargado a una orden en curso (cobro combinado al entregar). No pagan comisión. Costo de mercancía vendida se descuenta de la utilidad vía snapshot en el movimiento de inventario.
- **Cuentas a costo para gerencia** (0073): al ABRIR una cuenta (jefe de patio o admin), casilla "a costo" con destinatario (solo cuenta de gerencia), motivo y quién autoriza obligatorios. Cada producto cargado después se valora al costo (`interno.costo_promedio_producto`) desde que se agrega, no al cerrar — `cerrar_cuenta`/`cargar_cuenta_a_personal` no cambian de lógica, ya suman `ventas.total`. Ingreso = costo → margen 0, sin cambios en rentabilidad. Marca auditable en `cuentas.a_costo`/`ventas.a_costo`/`destinatario_id`.
- **Pago partido y corrección de reparto**: cualquier cobro (lavado, carrito de mostrador) se reparte en 1–3 líneas por método (efectivo/transferencia/datáfono) que deben sumar exacto el total. El detalle real por método sale siempre de la tabla `pagos`, nunca de `ordenes.metodo_pago`/`ventas.metodo_pago` (que pasan a ser solo etiqueta-resumen, con valor `'mixto'` si hubo más de un método). `corregir_pagos` permite corregir solo el reparto sin PIN.
- **Descuento sobre el lavado**: rebaja puntual (% o monto fijo) aplicada solo en el cobro, con motivo + quién autoriza, sin PIN, sin tope (hasta cortesía total 100%). El negocio absorbe el descuento — comisiones de lavador y jefe de patio se calculan siempre sobre el precio de lista, nunca sobre lo cobrado.
- **Cambiar tipo de vehículo de una orden** (antes de cobrar): recalcula precio y comisiones al nuevo tipo.
- **Stock disponible**: `stock` (histórico de movimientos) vs. `disponible` (stock − comprometido en ventas pendientes). Se valida al cargar/vender, nunca al cobrar — un cobro nunca falla por "stock insuficiente" de algo que el cliente ya consumió.
- **Fecha real de cobro de ventas**: `ventas.cobrada_en` separado de `creado_en`, para que un producto cargado una noche y cobrado al día siguiente cuente en el día correcto en rentabilidad.
- **Deudas del personal** (`/admin/dinero/deudas`, 0065 → 0070): ledger `deudas_personal` para lavadores (`lavador_id`) y cuentas del sistema (`persona_id`: jefes de patio, gerencia). Préstamo y abono se registran en la caja del turno (jefe de patio o admin); consumo = cerrar cuenta "Cargar a un trabajador"; faltante de conteo = gerencia lo cobra o lo descarta. Abono en efectivo suma al arqueo, préstamo resta. Trigger impide saldo negativo. Solo admin anula (préstamo, abono, faltante).
- **Colilla del día**: corte informativo (no genera liquidación real) para que un lavador vea cómo va en un día, disponible desde admin y desde jefe de zona. Sale del filtro de periodo de la pantalla (Día / Semana / Mes con flechas): si se ve un día, colilla del día; una semana, de la semana; un mes, del mes — sin selector ni botón aparte. Cuenta cada vehículo desde que se asigna al lavador (en proceso, listo o entregado, cobrado o no); solo lo que sigue sin liquidar. Detalle en `docs/historial-tecnico.md` §Colilla del día por periodo.
- **Compras de inventario** (`/admin/dinero/inventario`, `/jefe-zona/inventario`): entidad propia con proveedor/factura/origen del pago (`caja` o `gerencia`), distinta de un ajuste de conteo.
- **TanStack Query**: migración en curso del patrón `useState` + `refresh()` + `router.invalidate()` a `useQuery`/`queryClient.invalidateQueries`. Ya migradas: `/jefe-zona/ventas`, `/jefe-zona/index.tsx`. El resto sigue con el patrón viejo — no asumir que ya están en Query.
- **M7 — Inventario** (`/admin/dinero/inventario`): productos + movimientos con signo (entrada/salida/ajuste), valorización a costo promedio ponderado. Productos agotados se ocultan de las grillas de venta pero **nunca se auto-inactivan** (ver "Agotado ≠ inactivo" en el historial — conflarlos rompe el conteo ciego). `productos.costo` es el costo oficial editable; `costo` nunca es visible para jefe de zona (RLS por fila vía la vista `productos_operativo`).
- **Reportes** (`/admin/operacion/reportes`): histórico por día/semana/mes/rango de fechas de 11 conjuntos de datos (órdenes, pagos, ventas, gastos, compras, movimientos de inventario, turnos, liquidaciones, deudas, asistencia, parqueadero), exportable a Excel y PDF (todo el periodo o un reporte). Lecturas paginadas (Supabase corta a 1.000 filas), librerías de exportación cargadas solo al exportar. Órdenes y Auditoría usan el mismo `PeriodoSelector`. Detalle y trampas (hora en Excel, regla de fecha de ventas) en `docs/historial-tecnico.md` §Reportes.
- **M11 — Dashboard administrativo** (`/admin`): pulso de HOY (KPIs vs. ayer, flujo del día, dinero de hoy, 7 días de tendencia). **No duplica con `/admin/rentabilidad`**, que es el análisis navegable por periodo con desgloses profundos — si una cifra necesita explorarse fila a fila va en rentabilidad, el dashboard enlaza allá.
- **M11 — Histórico de turnos y arqueos** (`/admin/operacion/turnos`): solo lectura, un turno cerrado es inmodificable.
- **M11 — Panel de rentabilidad** (`/admin/rentabilidad`): cascada "De ingresos a utilidad" como P&L por línea de negocio (Lavadero / Productos / Parqueadero / Consolidado, no un embudo único) — ver "Rentabilidad por línea de negocio" abajo.
- **Rentabilidad por línea de negocio**: cada línea mide su margen contra sus propios ingresos (la comisión del lavador no se diluye si suben las ventas de nevera). `categorias_gasto.linea` (nullable — NULL = gasto general, no se reparte con una regla inventada).
- **Charts**: Chart.js vía `src/components/layout/BarChart.tsx`, único componente de chart del sistema. Regla de color: una sola serie = un solo color, salvo que el color encode estado real (ej. stock bajo mínimo). Regla de cuándo graficar: solo con >2 categorías dinámicas; 1–2 valores van en KPI/lista de texto, no en barra.
- **Gastos de caja menuda imputados al turno**: `gastos.turno_id` se escribe al crear el gasto (antes era un hueco silencioso del arqueo).
- **Cuentas individuales y acceso multi-rol**: una cuenta de Auth por persona con 1–3 roles (`admin`/`jefe_zona`/`vigilante`), selector de módulo si hay más de uno. La lista de roles vive en código (`src/lib/roles.ts`), no en tabla — son 3, fijos desde la planeación.
- **El roster desaparece**: ya no hay tabla `personal_operativo` separada de `perfiles` — la cuenta ES la persona (desde 0056). `interno.actor()` (bitácora) resuelve por `auth.uid()`.
- **Bitácora de auditoría** (`/admin/operacion/auditoria`): append-only por trigger, dos identidades por fila (`usuario_id` = cuenta, `persona_id` = quién estaba a cargo del turno).
- **Inmutabilidad del histórico**: reglas 13/14 reforzadas con RPCs de lista blanca de columnas en vez de UPDATE plano con policy amplia.
- **Corregir orden**: anular + reemplazar en una operación semi-atómica (`corregir_orden`), en vez de dos pasos manuales con ventana de riesgo. No hay flujo de devoluciones — al cliente nunca se le regresa plata.
- **Conteo de inventario encadenado** (solo jefe de zona, 0048 → reinicio 0067 → cadena 0068): cada conteo se compara contra el conteo anterior del producto + lo registrado en medio, con desglose visible. Sin conteo de apertura no se vende (ni se carga a órdenes/cuentas); tras el de cierre tampoco; no se cierra turno sin conteo de cierre. Contar → reconteo ciego de lo que no cuadró o se movió mientras se contaba → resultado. Faltante de cierre a nombre del responsable, de apertura "entre turnos" sin responsable; valorado a costo, invisible para jefe de zona. Anular venta/cuenta/orden/quitar producto obliga a declarar si se consumió o volvió a la nevera — no conflarlos, era la principal fuente de faltantes falsos ("volvió" se rechaza si hubo un conteo después). Cierre y traspaso confirman una por una las cuentas/órdenes con productos sin cobrar. Traspasar el turno con inventario a cargo exige conteo (`traspasar_turno`), faltante a nombre de quien entrega.
- **Controles de integridad del inventario** (0069): `ventas` y `movimientos_inventario` no aceptan INSERT/UPDATE directo de ningún rol — todo por RPC. Movimiento manual solo por `registrar_movimiento_inventario` (justificación obligatoria, responsable lo fija el servidor), listado para gerencia en `/admin/dinero/inventario`. No se inactiva un producto con stock o pendientes. No reabrir esas policies para "arreglar rápido" un dato: rompe la cadena de conteos.
- **Cierre de brechas contra el Plan**: consecutivo de tiquetes con alerta de huecos, anular liquidación (solo si no pagada), cruce lavado↔parqueadero (regla 8), suscriptores de parqueadero (mensualidad/fijo con vigencia), historial de `configuracion` (append-only).
- **Expedientes gerenciales**: clic en una fila (orden, lavador, turno, combo, cliente, producto) abre un modal con todo el contexto — patrón reutilizado vía `OrdenDetalleCard` y varios `fetchExpediente*`/`fetchResumen*` en el data layer.

## Autoridad del jefe de patio: control por responsable + bitácora, sin PIN

Decisión de Alessandro. El Plan de Alcance pedía *"descuentos sujetos a PIN de administrador"*, pensado como aprobación previa de un superior. **No se implementó una compuerta de PIN** y la razón es operativa: gerencia no está disponible de noche, y todo el personal con acceso al panel hoy es de nivel admin, así que no hay a quién pedirle autorización en el momento.

El modelo que quedó:

- **Toda la operación diaria la hace el jefe de patio sin PIN** — recepción, cobro (con o sin descuento), cortesías, anulación de órdenes (cobradas o no), corrección de órdenes, ventas, cuentas, parqueadero, apertura/cierre de turno y arqueo, gastos de caja, movimientos de inventario (con justificación obligatoria, 0069). Todo.
- **Lo único vedado** es lo que ya bloquea el RLS: `configuracion` (comisiones, base de cálculo, recargo), precios del catálogo (`combos`, `servicios`, `precios_*`), `tarifas_parqueadero`, inactivar personal/lavadores. Para tocarlo hay que entrar con la cuenta de gerencia.
- **El control es posterior, no previo**: cada cambio queda estampado con el responsable del turno abierto y registrado en la bitácora de auditoría. Gerencia audita `/admin/operacion/auditoria` periódicamente; si hay un caso particular, el responsable de ese turno responde por él. No hay bandeja de excepciones en tiempo real.
- **Consecuencia asumida**: sobre descuentos, cortesías totales y anulación de órdenes cobradas no hay nada que lo frene en el momento — es la tolerancia al riesgo del negocio, explícita.
- **Diferido**: el día que entre un jefe de patio que NO sea admin, ahí se define su lista de bloqueos y se cablea una compuerta de PIN (tabla `personal_operativo_pin` ya existe, con `pgcrypto` disponible, vacía y sin policies hoy). No se construye antes.

## Pendiente de confirmación con el cliente

- Monto/fórmula de la "multa" por vehículo no retirado antes de las 8:00am (fijo, por fracción, o tarifa de noche adicional completa).
