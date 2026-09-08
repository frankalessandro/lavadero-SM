import { fetchOrdenesDeTurno } from './ordenes'
import { fetchVentasDeTurno } from './ventas'
import { fetchPagosDeTurno, fetchPagosDeOrdenes } from './pagos'
import { fetchGastosDeTurno } from './gastos'
import { fetchTraspasos, desgloseEsperado, type DesgloseEsperado } from './turnos'
import { fetchConteoDeTurno, fetchLineasDeConteo, type ConteoLineaConProducto } from './conteosInventario'
import type { TurnoCaja, TraspasoTurno } from '../schemas/turnoCaja'
import type { ConteoInventario } from '../schemas/conteoInventario'
import type { Orden } from '../schemas/orden'
import type { Pago } from '../schemas/pago'
import type { Venta } from '../schemas/venta'
import type { GastoConCategoria } from './gastos'

export interface ConteoConLineas {
  conteo: ConteoInventario
  lineas: ConteoLineaConProducto[]
}

export interface ExpedienteTurno {
  ordenes: Orden[]
  pagosPorOrden: Map<string, Pago[]>
  ventas: Venta[]
  gastos: GastoConCategoria[]
  pagos: Pago[] // todas las líneas del turno (para el desglose por método)
  traspasos: TraspasoTurno[]
  desglose?: DesgloseEsperado // solo si el turno está cerrado o tiene datos suficientes
  conteoApertura?: ConteoConLineas
  conteoCierre?: ConteoConLineas
}

async function conteoConLineas(turnoId: string, momento: 'apertura' | 'cierre'): Promise<ConteoConLineas | undefined> {
  const conteo = await fetchConteoDeTurno(turnoId, momento)
  if (!conteo) return undefined
  return { conteo, lineas: await fetchLineasDeConteo(conteo.id) }
}

// Expediente del turno: todo lo que se movió en él — órdenes cobradas, ventas de nevera, gastos
// de caja, el reparto de pagos por método, traspasos de responsabilidad, y los conteos de
// inventario de apertura y cierre. Para /admin/operacion/turnos.
export async function fetchExpedienteTurno(turno: TurnoCaja): Promise<ExpedienteTurno> {
  const [ordenes, ventas, pagos, gastos, traspasos, conteoApertura, conteoCierre] = await Promise.all([
    fetchOrdenesDeTurno(turno.id),
    fetchVentasDeTurno(turno.id),
    fetchPagosDeTurno(turno.id),
    fetchGastosDeTurno(turno.id),
    fetchTraspasos(turno.id),
    conteoConLineas(turno.id, 'apertura'),
    conteoConLineas(turno.id, 'cierre'),
  ])

  const pagosDeOrdenes = await fetchPagosDeOrdenes(ordenes.map((o) => o.id))
  const pagosPorOrden = new Map<string, Pago[]>()
  for (const p of pagosDeOrdenes) {
    if (!p.ordenId) continue
    const l = pagosPorOrden.get(p.ordenId) ?? []
    l.push(p)
    pagosPorOrden.set(p.ordenId, l)
  }

  let desglose: DesgloseEsperado | undefined
  try {
    desglose = await desgloseEsperado(turno)
  } catch {
    desglose = undefined
  }

  return { ordenes, pagosPorOrden, ventas, gastos, pagos, traspasos, desglose, conteoApertura, conteoCierre }
}
