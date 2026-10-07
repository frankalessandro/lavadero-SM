import { db } from '../lib/db'
import {
  tipoVehiculoInputSchema,
  tipoVehiculoSchema,
  type TipoVehiculo,
  type TipoVehiculoInput,
} from '../schemas/tipoVehiculo'

const TIPO_SELECT = 'id, nombre, categoria, activo, precioAbierto:precio_abierto'

export async function fetchTiposVehiculo(): Promise<TipoVehiculo[]> {
  const { data, error } = await db.from('tipos_vehiculo').select(TIPO_SELECT).order('nombre')
  if (error) throw new Error(error.message)
  return tipoVehiculoSchema.array().parse(data)
}

export async function createTipoVehiculo(input: TipoVehiculoInput): Promise<TipoVehiculo> {
  const parsed = tipoVehiculoInputSchema.parse(input)
  const { data, error } = await db.from('tipos_vehiculo').insert(parsed).select(TIPO_SELECT).single()
  if (error) throw new Error(error.message)
  return tipoVehiculoSchema.parse(data)
}

export async function updateTipoVehiculo(
  id: string,
  input: TipoVehiculoInput,
): Promise<TipoVehiculo> {
  const parsed = tipoVehiculoInputSchema.parse(input)
  const { data, error } = await db.from('tipos_vehiculo').update(parsed).eq('id', id).select(TIPO_SELECT).single()
  if (error) throw new Error(error.message)
  return tipoVehiculoSchema.parse(data)
}

export async function setTipoVehiculoActivo(id: string, activo: boolean): Promise<TipoVehiculo> {
  const { data, error } = await db.from('tipos_vehiculo').update({ activo }).eq('id', id).select(TIPO_SELECT).single()
  if (error) throw new Error(error.message)
  return tipoVehiculoSchema.parse(data)
}
