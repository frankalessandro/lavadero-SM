import { Wallet } from 'lucide-react'
import { createPortal } from 'react-dom'
import type { DesgloseCategoria, DesgloseVehiculos } from '../../data/liquidaciones'
import { fechaLocalISO } from '../../lib/periodo'
import { MarcaTiquete } from './EncabezadoTiquete'
import { ComprobanteDesglose, ComprobanteModal } from './ComprobanteModal'
import type { DescuentoDeuda } from '../../schemas/deudaPersonal'

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
  // 0089: la deuda pendiente partida en préstamos y tienda (nevera, incluida la cuenta abierta).
  deudaPrestamo?: number
  deudaTienda?: number
  // Solo en modo 'liquidacion' (corte real): lo acumulado en el periodo ANTES de descontar deuda
  // y cuánto se descontó en ESTE corte puntual (liquidaciones.comision_bruta/deuda_descontada) —
  // a diferencia de deudaPendiente/montoNeto arriba, que en modo informativo reflejan la deuda
  // total pendiente HOY, no lo descontado en un corte ya generado. Ausente/0 = sin descuento, no
  // se muestra la línea extra.
  comisionBruta?: number
  deudaDescontada?: number
  // Por bolsa (0089): lo descontado en ese corte y lo que seguía debiendo al generarlo.
  descontado?: DescuentoDeuda
  restante?: DescuentoDeuda
  // Solo en modo 'informativo': el corte sigue el filtro de periodo de la pantalla (día, semana o
  // mes) — cambia el título y los textos. Ausente = 'dia'.
  alcance?: 'dia' | 'semana' | 'mes'
}

function restanteTotal(colilla: ColillaLiquidacionData): number {
  return colilla.restante ? colilla.restante.prestamo + colilla.restante.tienda : 0
}

// Líneas "− Préstamos / − Tienda" de lo descontado en un corte real; sin desglose, una sola línea.
function lineasDescontado(colilla: ColillaLiquidacionData): [string, number][] {
  if (!colilla.descontado) return colilla.deudaDescontada ? [['Abonado a la deuda', colilla.deudaDescontada]] : []
  const lineas: [string, number][] = []
  if (colilla.descontado.prestamo > 0) lineas.push(['Abonado a préstamos', colilla.descontado.prestamo])
  if (colilla.descontado.tienda > 0) lineas.push(['Abonado a tienda', colilla.descontado.tienda])
  return lineas
}

// Líneas de deuda de la colilla informativa: préstamos y tienda por separado.
function lineasDeuda(colilla: ColillaLiquidacionData): [string, number][] {
  if (colilla.deudaPrestamo === undefined && colilla.deudaTienda === undefined) {
    return [['Debe (préstamos/tienda)', colilla.deudaPendiente ?? 0]]
  }
  const lineas: [string, number][] = []
  if (colilla.deudaPrestamo) lineas.push(['Debe préstamos', colilla.deudaPrestamo])
  if (colilla.deudaTienda) lineas.push(['Debe tienda', colilla.deudaTienda])
  return lineas
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

// Colilla de liquidación para el lavador — vista con ComprobanteModal; lo que se imprime es
// ColillaPrint (térmica 58mm, ver src/styles/tiquete-print.css). Desglosa cuántos carros y
// cuántas motos hizo en el periodo y, DENTRO de cada uno, cuántos fueron de cada combo (no solo
// "5 carros" — cuántos Combo 1, cuántos Combo 6, etc.). Se usa recién generada la liquidación
// (Admin > Liquidaciones), para reimprimir cualquiera del histórico y como colilla informativa.
export function ColillaLiquidacionModal({ colilla, onClose }: { colilla: ColillaLiquidacionData; onClose: () => void }) {
  const informativo = colilla.tipo === 'informativo'
  const totalVehiculos = colilla.desglose.autos.cantidad + colilla.desglose.motos.cantidad
  return (
    <ComprobanteModal
      titulo={informativo ? TITULO_INFORMATIVO[colilla.alcance ?? 'dia'] : 'Colilla de liquidación'}
      subtitulo={colilla.lavadorNombre}
      icon={Wallet}
      tono={informativo ? 'warning' : 'primary'}
      aviso={
        informativo
          ? `No es un pago — es solo para ver cómo va ${cuandoInformativo(colilla)}. El pago real se liquida semanal.`
          : undefined
      }
      total={{
        label: informativo ? `Ganado ${cuandoInformativo(colilla)} (sin liquidar aún)` : 'Total liquidado',
        valor: COP.format(colilla.monto),
      }}
      datos={[
        {
          label: informativo ? 'Corte' : 'Periodo',
          valor: informativo ? corteInformativo(colilla) : periodoLabel(colilla.periodoInicio, colilla.periodoFin),
          ancho: true,
        },
        { label: 'Vehículos', valor: String(totalVehiculos) },
        { label: 'Generada', valor: FECHA_HORA.format(new Date(colilla.generadaEn)) },
      ]}
      imprimirLabel="Imprimir colilla"
      onClose={onClose}
      impresion={<ColillaPrint colilla={colilla} />}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <DesgloseCategoriaBloque label="Carros" categoria={colilla.desglose.autos} />
        <DesgloseCategoriaBloque label="Motos" categoria={colilla.desglose.motos} />
      </div>

      {!informativo && (colilla.deudaDescontada || restanteTotal(colilla)) ? (
        <ComprobanteDesglose
          titulo="Deuda"
          lineas={[
            { label: 'Acumulado del periodo', valor: COP.format(colilla.comisionBruta ?? 0) },
            ...lineasDescontado(colilla).map(([label, valor]) => ({ label, valor: `−${COP.format(valor)}`, tenue: true })),
            ...(colilla.restante
              ? [
                  { label: 'Sigue debiendo · préstamos', valor: COP.format(colilla.restante.prestamo), tenue: true },
                  { label: 'Sigue debiendo · tienda', valor: COP.format(colilla.restante.tienda), tenue: true },
                ]
              : []),
          ]}
          total={{ label: 'Queda debiendo', valor: COP.format(restanteTotal(colilla)) }}
        />
      ) : null}

      {informativo && colilla.deudaPendiente ? (
        <ComprobanteDesglose
          titulo="Si se liquidara hoy"
          lineas={lineasDeuda(colilla).map(([label, valor]) => ({ label, valor: `−${COP.format(valor)}`, tenue: true }))}
          total={{ label: 'Le quedaría a favor', valor: COP.format(colilla.montoNeto ?? 0) }}
        />
      ) : null}
    </ComprobanteModal>
  )
}

function DesgloseCategoriaBloque({ label, categoria }: { label: string; categoria: DesgloseCategoria }) {
  if (categoria.cantidad === 0) return null
  return (
    <ComprobanteDesglose
      titulo={`${label} (${categoria.cantidad})`}
      lineas={categoria.porCombo.map((item) => ({ label: `${item.comboNombre} ×${item.cantidad}`, valor: COP.format(item.monto) }))}
      total={{ label: 'Subtotal', valor: COP.format(categoria.monto) }}
    />
  )
}

// Marcado plano fuera de Tailwind, igual criterio que TiquetePrint.tsx (ver esa nota) — se porta
// a document.body para que @media print pueda ocultar #root entero sin dejar hueco en blanco.
function ColillaPrint({ colilla }: { colilla: ColillaLiquidacionData }) {
  const totalVehiculos = colilla.desglose.autos.cantidad + colilla.desglose.motos.cantidad
  const informativo = colilla.tipo === 'informativo'
  return createPortal(
    <div className="tiquete-58">
      <MarcaTiquete />
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

      {!informativo && (colilla.deudaDescontada || restanteTotal(colilla)) ? (
        <>
          <div className="tiquete-58__fila">
            <span className="tiquete-58__fila-label">Acumulado del periodo</span>
            <span className="tiquete-58__fila-valor">{COP.format(colilla.comisionBruta ?? 0)}</span>
          </div>
          {lineasDescontado(colilla).map(([label, valor]) => (
            <div key={label} className="tiquete-58__fila">
              <span className="tiquete-58__fila-label">{label}</span>
              <span className="tiquete-58__fila-valor">−{COP.format(valor)}</span>
            </div>
          ))}
          {colilla.restante ? (
            <>
              <div className="tiquete-58__fila">
                <span className="tiquete-58__fila-label">Debe préstamos</span>
                <span className="tiquete-58__fila-valor">{COP.format(colilla.restante.prestamo)}</span>
              </div>
              <div className="tiquete-58__fila">
                <span className="tiquete-58__fila-label">Debe tienda</span>
                <span className="tiquete-58__fila-valor">{COP.format(colilla.restante.tienda)}</span>
              </div>
            </>
          ) : null}
          <div className="tiquete-58__linea" />
        </>
      ) : null}

      <div className="tiquete-58__total">
        <span>{informativo ? (colilla.alcance && colilla.alcance !== 'dia' ? TOTAL_IMPRESO[colilla.alcance] : `GANADO ${cuandoInformativo(colilla).toUpperCase()}`) : 'TOTAL'}</span>
        <span>{COP.format(colilla.monto)}</span>
      </div>

      {informativo && colilla.deudaPendiente ? (
        <>
          {lineasDeuda(colilla).map(([label, valor]) => (
            <div key={label} className="tiquete-58__fila">
              <span className="tiquete-58__fila-label">{label}</span>
              <span className="tiquete-58__fila-valor">−{COP.format(valor)}</span>
            </div>
          ))}
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
