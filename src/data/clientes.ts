import { db } from '../lib/db'
import { fetchOrdenesPorPlaca } from './ordenes'
import { fetchPagosDeOrdenes } from './pagos'
import { fetchVentasDeOrdenes } from './ventas'
import type { Orden } from '../schemas/orden'
import type { Pago } from '../schemas/pago'
import type { Venta } from '../schemas/venta'

// No hay tabla `clientes` — el registro de contacto vive por orden (M2, ya existente).
// Esta vista agrega `ordenes` por placa para obtener un "expediente" de cliente: quién es,
// cómo contactarlo, qué vehículo trae y cuándo fue la última vez, sin duplicar datos.
export interface ClienteResumen {
  placa: string
  clienteNombre: string
  clienteTelefono?: string
  clienteCorreo?: string
  tipoVehiculoId: string
  ultimoComboId: string
  ultimoServicioEn: string
  primerServicioEn: string
  totalServicios: number
  totalGastado: number
  ticketPromedio: number
}

interface OrdenClienteRow {
  placa: string
  clienteNombre: string
  clienteTelefono: string | null
  clienteCorreo: string | null
  tipoVehiculoId: string
  comboId: string
  creadoEn: string
  precio: number
  descuento: number
  estado: string
}

// Excluye anuladas (regla 13: quedan visibles en auditoría, pero no representan un servicio
// real prestado) — orden por `creado_en` desc para que el primer registro de cada placa sea
// el más reciente y sirva de representante del cliente.
export async function fetchClientes(): Promise<ClienteResumen[]> {
  const { data, error } = await db
    .from('ordenes')
    .select(
      'placa, clienteNombre:cliente_nombre, clienteTelefono:cliente_telefono, clienteCorreo:cliente_correo, tipoVehiculoId:tipo_vehiculo_id, comboId:combo_id, creadoEn:creado_en, precio, descuento, estado',
    )
    .neq('estado', 'anulada')
    .order('creado_en', { ascending: false })
  if (error) throw new Error(error.message)

  const filas = data as unknown as OrdenClienteRow[]
  const acc = new Map<string, ClienteResumen & { entregadas: number }>()
  for (const fila of filas) {
    const gasto = fila.estado === 'entregado' ? fila.precio - fila.descuento : 0
    const entregada = fila.estado === 'entregado' ? 1 : 0
    const existente = acc.get(fila.placa)
    if (existente) {
      existente.totalServicios += 1
      existente.totalGastado += gasto
      existente.entregadas += entregada
      if (fila.creadoEn < existente.primerServicioEn) existente.primerServicioEn = fila.creadoEn
      continue
    }
    acc.set(fila.placa, {
      placa: fila.placa,
      clienteNombre: fila.clienteNombre,
      clienteTelefono: fila.clienteTelefono ?? undefined,
      clienteCorreo: fila.clienteCorreo ?? undefined,
      tipoVehiculoId: fila.tipoVehiculoId,
      ultimoComboId: fila.comboId,
      ultimoServicioEn: fila.creadoEn,
      primerServicioEn: fila.creadoEn,
      totalServicios: 1,
      totalGastado: gasto,
      ticketPromedio: 0,
      entregadas: entregada,
    })
  }
  return Array.from(acc.values()).map(({ entregadas, ...c }) => ({
    ...c,
    ticketPromedio: entregadas > 0 ? Math.round(c.totalGastado / entregadas) : 0,
  }))
}

// Expediente completo de un cliente (por placa): todas sus órdenes —incluidas las anuladas— con
// el desglose de pago partido y los productos vendidos en cada una. Una consulta por tabla, no
// una por orden.
export interface ExpedienteCliente {
  ordenes: Orden[]
  pagosPorOrden: Map<string, Pago[]>
  productosPorOrden: Map<string, Venta[]>
}

export async function fetchExpedienteCliente(placa: string): Promise<ExpedienteCliente> {
  const ordenes = await fetchOrdenesPorPlaca(placa)
  const ids = ordenes.map((o) => o.id)
  const [pagos, ventas] = await Promise.all([fetchPagosDeOrdenes(ids), fetchVentasDeOrdenes(ids)])

  const pagosPorOrden = new Map<string, Pago[]>()
  for (const p of pagos) {
    if (!p.ordenId) continue
    const lista = pagosPorOrden.get(p.ordenId) ?? []
    lista.push(p)
    pagosPorOrden.set(p.ordenId, lista)
  }
  const productosPorOrden = new Map<string, Venta[]>()
  for (const v of ventas) {
    if (!v.ordenId) continue
    const lista = productosPorOrden.get(v.ordenId) ?? []
    lista.push(v)
    productosPorOrden.set(v.ordenId, lista)
  }
  return { ordenes, pagosPorOrden, productosPorOrden }
}
