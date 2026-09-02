import { CHART_COLORS } from './chartTheme'

// 3 medidas de nivel de stock, umbral relativo (mismo para todos los productos, no depende de
// stockMinimo por producto — compartido entre /admin/dinero/inventario y /jefe-zona/inventario
// para no tener los umbrales duplicados en dos archivos).
export const STOCK_BAJO_MAX = 5
export const STOCK_MEDIO_MAX = 15

export type NivelStock = 'bajo' | 'medio' | 'bueno'

export function nivelStock(stock: number): NivelStock {
  if (stock <= STOCK_BAJO_MAX) return 'bajo'
  if (stock <= STOCK_MEDIO_MAX) return 'medio'
  return 'bueno'
}

export const NIVEL_LABEL: Record<NivelStock, string> = {
  bajo: 'Stock bajo',
  medio: 'Stock medio',
  bueno: 'Stock bueno',
}

export const NIVEL_BADGE_CLASS: Record<NivelStock, string> = {
  bajo: 'bg-danger-50 text-danger-700',
  medio: 'bg-warning-50 text-warning-700',
  bueno: 'bg-success-50 text-success-700',
}

export const NIVEL_CHART_COLOR: Record<NivelStock, string> = {
  bajo: CHART_COLORS.danger,
  medio: CHART_COLORS.warning,
  bueno: CHART_COLORS.primary,
}

// Bajo primero (lo urgente arriba), luego medio, luego bueno — dentro de un mismo nivel conserva
// el orden en que ya venía (Array.sort es estable).
export function ordenarPorNivelStock<T>(items: T[], stockDe: (item: T) => number): T[] {
  const rango: Record<NivelStock, number> = { bajo: 0, medio: 1, bueno: 2 }
  return [...items].sort((a, b) => rango[nivelStock(stockDe(a))] - rango[nivelStock(stockDe(b))])
}
