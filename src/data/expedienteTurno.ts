import { fetchOrdenesDeTurno } from './ordenes'
import { fetchVentasDeTurno } from './ventas'
import { fetchPagosDeTurno, fetchPagosDeOrdenes } from './pagos'
import { fetchGastosDeTurno } from './gastos'
import { fetchComprasDeTurno } from './compras'
import { fetchPrestamosDeTurno } from './deudasLavador'
import { fetchTraspasos, desgloseEsperado, type DesgloseEsperado } from './turnos'
import { fetchConteosDeTurno, fetchLineasDeConteo, type ConteoLineaConProducto } from './conteosInventario'
import type { TurnoCaja, TraspasoTurno } from '../schemas/turnoCaja'
import type { ConteoInventario } from '../schemas/conteoInventario'
import type { Orden } from '../schemas/orden'
import type { Pago } from '../schemas/pago'
import type { Venta } from '../schemas/venta'
import type { Compra } from '../schemas/compra'
import type { DeudaLavador } from '../schemas/deudaLavador'
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
  compras: Compra[] // compras de inventario pagadas con la caja de este turno (0064)
  prestamos: DeudaLavador[] // préstamos a lavadores pagados con la caja de este turno (0065)
  pagos: Pago[] // todas las líneas del turno (para el desglose por método)
  traspasos: TraspasoTurno[]
  desglose?: DesgloseEsperado // solo si el turno está cerrado o tiene datos suficientes
  conteos: ConteoConLineas[] // reinicio/apertura, traspasos y cierre, en orden (0068)
}

async function conteosConLineas(turnoId: string): Promise<ConteoConLineas[]> {
  const conteos = await fetchConteosDeTurno(turnoId)
  return Promise.all(conteos.map(async (conteo) => ({ conteo, lineas: await fetchLineasDeConteo(conteo.id) })))
}

// Expediente del turno: todo lo que se movió en él — órdenes cobradas, ventas de nevera, gastos
// de caja, el reparto de pagos por método, traspasos de responsabilidad, y los conteos de
// inventario de apertura y cierre. Para /admin/operacion/turnos.
export async function fetchExpedienteTurno(turno: TurnoCaja): Promise<ExpedienteTurno> {
  const [ordenes, ventas, pagos, gastos, compras, prestamos, traspasos, conteos] = await Promise.all([
    fetchOrdenesDeTurno(turno.id),
    fetchVentasDeTurno(turno.id),
    fetchPagosDeTurno(turno.id),
    fetchGastosDeTurno(turno.id),
    fetchComprasDeTurno(turno.id),
    fetchPrestamosDeTurno(turno.id),
    fetchTraspasos(turno.id),
    conteosConLineas(turno.id),
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

  return { ordenes, pagosPorOrden, ventas, gastos, compras, prestamos, pagos, traspasos, desglose, conteos }
}
