import { Receipt } from 'lucide-react'
import type { MetodoPago, MetodoPagoBase } from '../../schemas/orden'
import { METODO_PAGO_LABEL } from '../../lib/metodoPago'
import { TiquetePrint } from './TiquetePrint'
import { ComprobanteDesglose, ComprobanteModal, type DatoComprobante } from './ComprobanteModal'

export interface ReciboData {
  consecutivo: number
  placa: string
  clienteNombre: string
  comboNombre: string
  serviciosAdicionales?: string[]
  tipoNombre: string
  lavadorNombre: string
  // "Lavar entre 2" — presente solo cuando la orden tiene segundo lavador.
  lavadorNombre2?: string
  // Productos de nevera cargados al vehículo y cobrados en la misma factura. Presente solo
  // cuando la orden llevaba productos; `precioLavado` es el subtotal del lavado (sin productos)
  // y `precio` pasa a ser el total combinado.
  productos?: { nombre: string; cantidad: number; total: number }[]
  precioLavado?: number
  // Descuento sobre el lavado, absorbido por el negocio. `precioLavado` es el precio de lista y
  // `precio` el total ya con el descuento restado.
  descuento?: number
  descuentoMotivo?: string
  precio: number
  fecha: string
  // Fuerza la variante "pago" aunque no haya método (cortesía total: entregado, cobrado $0).
  entregada?: boolean
  // Etiqueta-resumen ('mixto' si el cobro se repartió). El desglose real va en `pagos`.
  metodoPago?: MetodoPago
  referenciaPago?: string
  // Reparto del cobro cuando fue pago partido (más de un método). Si viene, se itemiza en vez de
  // mostrar un único "Método de pago".
  pagos?: { metodo: MetodoPagoBase; monto: number; referencia?: string }[]
}

const COP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })
const FECHA_HORA = new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short' })

// Comprobante del lavado: mismo diseño en recepción (comprobante de ingreso, sin cobro todavía) y
// en el tablero de jefe de patio (comprobante de pago, al entregar). Vista con ComprobanteModal;
// lo que se imprime es TiquetePrint.
export function ReciboModal({
  recibo,
  variant,
  onClose,
  closeLabel,
  autoPrint,
}: {
  recibo: ReciboData
  variant: 'ingreso' | 'pago'
  onClose: () => void
  closeLabel?: string
  /** Dispara `window.print()` apenas se monta el modal — para no depender del clic manual en
   * "Imprimir tiquete" (ej. al confirmar un cobro). El navegador igual muestra su diálogo de
   * impresión salvo que Chrome corra con `--kiosk-printing` (impresión silenciosa a la
   * impresora por defecto, configuración típica de un POS/tablet dedicado). */
  autoPrint?: boolean
}) {
  const esPago = variant === 'pago'
  const partido = esPago && recibo.pagos && recibo.pagos.length > 1
  const conDetalle = (recibo.productos && recibo.productos.length > 0) || Boolean(recibo.descuento)

  const datos: DatoComprobante[] = [
    { label: 'Placa', valor: recibo.placa, mono: true },
    { label: 'Cliente', valor: recibo.clienteNombre },
    { label: 'Vehículo', valor: recibo.tipoNombre },
    { label: 'Combo', valor: recibo.comboNombre },
    {
      label: recibo.lavadorNombre2 ? 'Lavadores' : 'Lavador',
      valor: recibo.lavadorNombre2 ? `${recibo.lavadorNombre} + ${recibo.lavadorNombre2}` : recibo.lavadorNombre,
    },
    { label: esPago ? 'Entregado' : 'Ingreso', valor: FECHA_HORA.format(new Date(recibo.fecha)) },
  ]
  if (recibo.serviciosAdicionales && recibo.serviciosAdicionales.length > 0) {
    datos.splice(4, 0, { label: 'Adicionales', valor: recibo.serviciosAdicionales.join(', '), ancho: true })
  }
  if (esPago && !partido && recibo.metodoPago) {
    datos.push({ label: 'Método de pago', valor: METODO_PAGO_LABEL[recibo.metodoPago] })
    if (recibo.referenciaPago) datos.push({ label: 'Referencia', valor: recibo.referenciaPago })
  }

  return (
    <ComprobanteModal
      titulo={esPago ? 'Comprobante de pago' : 'Comprobante de ingreso'}
      referencia={`LAV-${recibo.consecutivo}`}
      icon={Receipt}
      tono={esPago ? 'success' : 'primary'}
      total={{
        label: !esPago ? 'Precio' : recibo.precio === 0 ? 'Cortesía' : 'Total pagado',
        valor: COP.format(recibo.precio),
        nota: !esPago
          ? 'Se cobra al entregar el vehículo, no ahora.'
          : recibo.precio === 0
            ? 'Vehículo entregado — cortesía, no se cobró.'
            : 'Vehículo entregado — pago confirmado.',
      }}
      datos={datos}
      imprimirLabel="Imprimir tiquete"
      cerrarLabel={closeLabel ?? (esPago ? 'Listo' : 'Registrar otro vehículo')}
      onClose={onClose}
      autoPrint={autoPrint}
      impresion={<TiquetePrint recibo={recibo} variant={variant} />}
    >
      {conDetalle ? (
        <ComprobanteDesglose
          titulo="Detalle"
          lineas={[
            { label: 'Lavado', valor: COP.format(recibo.precioLavado ?? recibo.precio) },
            ...(recibo.descuento
              ? [
                  {
                    label: recibo.descuentoMotivo ? `Descuento · ${recibo.descuentoMotivo}` : 'Descuento',
                    valor: `−${COP.format(recibo.descuento)}`,
                    tenue: true,
                  },
                ]
              : []),
            ...(recibo.productos ?? []).map((p) => ({ label: `${p.nombre} ×${p.cantidad}`, valor: COP.format(p.total) })),
          ]}
        />
      ) : null}
      {partido ? (
        <ComprobanteDesglose
          titulo="Pago partido"
          lineas={(recibo.pagos ?? []).map((p) => ({
            label: p.referencia ? `${METODO_PAGO_LABEL[p.metodo]} · ${p.referencia}` : METODO_PAGO_LABEL[p.metodo],
            valor: COP.format(p.monto),
          }))}
        />
      ) : null}
    </ComprobanteModal>
  )
}
