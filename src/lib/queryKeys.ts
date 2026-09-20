import type { RolCaja } from '../schemas/turnoCaja'

// Claves de TanStack Query por dominio, centralizadas para que dos pantallas que leen lo mismo
// (ej. stock, productos) invaliden exactamente la misma entrada de caché en vez de cada una
// mantener su propia copia en useState — que es lo que causaba el "cada acción vuelve a bajar
// todo, y aun así los datos quedan congelados en otra pestaña" documentado en CLAUDE.md.
//
// Migración en curso, no completa: hoy solo /jefe-zona/ventas usa esto (Fase 4, 2026-09-14). El
// resto de las pantallas sigue con el patrón loader → useState → refresh() manual. Al migrar una
// pantalla nueva, reusar estas claves — no inventar unas paralelas para los mismos datos.
export const queryKeys = {
  productosOperativo: ['productos', 'operativo'] as const,
  productosAdmin: ['productos', 'admin'] as const,
  stockOperativo: ['stock', 'operativo'] as const,
  stockAdmin: ['stock', 'admin'] as const,
  turnoAbierto: (rol: RolCaja) => ['turnos', 'abierto', rol] as const,
  ventasHoy: ['ventas', 'hoy'] as const,
  ventasPendientes: ['ventas', 'pendientes'] as const,
  ventasDeOrden: (ordenId: string) => ['ventas', 'orden', ordenId] as const,
  cuentasAbiertas: ['cuentas', 'abiertas'] as const,
  cuentasHoy: ['cuentas', 'hoy'] as const,
  ordenesAbiertas: ['ordenes', 'abiertas'] as const,
  ordenesHoy: ['ordenes', 'hoy'] as const,
  ordenesEntregadasHoy: ['ordenes', 'entregadas-hoy'] as const,
  pagosHoy: ['pagos', 'hoy'] as const,
  ordenesRango: (desde: string, hasta: string) => ['ordenes', 'rango', desde, hasta] as const,
  reporte: (key: string, desde: string, hasta: string) => ['reportes', key, desde, hasta] as const,
}
