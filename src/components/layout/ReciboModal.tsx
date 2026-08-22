import type { MetodoPago } from '../../schemas/orden'
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
  precio: number
  fecha: string
  metodoPago?: MetodoPago
  referenciaPago?: string
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
}: {
  recibo: ReciboData
  variant: 'ingreso' | 'pago'
  onClose: () => void
  closeLabel?: string
}) {
  const esPago = variant === 'pago'

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
          <ReciboRow label="Lavador asignado" value={recibo.lavadorNombre} />
          {esPago && recibo.metodoPago ? (
            <ReciboRow label="Método de pago" value={recibo.metodoPago === 'efectivo' ? 'Efectivo' : 'Transferencia'} />
          ) : null}
          {esPago && recibo.referenciaPago ? <ReciboRow label="Referencia" value={recibo.referenciaPago} /> : null}
          <ReciboRow label={esPago ? 'Fecha de entrega' : 'Fecha de ingreso'} value={FECHA_HORA.format(new Date(recibo.fecha))} />

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
