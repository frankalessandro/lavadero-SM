import { db } from '../lib/db'
import { tarifaParqueaderoSchema, type TarifaParqueadero } from '../schemas/tarifaParqueadero'

const TARIFA_SELECT = 'id, modalidad, claseVehiculo:clase_vehiculo, precio, multaFueraVentana:multa_fuera_ventana'

export async function fetchTarifasParqueadero(): Promise<TarifaParqueadero[]> {
  const { data, error } = await db.from('tarifas_parqueadero').select(TARIFA_SELECT).order('modalidad')
  if (error) throw new Error(error.message)
  return tarifaParqueaderoSchema.array().parse(data)
}

export async function updateTarifaParqueadero(
  id: string,
  cambios: { precio?: number; multaFueraVentana?: number },
): Promise<TarifaParqueadero> {
  const payload: Record<string, number> = {}
  if (cambios.precio !== undefined) payload.precio = cambios.precio
  if (cambios.multaFueraVentana !== undefined) payload.multa_fuera_ventana = cambios.multaFueraVentana
  const { data, error } = await db
    .from('tarifas_parqueadero')
    .update(payload)
    .eq('id', id)
    .select(TARIFA_SELECT)
    .single()
  if (error) throw new Error(error.message)
  return tarifaParqueaderoSchema.parse(data)
}
