import { db } from '../lib/db'
import { comboSchema, comboInputSchema, type Combo, type ComboInput } from '../schemas/combo'
import type { ComboServicio } from './comboServicios'
import type { PrecioServicio } from '../schemas/precioServicio'
import type { PrecioCombo } from '../schemas/precioCombo'

const COMBO_SELECT = 'id, nombre, descripcion, categoria, activo, precioFijo:precio_fijo'

export async function fetchCombos(): Promise<Combo[]> {
  const { data, error } = await db.from('combos').select(COMBO_SELECT).order('nombre')
  if (error) throw new Error(error.message)
  return comboSchema.array().parse(data)
}

export async function createCombo(input: ComboInput): Promise<Combo> {
  const parsed = comboInputSchema.parse(input)
  const { data, error } = await db
    .from('combos')
    .insert({
      nombre: parsed.nombre,
      descripcion: parsed.descripcion,
      categoria: parsed.categoria,
      precio_fijo: parsed.precioFijo,
    })
    .select(COMBO_SELECT)
    .single()
  if (error) throw new Error(error.message)
  return comboSchema.parse(data)
}

export async function updateCombo(id: string, input: ComboInput): Promise<Combo> {
  const parsed = comboInputSchema.parse(input)
  const { data, error } = await db
    .from('combos')
    .update({
      nombre: parsed.nombre,
      descripcion: parsed.descripcion,
      categoria: parsed.categoria,
      precio_fijo: parsed.precioFijo,
    })
    .eq('id', id)
    .select(COMBO_SELECT)
    .single()
  if (error) throw new Error(error.message)
  return comboSchema.parse(data)
}

export async function setComboActivo(id: string, activo: boolean): Promise<Combo> {
  const { data, error } = await db.from('combos').update({ activo }).eq('id', id).select(COMBO_SELECT).single()
  if (error) throw new Error(error.message)
  return comboSchema.parse(data)
}

// Precio de un combo por tipo de vehículo — dos caminos según `combo.precioFijo`:
// - false (default, ej. autos/camionetas): se calcula sumando el precio "de combo" de cada
//   servicio que lo compone (`combo_servicios` + `precios_servicios_combo`). Si al combo le
//   falta el precio de ALGUNO de sus servicios para ese tipo, se devuelve `undefined` (criterio
//   "todo o nada" — evita mostrar/cobrar un total parcial engañoso).
// - true (ej. motos — "funciona diferente a los carros", confirmado con Alessandro): precio
//   directo por tipo de vehículo en `precios_combo_fijo`, sin composición de servicios.
export function precioComboCalculado(
  combo: Combo,
  tipoVehiculoId: string,
  comboServicios: ComboServicio[],
  preciosServicioCombo: PrecioServicio[],
  preciosComboFijo: PrecioCombo[],
): number | undefined {
  if (combo.precioFijo) {
    return preciosComboFijo.find((p) => p.comboId === combo.id && p.tipoVehiculoId === tipoVehiculoId)?.precio
  }

  const servicioIds = comboServicios.filter((cs) => cs.comboId === combo.id).map((cs) => cs.servicioId)
  if (servicioIds.length === 0) return undefined

  let total = 0
  for (const servicioId of servicioIds) {
    const precio = preciosServicioCombo.find((p) => p.servicioId === servicioId && p.tipoVehiculoId === tipoVehiculoId)
    if (!precio) return undefined
    total += precio.precio
  }
  return total
}
