import { db } from '../lib/db'
import { fetchOrdenesDeLavador } from './ordenes'
import { fetchPagosDeOrdenes } from './pagos'
import { fetchVentasDeOrdenes } from './ventas'
import { comisionParaLavador } from './liquidaciones'
import { fetchAsistenciasEnRango, fetchDiasDescanso } from './asistenciaLavadores'
import type { Orden } from '../schemas/orden'
import type { Pago } from '../schemas/pago'
import type { Venta } from '../schemas/venta'
import type { AsistenciaLavador } from '../schemas/asistencia'

function fechaLocalISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Resumen de TODOS los lavadores — para el ranking. Un solo fetch de las órdenes no anuladas.
// ─────────────────────────────────────────────────────────────────────────────────────────────

export interface ResumenLavador {
  servicios: number
  comisionGenerada: number
  tiempoPromedioSegundos: number | null
}

interface OrdenResumenRow {
  lavador_id: string | null
  lavador_id_2: string | null
  comision_lavador: number
  tiempo_lavado_segundos: number | null
  estado: string
}

export async function fetchResumenLavadores(): Promise<Map<string, ResumenLavador>> {
  const { data, error } = await db
    .from('ordenes')
    .select('lavador_id, lavador_id_2, comision_lavador, tiempo_lavado_segundos, estado')
    .neq('estado', 'anulada')
  if (error) throw new Error(error.message)

  const acc = new Map<string, { servicios: number; comision: number; tiempoSum: number; tiempoN: number }>()
  const sumar = (id: string, comision: number, tiempo: number | null) => {
    const a = acc.get(id) ?? { servicios: 0, comision: 0, tiempoSum: 0, tiempoN: 0 }
    a.servicios += 1
    a.comision += comision
    if (tiempo != null) {
      a.tiempoSum += tiempo
      a.tiempoN += 1
    }
    acc.set(id, a)
  }
  for (const row of data as OrdenResumenRow[]) {
    const orden = {
      comisionLavador: row.comision_lavador,
      lavadorId: row.lavador_id ?? undefined,
      lavadorId2: row.lavador_id_2 ?? undefined,
    }
    if (row.lavador_id) sumar(row.lavador_id, comisionParaLavador(orden, row.lavador_id), row.tiempo_lavado_segundos)
    if (row.lavador_id_2)
      sumar(row.lavador_id_2, comisionParaLavador(orden, row.lavador_id_2), row.tiempo_lavado_segundos)
  }

  const out = new Map<string, ResumenLavador>()
  for (const [id, a] of acc) {
    out.set(id, {
      servicios: a.servicios,
      comisionGenerada: a.comision,
      tiempoPromedioSegundos: a.tiempoN > 0 ? Math.round(a.tiempoSum / a.tiempoN) : null,
    })
  }
  return out
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Expediente completo de un lavador
// ─────────────────────────────────────────────────────────────────────────────────────────────

export interface TiempoPorCombo {
  comboId: string
  promedioSegundos: number
  n: number
}

export interface ExpedienteLavador {
  ordenes: Orden[]
  pagosPorOrden: Map<string, Pago[]>
  productosPorOrden: Map<string, Venta[]>
  comisionGenerada: number
  comisionPagada: number
  comisionPendiente: number
  serviciosReales: number
  serviciosAnulados: number
  ticketPromedio: number
  tiempoPromedioGlobalSegundos: number | null
  tiempoPorCombo: TiempoPorCombo[]
  // Asistencia en el rango [desde, hoy]
  rangoDesde: string
  diasRango: number
  diasTrabajados: number
  diasDescanso: number
  asistencias: AsistenciaLavador[]
}

export async function fetchExpedienteLavador(lavadorId: string, diasAtras = 60): Promise<ExpedienteLavador> {
  const hoy = new Date()
  const desde = new Date()
  desde.setDate(desde.getDate() - diasAtras)
  const desdeISO = fechaLocalISO(desde)
  const hoyISO = fechaLocalISO(hoy)

  const ordenes = await fetchOrdenesDeLavador(lavadorId)
  const ids = ordenes.map((o) => o.id)
  const [pagos, ventas, asistencias, descansos] = await Promise.all([
    fetchPagosDeOrdenes(ids),
    fetchVentasDeOrdenes(ids),
    fetchAsistenciasEnRango(desdeISO, hoyISO),
    fetchDiasDescanso(desdeISO, hoyISO),
  ])

  const pagosPorOrden = new Map<string, Pago[]>()
  for (const p of pagos) {
    if (!p.ordenId) continue
    const l = pagosPorOrden.get(p.ordenId) ?? []
    l.push(p)
    pagosPorOrden.set(p.ordenId, l)
  }
  const productosPorOrden = new Map<string, Venta[]>()
  for (const v of ventas) {
    if (!v.ordenId) continue
    const l = productosPorOrden.get(v.ordenId) ?? []
    l.push(v)
    productosPorOrden.set(v.ordenId, l)
  }

  const reales = ordenes.filter((o) => o.estado !== 'anulada')
  const entregadas = reales.filter((o) => o.estado === 'entregado')
  let comisionGenerada = 0
  let comisionPagada = 0
  const tiempoCombo = new Map<string, { sum: number; n: number }>()
  let tiempoSum = 0
  let tiempoN = 0
  let ingresoSum = 0

  for (const o of reales) {
    const comision = comisionParaLavador(o, lavadorId)
    comisionGenerada += comision
    const liquidada =
      (o.lavadorId === lavadorId && o.liquidacionId !== undefined) ||
      (o.lavadorId2 === lavadorId && o.liquidacionId2 !== undefined)
    if (liquidada) comisionPagada += comision

    if (o.estado === 'entregado') ingresoSum += o.precio - o.descuento

    if (o.tiempoLavadoSegundos != null) {
      tiempoSum += o.tiempoLavadoSegundos
      tiempoN += 1
      if (o.comboId) {
        const c = tiempoCombo.get(o.comboId) ?? { sum: 0, n: 0 }
        c.sum += o.tiempoLavadoSegundos
        c.n += 1
        tiempoCombo.set(o.comboId, c)
      }
    }
  }

  const misDescansos = descansos.filter((d) => d.lavadorId === lavadorId)

  return {
    ordenes,
    pagosPorOrden,
    productosPorOrden,
    comisionGenerada,
    comisionPagada,
    comisionPendiente: comisionGenerada - comisionPagada,
    serviciosReales: reales.length,
    serviciosAnulados: ordenes.length - reales.length,
    ticketPromedio: entregadas.length ? Math.round(ingresoSum / entregadas.length) : 0,
    tiempoPromedioGlobalSegundos: tiempoN > 0 ? Math.round(tiempoSum / tiempoN) : null,
    tiempoPorCombo: [...tiempoCombo.entries()]
      .map(([comboId, c]) => ({ comboId, promedioSegundos: Math.round(c.sum / c.n), n: c.n }))
      .sort((a, b) => b.n - a.n),
    rangoDesde: desdeISO,
    diasRango: diasAtras,
    diasTrabajados: asistencias.filter((a) => a.lavadorId === lavadorId).length,
    diasDescanso: misDescansos.length,
    asistencias: asistencias.filter((a) => a.lavadorId === lavadorId),
  }
}
