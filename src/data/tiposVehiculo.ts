import {
  tipoVehiculoInputSchema,
  type TipoVehiculo,
  type TipoVehiculoInput,
} from '../schemas/tipoVehiculo'

// Almacén temporal en memoria — se reemplaza por Postgres/Supabase cuando M1 se conecte al backend.
let TIPOS_VEHICULO: TipoVehiculo[] = [
  { id: '1', nombre: 'Motocicleta', activo: true },
  { id: '2', nombre: 'Automóvil', activo: true },
  { id: '3', nombre: 'Camioneta', activo: true },
]

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export async function fetchTiposVehiculo(): Promise<TipoVehiculo[]> {
  await delay(300)
  return [...TIPOS_VEHICULO]
}

export async function createTipoVehiculo(input: TipoVehiculoInput): Promise<TipoVehiculo> {
  const parsed = tipoVehiculoInputSchema.parse(input)
  await delay(300)
  const tipo: TipoVehiculo = { id: crypto.randomUUID(), activo: true, ...parsed }
  TIPOS_VEHICULO = [...TIPOS_VEHICULO, tipo]
  return tipo
}

export async function updateTipoVehiculo(
  id: string,
  input: TipoVehiculoInput,
): Promise<TipoVehiculo> {
  const parsed = tipoVehiculoInputSchema.parse(input)
  await delay(300)
  let updated: TipoVehiculo | undefined
  TIPOS_VEHICULO = TIPOS_VEHICULO.map((tipo) => {
    if (tipo.id !== id) return tipo
    updated = { ...tipo, ...parsed }
    return updated
  })
  if (!updated) throw new Error(`Tipo de vehículo ${id} no encontrado`)
  return updated
}

export async function setTipoVehiculoActivo(id: string, activo: boolean): Promise<TipoVehiculo> {
  await delay(200)
  let updated: TipoVehiculo | undefined
  TIPOS_VEHICULO = TIPOS_VEHICULO.map((tipo) => {
    if (tipo.id !== id) return tipo
    updated = { ...tipo, activo }
    return updated
  })
  if (!updated) throw new Error(`Tipo de vehículo ${id} no encontrado`)
  return updated
}
