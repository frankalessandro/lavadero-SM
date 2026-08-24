import type { MetodoPago } from '../schemas/orden'

// Label compartido entre los tres flujos de cobro (lavados, ventas de productos, parqueadero) —
// 'datafono' necesita la tilde que un simple `capitalize` de CSS no puede poner.
export const METODO_PAGO_LABEL: Record<MetodoPago, string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  datafono: 'Datáfono',
}
