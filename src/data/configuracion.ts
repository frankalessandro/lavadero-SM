import { db } from '../lib/db'
import { configuracionSchema, type Configuracion } from '../schemas/configuracion'
import { z } from 'zod'

const CONFIG_SELECT =
  'comisionLavadorPorcentaje:comision_lavador_porcentaje, comisionJefeZonaCombo1Porcentaje:comision_jefe_zona_combo1_porcentaje, comisionJefeZonaCombo2Porcentaje:comision_jefe_zona_combo2_porcentaje, comisionJefeZonaServiciosPorcentaje:comision_jefe_zona_servicios_porcentaje, comisionBase:comision_base, periodicidadLiquidacion:periodicidad_liquidacion, recargoAltoCilindraje:recargo_alto_cilindraje'

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
      comision_jefe_zona_combo1_porcentaje: parsed.comisionJefeZonaCombo1Porcentaje,
      comision_jefe_zona_combo2_porcentaje: parsed.comisionJefeZonaCombo2Porcentaje,
      comision_jefe_zona_servicios_porcentaje: parsed.comisionJefeZonaServiciosPorcentaje,
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
// Las 3 columnas de comisión de jefe de patio por combo (0071) son nullable acá — las filas
// anteriores a ese cambio regían con un único % plano que ya no se guarda en esta tabla (regla
// 13: no se reescribe el histórico), así que quedan sin este dato en vez de inventarlo.
export const configuracionHistorialSchema = configuracionSchema
  .extend({
    id: z.number().int(),
    vigenteDesde: z.string(),
  })
  .extend({
    comisionJefeZonaCombo1Porcentaje: z.number().min(0).max(1).nullish().transform((v) => v ?? undefined),
    comisionJefeZonaCombo2Porcentaje: z.number().min(0).max(1).nullish().transform((v) => v ?? undefined),
    comisionJefeZonaServiciosPorcentaje: z.number().min(0).max(1).nullish().transform((v) => v ?? undefined),
  })

export type ConfiguracionHistorial = z.infer<typeof configuracionHistorialSchema>

const CONFIG_HISTORIAL_SELECT =
  'id, comisionLavadorPorcentaje:comision_lavador_porcentaje, comisionJefeZonaCombo1Porcentaje:comision_jefe_zona_combo1_porcentaje, comisionJefeZonaCombo2Porcentaje:comision_jefe_zona_combo2_porcentaje, comisionJefeZonaServiciosPorcentaje:comision_jefe_zona_servicios_porcentaje, comisionBase:comision_base, periodicidadLiquidacion:periodicidad_liquidacion, recargoAltoCilindraje:recargo_alto_cilindraje, vigenteDesde:vigente_desde'

export async function fetchConfiguracionHistorial(): Promise<ConfiguracionHistorial[]> {
  const { data, error } = await db
    .from('configuracion_historial')
    .select(CONFIG_HISTORIAL_SELECT)
    .order('vigente_desde', { ascending: false })
  if (error) throw new Error(error.message)
  return configuracionHistorialSchema.array().parse(data)
}
