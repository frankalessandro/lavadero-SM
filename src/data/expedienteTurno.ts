import { fetchOrdenesDeTurno } from './ordenes'
import { fetchVentasDeTurno } from './ventas'
import { fetchPagosDeTurno, fetchPagosDeOrdenes } from './pagos'
import { fetchGastosDeTurno } from './gastos'
import { fetchComprasDeTurno } from './compras'
import { fetchPrestamosDeTurno } from './deudasPersonal'
import { fetchTraspasos, desgloseEsperado, type DesgloseEsperado } from './turnos'
import { fetchConteosDeTurno, fetchLineasDeConteo, type ConteoLineaConProducto } from './conteosInventario'
import type { TurnoCaja, TraspasoTurno } from '../schemas/turnoCaja'
import type { ConteoInventario } from '../schemas/conteoInventario'
import type { Orden } from '../schemas/orden'
import type { Pago } from '../schemas/pago'
import type { Venta } from '../schemas/venta'
import type { Compra } from '../schemas/compra'
import type { DeudaPersonal } from '../schemas/deudaPersonal'
import { fetchPerfiles } from './perfiles'
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
  prestamos: DeudaPersonal[] // préstamos y abonos en efectivo del personal con la caja de este turno (0065/0070)
  personaNombrePorId: Map<string, string> // jefes de patio / gerencia, para las deudas del personal
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
  const [ordenes, ventas, pagos, gastos, compras, prestamos, traspasos, conteos, perfiles] = await Promise.all([
    fetchOrdenesDeTurno(turno.id),
    fetchVentasDeTurno(turno.id),
    fetchPagosDeTurno(turno.id),
    fetchGastosDeTurno(turno.id),
    fetchComprasDeTurno(turno.id),
    fetchPrestamosDeTurno(turno.id),
    fetchTraspasos(turno.id),
    conteosConLineas(turno.id),
    fetchPerfiles(),
  ])
  const personaNombrePorId = new Map(perfiles.map((p) => [p.id, p.nombre?.trim() || 'Sin nombre']))

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

  return { ordenes, pagosPorOrden, ventas, gastos, compras, prestamos, pagos, traspasos, desglose, conteos, personaNombrePorId }
}
