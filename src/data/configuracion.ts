import { db } from '../lib/db'
import { configuracionSchema, type Configuracion } from '../schemas/configuracion'
import { z } from 'zod'

const CONFIG_SELECT =
  'comisionLavadorPorcentaje:comision_lavador_porcentaje, comisionJefeZonaPorcentaje:comision_jefe_zona_porcentaje, comisionBase:comision_base, periodicidadLiquidacion:periodicidad_liquidacion, recargoAltoCilindraje:recargo_alto_cilindraje'

export async function fetchConfiguracion(): Promise<Configuracion> {
  const { data, error } = await db.from('configuracion').select(CONFIG_SELECT).single()
  if (error) throw new Error(error.message)
  return configuracionSchema.parse(data)
}

export async function updateConfiguracion(input: Configuracion): Promise<Configuracion> {
  const parsed = configuracionSchema.parse(input)
  const { data, error } = await db
    .from('configuracion')
    .update({
      comision_lavador_porcentaje: parsed.comisionLavadorPorcentaje,
      comision_jefe_zona_porcentaje: parsed.comisionJefeZonaPorcentaje,
      comision_base: parsed.comisionBase,
      periodicidad_liquidacion: parsed.periodicidadLiquidacion,
      recargo_alto_cilindraje: parsed.recargoAltoCilindraje,
    })
    .eq('id', true)
    .select(CONFIG_SELECT)
    .single()
  if (error) throw new Error(error.message)
  return configuracionSchema.parse(data)
}

// Historial de la config a lo largo del tiempo (0052) — cada fila es "esto rigió desde
// `vigenteDesde`". Para responder "qué comisión aplicaba el 20 de agosto" sin reconstruir la
// bitácora evento por evento. Solo admin.
export const configuracionHistorialSchema = configuracionSchema.extend({
  id: z.number().int(),
  vigenteDesde: z.string(),
})

export type ConfiguracionHistorial = z.infer<typeof configuracionHistorialSchema>

const CONFIG_HISTORIAL_SELECT =
  'id, comisionLavadorPorcentaje:comision_lavador_porcentaje, comisionJefeZonaPorcentaje:comision_jefe_zona_porcentaje, comisionBase:comision_base, periodicidadLiquidacion:periodicidad_liquidacion, recargoAltoCilindraje:recargo_alto_cilindraje, vigenteDesde:vigente_desde'

export async function fetchConfiguracionHistorial(): Promise<ConfiguracionHistorial[]> {
  const { data, error } = await db
    .from('configuracion_historial')
    .select(CONFIG_HISTORIAL_SELECT)
    .order('vigente_desde', { ascending: false })
  if (error) throw new Error(error.message)
  return configuracionHistorialSchema.array().parse(data)
}
