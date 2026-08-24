import { X } from 'lucide-react'
import { createPortal } from 'react-dom'

export interface ColillaJefeZonaData {
  responsable: string
  periodoInicio: string
  periodoFin: string
  cantidadOrdenes: number
  monto: number
  generadaEn: string
}

const COP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })
const FECHA = new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium' })
const FECHA_HORA = new Intl.DateTimeFormat('es-CO', { dateStyle: 'short', timeStyle: 'short' })

function periodoLabel(inicio: string, fin: string): string {
  if (inicio === fin) return `Diaria del ${FECHA.format(new Date(`${inicio}T00:00:00`))}`
  return `Semanal · ${FECHA.format(new Date(`${inicio}T00:00:00`))} → ${FECHA.format(new Date(`${fin}T00:00:00`))}`
}

// Colilla de liquidación del jefe de patio — mismo patrón pantalla+portal que
// ColillaLiquidacionModal (lavadores), pero sin desglose por combo/categoría: la comisión de
// jefe de patio es un porcentaje plano del total de cada orden durante su turno, no depende de
// qué combo fue cada vehículo.
export function ColillaJefeZonaModal({ colilla, onClose }: { colilla: ColillaJefeZonaData; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-neutral-900/40 p-4 backdrop-blur-[2px]">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-card-hover">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-neutral-900">Colilla de liquidación — jefe de patio</h3>
            <p className="text-xs text-neutral-500">
              {colilla.responsable} · {periodoLabel(colilla.periodoInicio, colilla.periodoFin)}
            </p>
            <p className="text-[11px] text-neutral-400">Generada {FECHA_HORA.format(new Date(colilla.generadaEn))}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex size-8 shrink-0 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-neutral-100"
          >
            <X size={18} />
          </button>
        </div>

        <p className="text-sm text-neutral-600">
          {colilla.cantidadOrdenes} orden{colilla.cantidadOrdenes === 1 ? '' : 'es'} registrada
          {colilla.cantidadOrdenes === 1 ? '' : 's'} con turno a cargo en el periodo.
        </p>

        <div className="mt-3 flex items-center justify-between rounded-lg bg-primary-50 px-3 py-2.5 text-sm">
          <span className="font-medium text-primary-900">Total liquidado</span>
          <span className="text-lg font-bold text-primary-700">{COP.format(colilla.monto)}</span>
        </div>

        <button
          type="button"
          onClick={() => window.print()}
          className="mt-4 w-full rounded-lg border border-neutral-200 py-3 text-sm font-semibold text-neutral-700 transition-colors hover:bg-neutral-50"
        >
          Imprimir colilla
        </button>
        <button
          type="button"
          onClick={onClose}
          className="mt-2.5 w-full rounded-lg bg-primary-600 py-3 text-sm font-semibold text-white shadow-nav-active transition-colors hover:bg-primary-700"
        >
          Cerrar
        </button>
        <p className="mt-2.5 text-center text-[11px] text-neutral-400">Impresión pensada para POS térmica de 58mm.</p>
      </div>
      <ColillaPrint colilla={colilla} />
    </div>
  )
}

function ColillaPrint({ colilla }: { colilla: ColillaJefeZonaData }) {
  return createPortal(
    <div className="tiquete-58">
      <p className="tiquete-58__marca">Carwash SM</p>
      <p className="tiquete-58__tagline">Lavadero · Parqueadero</p>
      <p className="tiquete-58__titulo">Colilla — jefe de patio</p>

      <div className="tiquete-58__linea-solida" />

      <div className="tiquete-58__fila">
        <span className="tiquete-58__fila-label">Responsable</span>
        <span className="tiquete-58__fila-valor">{colilla.responsable}</span>
      </div>
      <div className="tiquete-58__fila">
        <span className="tiquete-58__fila-label">Periodo</span>
        <span className="tiquete-58__fila-valor">{periodoLabel(colilla.periodoInicio, colilla.periodoFin)}</span>
      </div>
      <div className="tiquete-58__fila">
        <span className="tiquete-58__fila-label">Órdenes</span>
        <span className="tiquete-58__fila-valor">{colilla.cantidadOrdenes}</span>
      </div>
      <div className="tiquete-58__fila">
        <span className="tiquete-58__fila-label">Generada</span>
        <span className="tiquete-58__fila-valor">{FECHA_HORA.format(new Date(colilla.generadaEn))}</span>
      </div>

      <div className="tiquete-58__linea-solida" />

      <div className="tiquete-58__total">
        <span>TOTAL</span>
        <span>{COP.format(colilla.monto)}</span>
      </div>

      <div className="tiquete-58__linea" />

      <p className="tiquete-58__pie">Gracias por su trabajo</p>
    </div>,
    document.body,
  )
}
