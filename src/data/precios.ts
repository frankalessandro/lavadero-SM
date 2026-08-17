import { db } from '../lib/db'
import { precioSchema, type Precio } from '../schemas/precio'

export async function fetchPrecios(): Promise<Precio[]> {
  const { data, error } = await db
    .from('precios')
    .select('id, comboId:combo_id, tipoVehiculoId:tipo_vehiculo_id, precio')
  if (error) throw new Error(error.message)
  return precioSchema.array().parse(data)
}

// Búsqueda pura sobre la matriz ya cargada — evita una consulta por cada combinación
// combo+tipo que el usuario prueba mientras llena el formulario.
export function findPrecio(precios: Precio[], comboId: string, tipoVehiculoId: string): Precio | undefined {
  return precios.find((p) => p.comboId === comboId && p.tipoVehiculoId === tipoVehiculoId)
}

// Crea o actualiza el precio de una combinación combo+tipo (constraint unique en la tabla) —
// no todas las combinaciones existen (ej: combos de moto solo tienen precio para "Motocicleta").
export async function upsertPrecio(comboId: string, tipoVehiculoId: string, precio: number): Promise<Precio> {
  const { data, error } = await db
    .from('precios')
    .upsert(
      { combo_id: comboId, tipo_vehiculo_id: tipoVehiculoId, precio },
      { onConflict: 'combo_id,tipo_vehiculo_id' },
    )
    .select('id, comboId:combo_id, tipoVehiculoId:tipo_vehiculo_id, precio')
    .single()
  if (error) throw new Error(error.message)
  return precioSchema.parse(data)
}
