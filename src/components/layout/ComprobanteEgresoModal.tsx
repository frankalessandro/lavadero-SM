import { Printer, X } from 'lucide-react'
import { createPortal } from 'react-dom'
import type { GastoConCategoria } from '../../data/gastos'
import logoIsotipo from '../../assets/logo-isotipo.png'

const COP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })
const FECHA = new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium' })
const FECHA_HORA = new Intl.DateTimeFormat('es-CO', { dateStyle: 'short', timeStyle: 'short' })

// Referencia corta y estable para el comprobante — no hay consecutivo de gastos en BD (a
// diferencia de LAV-/VTA-, ver CLAUDE.md), así que se deriva del id (uuid) en vez de inventar
// una numeración que no existe en el dato real.
function referencia(gasto: GastoConCategoria): string {
  return `EGR-${gasto.id.slice(0, 8).toUpperCase()}`
}

// Comprobante de egreso para un gasto ya registrado — mismo patrón pantalla + portal a
// document.body que ReciboModal/ColillaLiquidacionModal, térmica de 58mm, con bloques de firma
// para quien emite y quien recibe.
export function ComprobanteEgresoModal({ gasto, onClose }: { gasto: GastoConCategoria; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-neutral-900/40 p-4 backdrop-blur-[2px]">
      <div className="custom-scroll max-h-[90vh] w-full max-w-sm overflow-y-auto rounded-2xl bg-white p-6 shadow-card-hover">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-neutral-900">Comprobante de egreso</h3>
            <p className="text-xs text-neutral-500">{referencia(gasto)}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex size-8 shrink-0 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-neutral-100"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex flex-col gap-3 text-sm">
          <CampoResumen label="Fecha" valor={FECHA.format(new Date(`${gasto.fecha}T00:00:00`))} />
          <CampoResumen label="Categoría" valor={gasto.categoriaNombre} />
          <CampoResumen label="Descripción" valor={gasto.descripcion} />
          <CampoResumen label="Responsable" valor={gasto.responsable} />
          <CampoResumen label="Origen" valor={gasto.origen === 'caja' ? 'Caja' : 'Otro'} />
        </div>

        <div className="mt-3 flex items-center justify-between rounded-lg bg-primary-50 px-3 py-2.5 text-sm">
          <span className="font-medium text-primary-900">Monto del egreso</span>
          <span className="text-lg font-bold text-primary-700">{COP.format(gasto.monto)}</span>
        </div>

        <p className="mt-3 text-[11px] leading-relaxed text-neutral-400">
          Al imprimir se deja espacio en blanco para la firma de quien emite el egreso y de quien lo recibe.
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
          className="mt-2.5 w-full rounded-lg bg-primary-600 py-3 text-sm font-semibold text-white shadow-nav-active transition-colors hover:bg-primary-700"
        >
          Cerrar
        </button>
        <p className="mt-2.5 text-center text-[11px] text-neutral-400">Impresión pensada para POS térmica de 58mm.</p>
      </div>
      <ComprobanteEgresoPrint gasto={gasto} />
    </div>
  )
}

function CampoResumen({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-neutral-100 pb-2 last:border-0 last:pb-0">
      <span className="text-xs font-medium uppercase tracking-wide text-neutral-500">{label}</span>
      <span className="text-right font-medium text-neutral-900">{valor}</span>
    </div>
  )
}

// Marcado plano fuera de Tailwind para la térmica de 58mm (clases .tiquete-58__*, ver
// src/styles/tiquete-print.css) — se porta a document.body para que @media print oculte #root.
function ComprobanteEgresoPrint({ gasto }: { gasto: GastoConCategoria }) {
  return createPortal(
    <div className="tiquete-58">
      <img src={logoIsotipo} alt="" className="tiquete-58__logo" />
      <p className="tiquete-58__tagline">Lavadero · Parqueadero</p>
      <p className="tiquete-58__nit-titulo">NIT 1113661734-4 · Comprobante de egreso</p>

      <div className="tiquete-58__linea-solida" />

      <Fila label="No." valor={referencia(gasto)} />
      <Fila label="Fecha" valor={FECHA.format(new Date(`${gasto.fecha}T00:00:00`))} />
      <Fila label="Registrado" valor={FECHA_HORA.format(new Date(gasto.creadoEn))} />

      <div className="tiquete-58__linea" />

      <p className="tiquete-58__seccion">Detalle</p>
      <Fila label="Categoría" valor={gasto.categoriaNombre} />
      <Fila label="Origen" valor={gasto.origen === 'caja' ? 'Caja' : 'Otro'} />
      <p className="tiquete-58__fila-label">Concepto</p>
      <p className="tiquete-58__texto">{gasto.descripcion}</p>

      <div className="tiquete-58__linea-solida" />

      <div className="tiquete-58__total">
        <span>TOTAL</span>
        <span>{COP.format(gasto.monto)}</span>
      </div>

      <div className="tiquete-58__linea" />

      <BloqueFirma rol="Emite" nombre={gasto.responsable} />
      <BloqueFirma rol="Recibe" />

      <p className="tiquete-58__pie-legal">Comprobante interno de egreso</p>
    </div>,
    document.body,
  )
}

// Emite: Nombre / C.C. ____ / Firma / raya completa. Sin nombre, el nombre también queda en raya.
function BloqueFirma({ rol, nombre }: { rol: string; nombre?: string }) {
  return (
    <div className="tiquete-58__firma">
      <div className="tiquete-58__firma-campo">
        <span className="tiquete-58__firma-campo-label">{rol}:</span>
        {nombre ? (
          <span className="tiquete-58__firma-campo-valor">{nombre}</span>
        ) : (
          <span className="tiquete-58__raya" />
        )}
      </div>
      <div className="tiquete-58__firma-campo">
        <span className="tiquete-58__firma-campo-label">C.C.</span>
        <span className="tiquete-58__raya" />
      </div>
      <p className="tiquete-58__firma-label">Firma</p>
      <div className="tiquete-58__firma-espacio" />
    </div>
  )
}

function Fila({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="tiquete-58__fila">
      <span className="tiquete-58__fila-label">{label}</span>
      <span className="tiquete-58__fila-valor">{valor}</span>
    </div>
  )
}
