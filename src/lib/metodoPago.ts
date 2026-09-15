import type { MetodoPago } from '../schemas/orden'

// Label compartido entre los flujos de cobro (lavados, ventas de productos, parqueadero) —
// 'datafono' necesita la tilde que un simple `capitalize` de CSS no puede poner. 'mixto' es la
// etiqueta-resumen de un cobro repartido en varios métodos (el detalle real vive en `pagos`).
export const METODO_PAGO_LABEL: Record<MetodoPago, string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  datafono: 'Datáfono',
  mixto: 'Mixto',
  // Solo aplica a ventas (0065): producto de nevera cargado a la liquidación de un lavador en vez
  // de cobrado en plata — nunca aparece como método real de una orden.
  cuenta_lavador: 'Cargado a trabajador',
}
