import { db } from '../lib/db'
import { tarifaParqueaderoSchema, type TarifaParqueadero } from '../schemas/tarifaParqueadero'

const TARIFA_SELECT = 'id, modalidad, precio'

export async function fetchTarifasParqueadero(): Promise<TarifaParqueadero[]> {
  const { data, error } = await db.from('tarifas_parqueadero').select(TARIFA_SELECT).order('modalidad')
  if (error) throw new Error(error.message)
  return tarifaParqueaderoSchema.array().parse(data)
}

export async function updateTarifaParqueadero(id: string, precio: number): Promise<TarifaParqueadero> {
  const { data, error } = await db
    .from('tarifas_parqueadero')
    .update({ precio })
    .eq('id', id)
    .select(TARIFA_SELECT)
    .single()
  if (error) throw new Error(error.message)
  return tarifaParqueaderoSchema.parse(data)
}
