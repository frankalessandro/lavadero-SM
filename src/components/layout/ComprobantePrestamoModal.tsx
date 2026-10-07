import { Printer, X } from 'lucide-react'
import { createPortal } from 'react-dom'
import { BloqueFirma, Fila } from './ComprobanteEgresoModal'
import { EncabezadoTiquete } from './EncabezadoTiquete'
import { useAjustesNegocio } from '../../lib/useAjustesNegocio'

const COP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })
const FECHA_HORA = new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short' })

export interface ComprobantePrestamoData {
  id: string
  monto: number
  creadoEn: string
  /** Quien recibe el dinero (lavador, jefe de patio o gerencia). */
  prestatarioNombre: string
  prestatarioRol: string
  /** Jefe de patio a cargo del turno que entrega el dinero. */
  jefePatioNombre: string
  motivo?: string
}

// Referencia corta y estable derivada del id — no hay consecutivo de préstamos en BD (mismo criterio
// que el comprobante de egreso).
const referencia = (id: string) => `PRE-${id.slice(0, 8).toUpperCase()}`

// Comprobante de préstamo en efectivo para firmar (respaldo legal): monto, quien entrega (jefe de
// patio del turno) y quien recibe, cada uno con su firma. Térmica 58mm, mismo patrón pantalla +
// portal que ComprobanteEgresoModal.
export function ComprobantePrestamoModal({ data, onClose }: { data: ComprobantePrestamoData; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-neutral-900/40 backdrop-blur-[2px] sm:items-center sm:p-4">
      <div className="custom-scroll max-h-[92vh] sm:max-h-[90vh] w-full max-w-sm overflow-y-auto rounded-t-3xl sm:rounded-2xl bg-white p-6 shadow-card-hover">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-neutral-900">Comprobante de préstamo</h3>
            <p className="text-xs text-neutral-500">{referencia(data.id)}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="flex size-8 shrink-0 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-neutral-100"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex flex-col gap-2 text-sm">
          <Campo label="Fecha" valor={FECHA_HORA.format(new Date(data.creadoEn))} />
          <Campo label="Recibe" valor={`${data.prestatarioNombre} · ${data.prestatarioRol}`} />
          <Campo label="Entrega (jefe de patio)" valor={data.jefePatioNombre} />
          {data.motivo ? <Campo label="Motivo" valor={data.motivo} /> : null}
        </div>

        <div className="mt-3 flex items-center justify-between rounded-lg bg-primary-50 px-3 py-2.5 text-sm">
          <span className="font-medium text-primary-900">Valor prestado</span>
          <span className="text-lg font-bold text-primary-700">{COP.format(data.monto)}</span>
        </div>

        <p className="mt-3 text-[11px] leading-relaxed text-neutral-400">
          Al imprimir quedan espacios para la firma del jefe de patio y de quien recibe el dinero.
        </p>

        <button
          type="button"
          onClick={() => window.print()}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border border-neutral-200 py-3 text-sm font-semibold text-neutral-700 transition-colors hover:bg-neutral-50"
        >
          <Printer size={16} />
          Imprimir comprobante
        </button>
        <button
          type="button"
          onClick={onClose}
          className="mt-2.5 w-full rounded-xl bg-primary-600 py-3 text-sm font-semibold text-white shadow-nav-active transition-colors hover:bg-primary-700"
        >
          Cerrar
        </button>
        <p className="mt-2.5 text-center text-[11px] text-neutral-400">Impresión pensada para POS térmica de 58mm.</p>
      </div>
      <ComprobantePrestamoPrint data={data} />
    </div>
  )
}

function Campo({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-neutral-100 pb-2 last:border-0 last:pb-0">
      <span className="text-xs font-medium uppercase tracking-wide text-neutral-500">{label}</span>
      <span className="text-right font-medium text-neutral-900">{valor}</span>
    </div>
  )
}

function ComprobantePrestamoPrint({ data }: { data: ComprobantePrestamoData }) {
  const negocio = useAjustesNegocio()
  return createPortal(
    <div className="tiquete-58">
      <EncabezadoTiquete titulo="Comprobante de préstamo" />

      <div className="tiquete-58__linea-solida" />

      <Fila label="No." valor={referencia(data.id)} />
      <Fila label="Fecha" valor={FECHA_HORA.format(new Date(data.creadoEn))} />
      {data.motivo ? (
        <>
          <p className="tiquete-58__fila-label">Motivo</p>
          <p className="tiquete-58__texto">{data.motivo}</p>
        </>
      ) : null}

      <div className="tiquete-58__linea-solida" />

      <div className="tiquete-58__total">
        <span>VALOR PRESTADO</span>
        <span>{COP.format(data.monto)}</span>
      </div>

      <div className="tiquete-58__linea" />

      <p className="tiquete-58__texto">
        Recibo de {negocio.nombre} la suma de {COP.format(data.monto)} en efectivo, como préstamo que me comprometo a pagar.
      </p>

      <BloqueFirma rol="Entrega (jefe de patio)" nombre={data.jefePatioNombre} />
      <BloqueFirma rol={`Recibe (${data.prestatarioRol})`} nombre={data.prestatarioNombre} />

      <p className="tiquete-58__pie-legal">Comprobante interno de préstamo</p>
    </div>,
    document.body,
  )
}
