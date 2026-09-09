import { z } from 'zod'

// Fuente de verdad única de los roles del sistema (RBAC con roles estáticos).
//
// Son 3, fijos desde la planeación — NO editables desde la UI. El set vive acá como constante
// de código y está espejado por el `check (roles <@ array[...])` de `perfiles` (0053) y por las
// ~78 políticas RLS, que nombran cada rol literalmente. No hay tabla `roles` en la BD a
// propósito: sería solo un almacén de etiquetas que se puede desincronizar del enforcement.
// Agregar un 4º rol es un cambio de código + migración (check + políticas nuevas), nunca de datos.
//
// `id` = valor real en BD/RLS (no se renombra: 'admin' se muestra como "Gerencia" vía `label`).

export const rolSchema = z.enum(['admin', 'jefe_zona', 'vigilante'])
export type Rol = z.infer<typeof rolSchema>

export interface RolInfo {
  id: Rol
  /** Nombre visible — términos de la planeación. */
  label: string
  /** Panel de inicio tras elegir módulo. */
  home: string
  /** Qué ve y puede — referencia para "Usuarios del sistema" (Plan de Alcance §4). */
  acceso: string
}

export const ROLES: readonly RolInfo[] = [
  {
    id: 'admin',
    label: 'Gerencia',
    home: '/admin',
    acceso:
      'Todo: configuración, precios del catálogo, ambos dashboards, costos, márgenes, gastos, liquidaciones y auditoría.',
  },
  {
    id: 'jefe_zona',
    label: 'Jefe de patio',
    home: '/jefe-zona',
    acceso:
      'Recepción, seguimiento de lavados, caja diurna, inventario y ventas de mostrador. Sin costos, márgenes ni histórico financiero.',
  },
  {
    id: 'vigilante',
    label: 'Vigilante',
    home: '/vigilante',
    acceso:
      'Parqueadero nocturno y su propia caja. Sin operación de lavadero, comisiones, gastos ni dashboards.',
  },
] as const

export const ROL_LABEL: Record<Rol, string> = Object.fromEntries(
  ROLES.map((r) => [r.id, r.label]),
) as Record<Rol, string>

export const ROL_HOME: Record<Rol, string> = Object.fromEntries(
  ROLES.map((r) => [r.id, r.home]),
) as Record<Rol, string>
