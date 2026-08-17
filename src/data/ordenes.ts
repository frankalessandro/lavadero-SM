import { ordenInputSchema, type Orden, type OrdenInput } from '../schemas/orden'
import { findPrecio } from './precios'
import { registrarAsignacion } from './lavadores'

const COMISION_LAVADOR_PORCENTAJE = 0.4 // regla de negocio 2 — parametrizable a futuro desde Configuración

// Historial en memoria — incluye una orden de ayer para poder probar el autocompletado por placa.
const AYER = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
let ORDENES: Orden[] = [
  {
    id: 'seed-1',
    consecutivo: 1,
    placa: 'AB123CD',
    clienteNombre: 'Julián Vargas',
    clienteTelefono: '3001234567',
    tipoVehiculoId: '2',
    comboId: 'combo-auto-2',
    lavadorId: 'l1',
    precio: 22000,
    comisionLavador: 8800,
    comisionNegocio: 13200,
    metodoPago: 'efectivo',
    estado: 'entregado',
    creadoEn: AYER,
  },
]

let CONSECUTIVO = ORDENES.length

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function esMismoDia(isoA: string, isoB: string) {
  const a = new Date(isoA)
  const b = new Date(isoB)
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

export async function fetchOrdenesHoy(): Promise<Orden[]> {
  await delay(250)
  const hoy = new Date().toISOString()
  return ORDENES.filter((orden) => esMismoDia(orden.creadoEn, hoy)).sort((a, b) => b.consecutivo - a.consecutivo)
}

export interface HistorialPlaca {
  clienteNombre: string
  clienteTelefono?: string
  tipoVehiculoId: string
  comboId: string
}

export async function buscarPorPlaca(placa: string): Promise<HistorialPlaca | undefined> {
  await delay(150)
  const normalizada = placa.trim().toUpperCase()
  if (!normalizada) return undefined
  const ultima = [...ORDENES]
    .filter((orden) => orden.placa === normalizada)
    .sort((a, b) => b.consecutivo - a.consecutivo)[0]
  if (!ultima) return undefined
  return {
    clienteNombre: ultima.clienteNombre,
    clienteTelefono: ultima.clienteTelefono,
    tipoVehiculoId: ultima.tipoVehiculoId,
    comboId: ultima.comboId,
  }
}

export async function createOrden(input: OrdenInput): Promise<Orden> {
  const parsed = ordenInputSchema.parse(input)
  const precio = findPrecio(parsed.comboId, parsed.tipoVehiculoId)
  if (!precio) {
    throw new Error('No existe un precio configurado para ese combo y tipo de vehículo')
  }

  await delay(300)

  const comisionLavador = Math.round(precio.precio * COMISION_LAVADOR_PORCENTAJE)
  const comisionNegocio = precio.precio - comisionLavador

  CONSECUTIVO += 1
  const orden: Orden = {
    id: crypto.randomUUID(),
    consecutivo: CONSECUTIVO,
    placa: parsed.placa,
    clienteNombre: parsed.clienteNombre,
    clienteTelefono: parsed.clienteTelefono,
    tipoVehiculoId: parsed.tipoVehiculoId,
    comboId: parsed.comboId,
    lavadorId: parsed.lavadorId,
    precio: precio.precio,
    comisionLavador,
    comisionNegocio,
    metodoPago: parsed.metodoPago,
    referenciaPago: parsed.referenciaPago,
    observaciones: parsed.observaciones,
    estado: 'en_proceso',
    creadoEn: new Date().toISOString(),
  }

  ORDENES = [...ORDENES, orden]
  registrarAsignacion(parsed.lavadorId)
  return orden
}
