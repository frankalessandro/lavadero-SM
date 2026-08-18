import { db } from '../lib/db'
import {
  tipoVehiculoInputSchema,
  tipoVehiculoSchema,
  type TipoVehiculo,
  type TipoVehiculoInput,
} from '../schemas/tipoVehiculo'

export async function fetchTiposVehiculo(): Promise<TipoVehiculo[]> {
  const { data, error } = await db.from('tipos_vehiculo').select('*').order('nombre')
  if (error) throw new Error(error.message)
  return tipoVehiculoSchema.array().parse(data)
}

export async function createTipoVehiculo(input: TipoVehiculoInput): Promise<TipoVehiculo> {
  const parsed = tipoVehiculoInputSchema.parse(input)
  const { data, error } = await db.from('tipos_vehiculo').insert(parsed).select().single()
  if (error) throw new Error(error.message)
  return tipoVehiculoSchema.parse(data)
}

export async function updateTipoVehiculo(
  id: string,
  input: TipoVehiculoInput,
): Promise<TipoVehiculo> {
  const parsed = tipoVehiculoInputSchema.parse(input)
  const { data, error } = await db.from('tipos_vehiculo').update(parsed).eq('id', id).select().single()
  if (error) throw new Error(error.message)
  return tipoVehiculoSchema.parse(data)
}

export async function setTipoVehiculoActivo(id: string, activo: boolean): Promise<TipoVehiculo> {
  const { data, error } = await db.from('tipos_vehiculo').update({ activo }).eq('id', id).select().single()
  if (error) throw new Error(error.message)
  return tipoVehiculoSchema.parse(data)
}
