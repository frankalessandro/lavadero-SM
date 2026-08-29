import type { MetodoPagoBase } from '../schemas/orden'
import type { PagoLineaInput } from '../schemas/pago'

export const MAX_LINEAS_PAGO = 3

// Borrador de una línea de pago mientras se edita en un formulario: `monto` es un string de
// dígitos crudos (convención de CurrencyInput), no un número. Lo consume el componente
// `PagoLineas` (src/components/layout/PagoLineas.tsx).
export interface PagoLineaBorrador {
  metodo: MetodoPagoBase
  monto: string
  referencia: string
}

export function nuevaLineaBorrador(monto = 0): PagoLineaBorrador {
  return { metodo: 'efectivo', monto: monto > 0 ? String(monto) : '', referencia: '' }
}

export function sumaBorrador(lineas: PagoLineaBorrador[]): number {
  return lineas.reduce((s, l) => s + (Number(l.monto) || 0), 0)
}

// Convierte líneas ya cuadradas a la forma que consume la RPC. No valida — el llamador debe
// haber comprobado `pagoLineasCuadra` antes.
export function borradorAPagos(lineas: PagoLineaBorrador[]): PagoLineaInput[] {
  return lineas.map((l) => ({
    metodo: l.metodo,
    monto: Number(l.monto) || 0,
    referencia: l.referencia.trim() || undefined,
  }))
}

export function pagosABorrador(
  pagos: { metodoPago: MetodoPagoBase; monto: number; referenciaPago?: string }[],
): PagoLineaBorrador[] {
  if (pagos.length === 0) return [nuevaLineaBorrador()]
  return pagos.map((p) => ({ metodo: p.metodoPago, monto: String(p.monto), referencia: p.referenciaPago ?? '' }))
}

function refFalta(l: PagoLineaBorrador): boolean {
  return (l.metodo === 'transferencia' || l.metodo === 'datafono') && !l.referencia.trim()
}

// ¿El reparto está listo para enviar? Suma exacta al total, entre 1 y 3 líneas, cada monto > 0 y
// toda línea de transferencia/datáfono con referencia.
export function pagoLineasCuadra(lineas: PagoLineaBorrador[], total: number): boolean {
  if (lineas.length < 1 || lineas.length > MAX_LINEAS_PAGO) return false
  if (lineas.some((l) => (Number(l.monto) || 0) <= 0)) return false
  if (lineas.some(refFalta)) return false
  return sumaBorrador(lineas) === total
}
