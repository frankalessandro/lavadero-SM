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