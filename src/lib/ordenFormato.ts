import type { EstadoOrden } from '../schemas/orden'

export const ESTADO_ORDEN_LABEL: Record<EstadoOrden, string> = {
  en_proceso: 'En proceso',
  listo: 'Listo',
  entregado: 'Entregado',
  anulada: 'Anulada',
}

export const ESTADO_ORDEN_CLASS: Record<EstadoOrden, string> = {
  en_proceso: 'bg-warning-50 text-warning-700',
  listo: 'bg-primary-50 text-primary-700',
  entregado: 'bg-success-50 text-success-700',
  anulada: 'bg-danger-50 text-danger-700',
}

// Duración legible desde segundos: "45 min" · "1 h 5 min".
export function duracion(segundos?: number | null): string {
  if (segundos == null) return '—'
  const min = Math.round(segundos / 60)
  if (min < 60) return `${min} min`
  return `${Math.floor(min / 60)} h ${min % 60} min`
}
