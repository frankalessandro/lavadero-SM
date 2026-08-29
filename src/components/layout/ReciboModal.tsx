import { useEffect, useRef } from 'react'
import type { MetodoPago, MetodoPagoBase } from '../../schemas/orden'
import { METODO_PAGO_LABEL } from '../../lib/metodoPago'
import logoMark from '../../assets/logo-mark.png'
import { TiquetePrint } from './TiquetePrint'

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
  precio: number
  fecha: string
  // Etiqueta-resumen ('mixto' si el cobro se repartió). El desglose real va en `pagos`.
  metodoPago?: MetodoPago
  referenciaPago?: string
  // Reparto del cobro cuando fue pago partido (más de un método). Si viene, se itemiza en vez de
  // mostrar un único "Método de pago".
  pagos?: { metodo: MetodoPagoBase; monto: number; referencia?: string }[]
}

const COP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })
const FECHA_HORA = new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short' })

// Comprobante compartido: mismo diseño en recepción (comprobante de ingreso, sin cobro
// todavía) y en el dashboard de jefe de zona (comprobante de pago, al entregar).
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

  // Guarda contra el doble-invoke de efectos de StrictMode en desarrollo (monta→limpia→monta):
  // sin esto, `window.print()` se disparaba dos veces seguidas cada vez que se abría el recibo
  // con autoPrint. El ref persiste entre ese doble ciclo porque es la misma instancia del
  // componente, así que solo la primera invocación imprime.
  const impresoRef = useRef(false)

  useEffect(() => {
    if (autoPrint && !impresoRef.current) {
      impresoRef.current = true
      window.print()
    }
    // Solo al montar — cada apertura del modal es una instancia nueva (recibo cambia de
    // identidad), no queremos reimprimir si algo más en el componente cambia después.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-neutral-900/50 p-0 backdrop-blur-sm sm:items-center sm:p-6">
      <div className="flex max-h-full w-full max-w-sm flex-col overflow-y-auto rounded-t-2xl bg-white shadow-card-hover sm:rounded-2xl">
        <div className={`h-2 ${esPago ? 'bg-success-600' : 'bg-primary-600'}`} />
        <div className="flex flex-col items-center gap-1.5 px-6 pt-6 pb-4 text-center">
          <img src={logoMark} alt="Carwash SM" className="size-11 shrink-0 object-contain" />
          <p className="mt-1 text-sm font-semibold text-neutral-900">Carwash SM</p>
          <p className="text-xs text-neutral-400">{esPago ? 'Comprobante de pago' : 'Comprobante de ingreso'}</p>
        </div>

        <div className="flex flex-col items-center gap-0.5 border-y border-dashed border-neutral-200 bg-neutral-50 px-6 py-4">
          <span className="text-xs font-medium uppercase tracking-wide text-neutral-400">Número de referencia</span>
          <span className="font-mono text-lg font-semibold text-primary-700">LAV-{recibo.consecutivo}</span>
        </div>

        <div className="flex flex-col gap-2.5 px-6 py-5 text-sm">
          <ReciboRow label="Placa" value={recibo.placa} mono />
          <ReciboRow label="Cliente" value={recibo.clienteNombre} />
          <ReciboRow label="Tipo de vehículo" value={recibo.tipoNombre} />
          <ReciboRow label="Combo" value={recibo.comboNombre} />
          {recibo.serviciosAdicionales && recibo.serviciosAdicionales.length > 0 ? (
            <ReciboRow label="Adicionales" value={recibo.serviciosAdicionales.join(', ')} />
          ) : null}
          <ReciboRow
            label={recibo.lavadorNombre2 ? 'Lavadores asignados' : 'Lavador asignado'}
            value={recibo.lavadorNombre2 ? `${recibo.lavadorNombre} + ${recibo.lavadorNombre2}` : recibo.lavadorNombre}
          />
          {esPago && recibo.pagos && recibo.pagos.length > 1 ? (
            <div className="mt-1 flex flex-col gap-1.5 rounded-lg bg-neutral-50 px-3 py-2.5">
              <span className="text-xs font-medium uppercase tracking-wide text-neutral-400">Pago partido</span>
              {recibo.pagos.map((p, i) => (
                <ReciboRow
                  key={i}
                  label={p.referencia ? `${METODO_PAGO_LABEL[p.metodo]} · ${p.referencia}` : METODO_PAGO_LABEL[p.metodo]}
                  value={COP.format(p.monto)}
                />
              ))}
            </div>
          ) : esPago && recibo.metodoPago ? (
            <ReciboRow label="Método de pago" value={METODO_PAGO_LABEL[recibo.metodoPago]} />
          ) : null}
          {esPago && (!recibo.pagos || recibo.pagos.length <= 1) && recibo.referenciaPago ? (
            <ReciboRow label="Referencia" value={recibo.referenciaPago} />
          ) : null}
          <ReciboRow label={esPago ? 'Fecha de entrega' : 'Fecha de ingreso'} value={FECHA_HORA.format(new Date(recibo.fecha))} />

          {recibo.productos && recibo.productos.length > 0 ? (
            <div className="mt-1 flex flex-col gap-1.5 rounded-lg bg-neutral-50 px-3 py-2.5">
              <ReciboRow label="Lavado" value={COP.format(recibo.precioLavado ?? recibo.precio)} />
              {recibo.productos.map((p, i) => (
                <ReciboRow key={i} label={`${p.nombre} ×${p.cantidad}`} value={COP.format(p.total)} />
              ))}
            </div>
          ) : null}

          <div
            className={`mt-1 flex items-center justify-between rounded-lg px-3 py-3 ${esPago ? 'bg-success-50' : 'bg-primary-50'}`}
          >
            <span className={`text-sm font-medium ${esPago ? 'text-success-900' : 'text-primary-900'}`}>
              {esPago ? 'Total pagado' : 'Precio'}
            </span>
            <span className={`text-xl font-bold ${esPago ? 'text-success-700' : 'text-primary-700'}`}>
              {COP.format(recibo.precio)}
            </span>
          </div>
          <p className="text-center text-xs text-neutral-400">
            {esPago ? 'Vehículo entregado — pago confirmado.' : 'Se cobra al entregar el vehículo, no ahora.'}
          </p>
        </div>

        <div className="relative border-t border-dashed border-neutral-200 px-6 pt-4 pb-6">
          <div className="pointer-events-none absolute inset-x-0 -top-1.5 flex justify-between px-4">
            {Array.from({ length: 12 }).map((_, i) => (
              <span key={i} className="size-3 rounded-full bg-neutral-50" />
            ))}
          </div>
          <button
            type="button"
            onClick={() => window.print()}
            className="w-full rounded-lg border border-neutral-200 py-3 text-sm font-semibold text-neutral-700 transition-colors hover:bg-neutral-50"
          >
            Imprimir tiquete
          </button>
          <button
            type="button"
            onClick={onClose}
            className={`mt-2.5 w-full rounded-lg py-3.5 text-sm font-semibold text-white shadow-nav-active transition-colors ${
              esPago ? 'bg-success-600 hover:bg-success-700' : 'bg-primary-600 hover:bg-primary-700'
            }`}
          >
            {closeLabel ?? (esPago ? 'Listo' : 'Registrar otro vehículo')}
          </button>
          <p className="mt-2.5 text-center text-[11px] text-neutral-400">
            Impresión pensada para POS térmica de 58mm.
          </p>
        </div>
      </div>
      <TiquetePrint recibo={recibo} variant={variant} />
    </div>
  )
}

function ReciboRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="shrink-0 text-neutral-500">{label}</span>
      <span className={`min-w-0 truncate text-right font-medium text-neutral-900 ${mono ? 'font-mono' : ''}`}>
        {value}
      </span>
    </div>
  )
}
