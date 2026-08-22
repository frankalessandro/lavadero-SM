import { db } from '../lib/db'
import { precioComboSchema, type PrecioCombo } from '../schemas/precioCombo'

export async function fetchPreciosComboFijo(): Promise<PrecioCombo[]> {
  const { data, error } = await db
    .from('precios_combo_fijo')
    .select('id, comboId:combo_id, tipoVehiculoId:tipo_vehiculo_id, precio')
  if (error) throw new Error(error.message)
  return precioComboSchema.array().parse(data)
}

export function findPrecioComboFijo(
  precios: PrecioCombo[],
  comboId: string,
  tipoVehiculoId: string,
): PrecioCombo | undefined {
  return precios.find((p) => p.comboId === comboId && p.tipoVehiculoId === tipoVehiculoId)
}

export async function upsertPrecioComboFijo(
  comboId: string,
  tipoVehiculoId: string,
  precio: number,
): Promise<PrecioCombo> {
  const { data, error } = await db
    .from('precios_combo_fijo')
    .upsert(
      { combo_id: comboId, tipo_vehiculo_id: tipoVehiculoId, precio },
      { onConflict: 'combo_id,tipo_vehiculo_id' },
    )
    .select('id, comboId:combo_id, tipoVehiculoId:tipo_vehiculo_id, precio')
    .single()
  if (error) throw new Error(error.message)
  return precioComboSchema.parse(data)
}
