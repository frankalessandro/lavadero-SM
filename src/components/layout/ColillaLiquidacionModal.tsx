import { X } from 'lucide-react'
import { createPortal } from 'react-dom'
import type { DesgloseCategoria, DesgloseVehiculos } from '../../data/liquidaciones'
import { fechaLocalISO } from '../../lib/periodo'

export interface ColillaLiquidacionData {
  lavadorNombre: string
  periodoInicio: string
  periodoFin: string
  desglose: DesgloseVehiculos
  monto: number
  generadaEn: string
  // 'liquidacion' (default) = corte real, ya generado — marcó las órdenes como liquidadas.
  // 'informativo' = "colilla del día" (2026-09-14): mismo cálculo que una diaria real
  // (fetchMontoPeriodo del día de hoy), pero SIN generar nada — no marca ninguna orden, no crea
  // fila en `liquidaciones`. Sirve para que el lavador vea cómo va mientras el pago real sigue
  // siendo semanal. Nunca debe poder confundirse con un pago real, de ahí el rótulo distinto acá
  // y en la impresión.
  tipo?: 'liquidacion' | 'informativo'
  // Solo en modo 'informativo' (0065): deuda pendiente del lavador AHORA MISMO (préstamos +
  // nevera, independiente del día que muestra la colilla) y lo que realmente le tocaría cobrar si
  // se liquidara ya — max(0, monto − deudaPendiente). Ausente/0 = sin deuda, no se muestra la
  // línea extra.
  deudaPendiente?: number
  montoNeto?: number
  // Solo en modo 'liquidacion' (corte real): lo acumulado en el periodo ANTES de descontar deuda
  // y cuánto se descontó en ESTE corte puntual (liquidaciones.comision_bruta/deuda_descontada) —
  // a diferencia de deudaPendiente/montoNeto arriba, que en modo informativo reflejan la deuda
  // total pendiente HOY, no lo descontado en un corte ya generado. Ausente/0 = sin descuento, no
  // se muestra la línea extra.
  comisionBruta?: number
  deudaDescontada?: number
  // Solo en modo 'informativo': el corte sigue el filtro de periodo de la pantalla (día, semana o
  // mes) — cambia el título y los textos. Ausente = 'dia'.
  alcance?: 'dia' | 'semana' | 'mes'
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

const TITULO_INFORMATIVO = { dia: 'Colilla del día', semana: 'Colilla de la semana', mes: 'Colilla del mes' } as const
const TOTAL_IMPRESO = { semana: 'GANADO EN LA SEMANA', mes: 'GANADO EN EL MES' } as const

const fechaDe = (dia: string) => FECHA.format(new Date(`${dia}T00:00:00`))

// La colilla informativa sigue el filtro de la pantalla, así que puede ser de hoy, de otro día, de
// una semana o de un mes: "Ganado hoy" en la de ayer o en la de una semana sería mentira.
// "hoy" / "el 19 sept 2026" / "del 14 sept 2026 al 20 sept 2026".
function cuandoInformativo(colilla: ColillaLiquidacionData): string {
  if ((colilla.alcance ?? 'dia') !== 'dia') return `del ${fechaDe(colilla.periodoInicio)} al ${fechaDe(colilla.periodoFin)}`
  return colilla.periodoInicio === fechaLocalISO(new Date()) ? 'hoy' : `el ${fechaDe(colilla.periodoInicio)}`
}

// "19 sept 2026" o "14 sept 2026 → 20 sept 2026" — el corte, para el subtítulo y el tiquete.
function corteInformativo(colilla: ColillaLiquidacionData): string {
  if ((colilla.alcance ?? 'dia') === 'dia') return fechaDe(colilla.periodoInicio)
  return `${fechaDe(colilla.periodoInicio)} → ${fechaDe(colilla.periodoFin)}`
}

// Colilla de liquidación para el lavador — mismo patrón que ReciboModal/TiquetePrint (pantalla +
// portal a document.body para la impresora térmica de 58mm, ver src/styles/tiquete-print.css):
// desglosa cuántos carros y cuántas motos hizo en el periodo, y DENTRO de cada uno cuántos fueron
// de cada combo (no solo "5 carros" — cuántos Combo 1, cuántos Combo 6, etc.), no solo el total.
// Se usa recién generada la liquidación (Admin > Liquidaciones) y también para reimprimir
// cualquiera del histórico.
export function ColillaLiquidacionModal({ colilla, onClose }: { colilla: ColillaLiquidacionData; onClose: () => void }) {
  const informativo = colilla.tipo === 'informativo'
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-neutral-900/40 p-4 backdrop-blur-[2px]">
      <div className="custom-scroll max-h-[90vh] w-full max-w-sm overflow-y-auto rounded-2xl bg-white p-6 shadow-card-hover">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-neutral-900">
              {informativo ? TITULO_INFORMATIVO[colilla.alcance ?? 'dia'] : 'Colilla de liquidación'}
            </h3>
            <p className="text-xs text-neutral-500">
              {colilla.lavadorNombre} · {informativo ? `Corte informativo · ${corteInformativo(colilla)}` : periodoLabel(colilla.periodoInicio, colilla.periodoFin)}
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

        {informativo ? (
          <p className="mb-4 rounded-lg bg-warning-50 px-3 py-2 text-xs text-warning-700">
            No es un pago — es solo para ver cómo va {cuandoInformativo(colilla)}. El pago real se liquida semanal.
          </p>
        ) : null}

        <div className="flex flex-col gap-4 text-sm">
          <DesgloseCategoriaBloque label="Carros" categoria={colilla.desglose.autos} />
          <DesgloseCategoriaBloque label="Motos" categoria={colilla.desglose.motos} />
        </div>

        {!informativo && colilla.deudaDescontada ? (
          <div className="flex flex-col gap-1 rounded-lg bg-neutral-50 px-3 py-2.5 text-xs text-neutral-600">
            <div className="flex items-center justify-between">
              <span>Acumulado del periodo</span>
              <span className="font-medium text-neutral-800">{COP.format(colilla.comisionBruta ?? 0)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Descuento (préstamos/nevera)</span>
              <span className="font-medium text-neutral-800">−{COP.format(colilla.deudaDescontada)}</span>
            </div>
          </div>
        ) : null}

        <div
          className={`mt-3 flex items-center justify-between rounded-lg px-3 py-2.5 text-sm ${informativo ? 'bg-warning-50' : 'bg-primary-50'}`}
        >
          <span className={`font-medium ${informativo ? 'text-warning-900' : 'text-primary-900'}`}>
            {informativo ? `Ganado ${cuandoInformativo(colilla)} (sin liquidar aún)` : 'Total liquidado'}
          </span>
          <span className={`text-lg font-bold ${informativo ? 'text-warning-700' : 'text-primary-700'}`}>
            {COP.format(colilla.monto)}
          </span>
        </div>

        {informativo && colilla.deudaPendiente ? (
          <div className="mt-2 flex flex-col gap-1 rounded-lg bg-neutral-50 px-3 py-2.5 text-xs text-neutral-600">
            <div className="flex items-center justify-between">
              <span>Debe (préstamos/nevera)</span>
              <span className="font-medium text-neutral-800">−{COP.format(colilla.deudaPendiente)}</span>
            </div>
            <div className="flex items-center justify-between border-t border-neutral-200 pt-1 font-medium text-neutral-900">
              <span>Le quedaría a favor</span>
              <span>{COP.format(colilla.montoNeto ?? 0)}</span>
            </div>
          </div>
        ) : null}

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
  const informativo = colilla.tipo === 'informativo'
  return createPortal(
    <div className="tiquete-58">
      <p className="tiquete-58__marca">Carwash SM</p>
      <p className="tiquete-58__tagline">Lavadero · Parqueadero</p>
      <p className="tiquete-58__titulo">{informativo ? `${TITULO_INFORMATIVO[colilla.alcance ?? 'dia']} (informativo)` : 'Colilla de liquidación'}</p>
      {informativo ? <p className="tiquete-58__tagline">*** NO ES UN PAGO — pago semanal ***</p> : null}

      <div className="tiquete-58__linea-solida" />

      <div className="tiquete-58__fila">
        <span className="tiquete-58__fila-label">Lavador</span>
        <span className="tiquete-58__fila-valor">{colilla.lavadorNombre}</span>
      </div>
      <div className="tiquete-58__fila">
        <span className="tiquete-58__fila-label">{informativo ? 'Corte' : 'Periodo'}</span>
        <span className="tiquete-58__fila-valor">
          {informativo ? corteInformativo(colilla) : periodoLabel(colilla.periodoInicio, colilla.periodoFin)}
        </span>
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

      {!informativo && colilla.deudaDescontada ? (
        <>
          <div className="tiquete-58__fila">
            <span className="tiquete-58__fila-label">Acumulado del periodo</span>
            <span className="tiquete-58__fila-valor">{COP.format(colilla.comisionBruta ?? 0)}</span>
          </div>
          <div className="tiquete-58__fila">
            <span className="tiquete-58__fila-label">Descuento (préstamos/nevera)</span>
            <span className="tiquete-58__fila-valor">−{COP.format(colilla.deudaDescontada)}</span>
          </div>
          <div className="tiquete-58__linea" />
        </>
      ) : null}

      <div className="tiquete-58__total">
        <span>{informativo ? (colilla.alcance && colilla.alcance !== 'dia' ? TOTAL_IMPRESO[colilla.alcance] : `GANADO ${cuandoInformativo(colilla).toUpperCase()}`) : 'TOTAL'}</span>
        <span>{COP.format(colilla.monto)}</span>
      </div>

      {informativo && colilla.deudaPendiente ? (
        <>
          <div className="tiquete-58__fila">
            <span className="tiquete-58__fila-label">Debe (préstamos/nevera)</span>
            <span className="tiquete-58__fila-valor">−{COP.format(colilla.deudaPendiente)}</span>
          </div>
          <div className="tiquete-58__fila">
            <span className="tiquete-58__fila-label">Le quedaría a favor</span>
            <span className="tiquete-58__fila-valor">{COP.format(colilla.montoNeto ?? 0)}</span>
          </div>
        </>
      ) : null}

      <div className="tiquete-58__linea" />

      {informativo ? (
        <p className="tiquete-58__pie">No es un pago — corte informativo. Se liquida semanal.</p>
      ) : (
        <p className="tiquete-58__pie">Gracias por su trabajo</p>
      )}
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
