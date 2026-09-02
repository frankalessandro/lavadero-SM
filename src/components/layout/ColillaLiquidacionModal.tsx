import { X } from 'lucide-react'
import { createPortal } from 'react-dom'
import type { DesgloseCategoria, DesgloseVehiculos } from '../../data/liquidaciones'

export interface ColillaLiquidacionData {
  lavadorNombre: string
  periodoInicio: string
  periodoFin: string
  desglose: DesgloseVehiculos
  monto: number
  generadaEn: string
}

const COP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })
const FECHA = new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium' })
const FECHA_HORA = new Intl.DateTimeFormat('es-CO', { dateStyle: 'short', timeStyle: 'short' })

// "Diaria del 23 ago 2026" / "Semanal · 17 ago 2026 → 23 ago 2026" — periodoInicio===periodoFin
// es exactamente el criterio que ya usa rangoPorPeriodicidad en admin/liquidaciones para generar
// diaria (un solo día) vs semanal (rango). La hora exacta de generación (generadaEn, aparte) es
// lo que distingue dos diarias del MISMO día si el admin liquidó más de una vez esa fecha.
function periodoLabel(inicio: string, fin: string): string {
  if (inicio === fin) return `Diaria del ${FECHA.format(new Date(`${inicio}T00:00:00`))}`
  return `Semanal · ${FECHA.format(new Date(`${inicio}T00:00:00`))} → ${FECHA.format(new Date(`${fin}T00:00:00`))}`
}

// Colilla de liquidación para el lavador — mismo patrón que ReciboModal/TiquetePrint (pantalla +
// portal a document.body para la impresora térmica de 58mm, ver src/styles/tiquete-print.css):
// desglosa cuántos carros y cuántas motos hizo en el periodo, y DENTRO de cada uno cuántos fueron
// de cada combo (no solo "5 carros" — cuántos Combo 1, cuántos Combo 6, etc.), no solo el total.
// Se usa recién generada la liquidación (Admin > Liquidaciones) y también para reimprimir
// cualquiera del histórico.
export function ColillaLiquidacionModal({ colilla, onClose }: { colilla: ColillaLiquidacionData; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-neutral-900/40 p-4 backdrop-blur-[2px]">
      <div className="custom-scroll max-h-[90vh] w-full max-w-sm overflow-y-auto rounded-2xl bg-white p-6 shadow-card-hover">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-neutral-900">Colilla de liquidación</h3>
            <p className="text-xs text-neutral-500">
              {colilla.lavadorNombre} · {periodoLabel(colilla.periodoInicio, colilla.periodoFin)}
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

        <div className="flex flex-col gap-4 text-sm">
          <DesgloseCategoriaBloque label="Carros" categoria={colilla.desglose.autos} />
          <DesgloseCategoriaBloque label="Motos" categoria={colilla.desglose.motos} />
        </div>

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

function DesgloseCategoriaBloque({ label, categoria }: { label: string; categoria: DesgloseCategoria }) {
  if (categoria.cantidad === 0) return null
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
          {label} ({categoria.cantidad})
        </span>
        <span className="text-sm font-semibold text-neutral-900">{COP.format(categoria.monto)}</span>
      </div>
      <div className="flex flex-col gap-1 rounded-lg bg-neutral-50 p-2.5">
        {categoria.porCombo.map((item) => (
          <div key={item.comboNombre} className="flex items-center justify-between gap-3 text-xs">
            <span className="text-neutral-600">
              {item.comboNombre} <span className="text-neutral-400">×{item.cantidad}</span>
            </span>
            <span className="font-medium text-neutral-800">{COP.format(item.monto)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// Marcado plano fuera de Tailwind, igual criterio que TiquetePrint.tsx (ver esa nota) — se porta
// a document.body para que @media print pueda ocultar #root entero sin dejar hueco en blanco.
function ColillaPrint({ colilla }: { colilla: ColillaLiquidacionData }) {
  const totalVehiculos = colilla.desglose.autos.cantidad + colilla.desglose.motos.cantidad
  return createPortal(
    <div className="tiquete-58">
      <p className="tiquete-58__marca">Carwash SM</p>
      <p className="tiquete-58__tagline">Lavadero · Parqueadero</p>
      <p className="tiquete-58__titulo">Colilla de liquidación</p>

      <div className="tiquete-58__linea-solida" />

      <div className="tiquete-58__fila">
        <span className="tiquete-58__fila-label">Lavador</span>
        <span className="tiquete-58__fila-valor">{colilla.lavadorNombre}</span>
      </div>
      <div className="tiquete-58__fila">
        <span className="tiquete-58__fila-label">Periodo</span>
        <span className="tiquete-58__fila-valor">{periodoLabel(colilla.periodoInicio, colilla.periodoFin)}</span>
      </div>
      <div className="tiquete-58__fila">
        <span className="tiquete-58__fila-label">Generada</span>
        <span className="tiquete-58__fila-valor">{FECHA_HORA.format(new Date(colilla.generadaEn))}</span>
      </div>

      <div className="tiquete-58__linea" />

      <p className="tiquete-58__seccion">Desglose ({totalVehiculos} vehículo{totalVehiculos === 1 ? '' : 's'})</p>
      <ColillaPrintCategoria label="Carros" categoria={colilla.desglose.autos} />
      <ColillaPrintCategoria label="Motos" categoria={colilla.desglose.motos} />

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

function ColillaPrintCategoria({ label, categoria }: { label: string; categoria: DesgloseCategoria }) {
  if (categoria.cantidad === 0) return null
  return (
    <>
      <div className="tiquete-58__fila">
        <span className="tiquete-58__fila-label">{label} ({categoria.cantidad})</span>
        <span className="tiquete-58__fila-valor">{COP.format(categoria.monto)}</span>
      </div>
      {categoria.porCombo.map((item) => (
        <div className="tiquete-58__fila" key={item.comboNombre}>
          <span className="tiquete-58__fila-label">&nbsp;&nbsp;{item.comboNombre} ×{item.cantidad}</span>
          <span className="tiquete-58__fila-valor">{COP.format(item.monto)}</span>
        </div>
      ))}
    </>
  )
}
