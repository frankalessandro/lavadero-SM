import { db } from '../lib/db'
import { comboSchema, comboInputSchema, type Combo, type ComboInput } from '../schemas/combo'

export async function fetchCombos(): Promise<Combo[]> {
  const { data, error } = await db.from('combos').select('*').order('nombre')
  if (error) throw new Error(error.message)
  return comboSchema.array().parse(data)
}

export async function createCombo(input: ComboInput): Promise<Combo> {
  const parsed = comboInputSchema.parse(input)
  const { data, error } = await db.from('combos').insert(parsed).select().single()
  if (error) throw new Error(error.message)
  return comboSchema.parse(data)
}

export async function updateCombo(id: string, input: ComboInput): Promise<Combo> {
  const parsed = comboInputSchema.parse(input)
  const { data, error } = await db.from('combos').update(parsed).eq('id', id).select().single()
  if (error) throw new Error(error.message)
  return comboSchema.parse(data)
}

export async function setComboActivo(id: string, activo: boolean): Promise<Combo> {
  const { data, error } = await db.from('combos').update({ activo }).eq('id', id).select().single()
  if (error) throw new Error(error.message)
  return comboSchema.parse(data)
}
