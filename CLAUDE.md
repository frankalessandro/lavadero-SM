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
- Menús actuales — **admin**: Dashboard, Tipos de vehículo, Combos, Lista de precios, Parqueadero, Lavadores, Configuración (M1 completo). **Jefe de zona**: Dashboard, Recepción (enlaza a `/recepcion`, fuera de este layout — ver abajo), Seguimiento, Caja, Inventario (M2/M3/M5/M7/M10, sin costos/márgenes). **Vigilante**: sin dashboard ni sub-rutas — una sola vista (`src/routes/vigilante/index.tsx`), ver abajo.
- **`/recepcion` y `/vigilante` son rutas top-level, no anidadas bajo `/jefe-zona` ni `/admin`** — así no heredan el `Sidebar`/`MobileTabBar` de esos layouts y quedan como pantallas de una sola tarea, igual de accesibles en celular que en desktop. Cada una trae su propio header liviano (marca + rol, sin nav) en su `route.tsx`. `/recepcion` además tiene un link "Panel" de vuelta a `/jefe-zona` porque ese rol sí tiene otras secciones (Seguimiento, Caja, Inventario); `/vigilante` no lo necesita porque es la única pantalla de ese rol.
- Patrón de CRUD de referencia: `src/routes/admin/tipos-vehiculo/index.tsx` + `src/data/tiposVehiculo.ts` + `src/schemas/tipoVehiculo.ts` — store en memoria (mismo patrón que `services.ts`) hasta conectar Postgres/Supabase. Reemplazar esa capa de datos, no la UI, cuando se conecte el backend real.
- Filosofía "nunca se elimina" (regla 5 y 13 de negocio) aplicada también a maestros como tipos de vehículo: se inactivan (`activo: boolean`), no hay borrado duro en la UI.

### Responsive — celular/tablet como caso principal, no secundario

Jefe de zona y vigilante registran todo desde el teléfono/tablet en el mostrador, no desde un PC de oficina. Eso condiciona el layout:

- `Sidebar` se oculta por debajo de `md` (`hidden md:flex`). Todo layout con sidebar (admin, jefe-zona) **debe** incluir `MobileTabBar` (`src/components/layout/MobileTabBar.tsx`, mismo `navItems` que el `Sidebar`) para no dejar al usuario de celular sin navegación — es una barra inferior fija, con scroll horizontal si hay muchos ítems. El `<main>` de esos layouts lleva `pb-24 md:pb-6` para que el contenido no quede tapado detrás de la barra.
- Vigilante no tiene `Sidebar`/`MobileTabBar` porque no tiene sub-rutas: es una sola pantalla mobile-first con dos botones grandes (Entrada/Salida) y una lista de tarjetas (no tabla) para que funcione bien en una columna angosta.
- Patrón de formulario en modal sobre móvil: `ModalSheet` en `vigilante/index.tsx` ancla la hoja abajo (`items-end`) en pantallas chicas y la centra (`sm:items-center`) en desktop — replicar ese patrón para nuevos formularios modales en vez del modal centrado fijo que usa `tipos-vehiculo`.

### M2 — Recepción de lavado (`src/routes/recepcion/`)

Primer flujo funcional de principio a fin, no solo placeholder. Formulario en 3 pasos de acordeón (Vehículo → Servicio → Pago, numerados, con resumen al cerrar y check al completar) → precio (desde la matriz, nunca hardcodeado) → lavador (sugerido por cola de rotación) → tiquete, con la lista de "vehículos de hoy" debajo — todo en una columna, mobile-first (`max-w-2xl mx-auto`).

- Datos: `src/data/combos.ts` (catálogo semilla de la sección 5 del Plan), `src/data/precios.ts` (matriz combo×tipo — la existencia del registro es lo que habilita esa combinación en el formulario, regla de negocio 1), `src/data/lavadores.ts` (cola de rotación FIFO simplificada, sin registro de asistencia real todavía — `suggestNextLavador()` / `registrarAsignacion()`), `src/data/ordenes.ts` (consecutivo, cálculo de comisión 40/60, `buscarPorPlaca` para el autocompletado por histórico).
- **Precios de ejemplo, no reales** — pendientes de la lista que debe suministrar el cliente (Plan §11). No usarlos como referencia de negocio.
- Simplificaciones conscientes pendientes de módulos futuros: no hay noción de lavador "ocupado" (depende de M3/seguimiento), ni fecha de apertura de turno (regla 11, depende de M5/caja) — el filtro "hoy" en `fetchOrdenesHoy` usa la fecha calendario del cliente como aproximación.

### Controles propios, no nativos del navegador

Por pedido explícito: nada de `<select>`/`<details>` nativos en las pantallas operativas — usan controles propios del sistema de diseño:

- `CustomSelect` (`src/components/layout/CustomSelect.tsx`): reemplazo de `<select>`. Botón + panel flotante propio, con backdrop de pantalla completa para cerrar al tocar afuera (mismo patrón que ya usaban los modales, no un listener de `document` aparte).
- `AccordionSection` (`src/components/layout/Accordion.tsx`): pasos numerados con estado (pendiente/activo/completo vía check), resumen cuando está cerrado, y anima el alto con la técnica CSS `grid-template-rows` (`grid-rows-[0fr]` ↔ `grid-rows-[1fr]`) — sin medir con JS ni usar `<details>`.
- Selecciones binarias/ternarias (método de pago, modalidad de parqueadero) usan grupos de botones tipo *segmented control* en vez de `<select>` — ya se hacía así en `vigilante/index.tsx` antes de este cambio; `recepcion` sigue el mismo patrón.
- Usar estos componentes para cualquier desplegable nuevo en vez de volver a un `<select>` nativo.

### M4 — Parqueadero, vista del vigilante (`src/routes/vigilante/index.tsx`)

Una sola pantalla: stats (vehículos adentro, dinero recaudado hoy) + dos botones grandes (Entrada/Salida) + lista de vehículos en el patio (tarjetas, no tabla — cada una abre el flujo de salida al tocarla).

- Datos: `src/data/estanciasParqueadero.ts` — `registrarEntrada`/`registrarSalida`, `cobroPorModalidad` (solo la modalidad *noche* cobra por movimiento, $8.000 fijo, al retiro no al ingreso — regla de negocio 17; mensualidad y fijo no cobran por visita porque se facturan aparte), `fueraDeVentanaSalida` (marca la alerta de la ventana 7–8am, regla 7 — **no calcula la multa**, su fórmula sigue pendiente de confirmación, Plan §13).
- El resumen de dinero (`fetchResumenHoy`) sirve como preview de lo que después será el arqueo de M5 (caja de la noche) — no reemplaza esa caja, solo muestra el total del día mientras M5 no existe para el vigilante.

### Sistema de diseño (`src/index.css`, `@theme`)

Paleta y tokens definidos una sola vez en el bloque `@theme` de `src/index.css` — Tailwind v4 genera las utilidades automáticamente desde ahí, no hay `tailwind.config`. Usar estos tokens en vez de la paleta por defecto de Tailwind (nada de `slate-*`, `violet-*`, `blue-*` sueltos):

- **Color de marca — azul-celeste:** `primary-50`…`primary-950` (base `primary-600` = `#1c7fd6`). Botones/estados activos usan `primary-600` con hover `primary-700`; fondos suaves (chips, íconos, hover de fila) usan `primary-50`/`primary-100`.
- **Neutros con tinte azulado:** `neutral-50`…`neutral-900`, en vez de `slate`/`gray` — para que convivan visualmente con el primario.
- **Semánticos:** `success-*` (verde, estado activo), `warning-*`, `danger-*` (errores de formulario). Cada uno con variante `-50` para fondo suave y `-600`/`-700` para texto/ícono.
- **Sombras por capas:** `shadow-card` (reposo) / `shadow-card-hover` (hover, con `transition-shadow`) — usan el tinte azul del primario en vez de negro puro, más "premium" que un `shadow-sm` genérico. `shadow-nav-active` para botones/badges primarios (glow sutil).
- **Tipografía:** Plus Jakarta Sans (self-hosted vía `@fontsource/plus-jakarta-sans`, pesos 400/500/600/700 nada más — ver `src/main.tsx`). Fallback a system-ui. No agregar más pesos sin revisar el impacto en tamaño del bundle (cada peso ~12 kB woff2).
- El sitio público (`/`, `/services/*`) comparte el mismo `--accent` (ahora azul, antes morado) vía las variables CSS en `:root`, así no hay dos sistemas de color en la misma app.
- Patrón de hover/focus: todo elemento interactivo lleva `transition-colors` (o `transition-shadow` en cards) + un estado `hover:` distinguible; inputs usan `focus:border-primary-500 focus:ring-1 focus:ring-primary-500`.

### Base de datos local (desarrollo)

- Postgres corre en Docker vía `docker-compose.yml` (imagen `postgres:latest`, volumen nombrado `lavadero-sm-db-data` montado en `/var/lib/postgresql` — Postgres 18+ requiere ese punto de montaje, no `/var/lib/postgresql/data`).
- Credenciales en `.env` (gitignored; plantilla en `.env.example`). Levantar con `docker compose up -d`, apagar con `docker compose down` (sin `-v`, para no perder el volumen).
- Esto es la base local de desarrollo, no reemplaza Supabase como backend de producción (auth, RLS, realtime) — ver Stack arriba.

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

## Pendiente de confirmación con el cliente

- Monto/fórmula de la "multa" por vehículo no retirado antes de las 8:00am (fijo, por fracción, o tarifa de noche adicional completa).