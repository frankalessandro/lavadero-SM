import type { Precio } from '../schemas/precio'

// IDs de tipos de vehículo tal como están sembrados en `tiposVehiculo.ts`:
// '1' Motocicleta · '2' Automóvil · '3' Camioneta
const MOTO = '1'
const AUTO = '2'
const CAMIONETA = '3'

// Precios de ejemplo — pendientes de la lista real que suministra el cliente (Plan §11).
export const PRECIOS: Precio[] = [
  { id: 'p1', comboId: 'combo-auto-1', tipoVehiculoId: AUTO, precio: 15000 },
  { id: 'p2', comboId: 'combo-auto-1', tipoVehiculoId: CAMIONETA, precio: 18000 },
  { id: 'p3', comboId: 'combo-auto-2', tipoVehiculoId: AUTO, precio: 22000 },
  { id: 'p4', comboId: 'combo-auto-2', tipoVehiculoId: CAMIONETA, precio: 26000 },
  { id: 'p5', comboId: 'combo-auto-3', tipoVehiculoId: AUTO, precio: 25000 },
  { id: 'p6', comboId: 'combo-auto-3', tipoVehiculoId: CAMIONETA, precio: 29000 },
  { id: 'p7', comboId: 'combo-auto-4', tipoVehiculoId: AUTO, precio: 32000 },
  { id: 'p8', comboId: 'combo-auto-4', tipoVehiculoId: CAMIONETA, precio: 37000 },
  { id: 'p9', comboId: 'combo-auto-5', tipoVehiculoId: AUTO, precio: 28000 },
  { id: 'p10', comboId: 'combo-auto-5', tipoVehiculoId: CAMIONETA, precio: 32000 },
  { id: 'p11', comboId: 'combo-auto-6', tipoVehiculoId: AUTO, precio: 30000 },
  { id: 'p12', comboId: 'combo-auto-6', tipoVehiculoId: CAMIONETA, precio: 35000 },
  { id: 'p13', comboId: 'combo-moto-1', tipoVehiculoId: MOTO, precio: 8000 },
  { id: 'p14', comboId: 'combo-moto-2', tipoVehiculoId: MOTO, precio: 12000 },
  { id: 'p15', comboId: 'combo-moto-3', tipoVehiculoId: MOTO, precio: 10000 },
  { id: 'p16', comboId: 'combo-moto-4', tipoVehiculoId: MOTO, precio: 16000 },
]

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export async function fetchPrecios(): Promise<Precio[]> {
  await delay(200)
  return [...PRECIOS]
}

export function findPrecio(comboId: string, tipoVehiculoId: string): Precio | undefined {
  return PRECIOS.find((p) => p.comboId === comboId && p.tipoVehiculoId === tipoVehiculoId)
}
