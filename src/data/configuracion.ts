import { db } from '../lib/db'
import { configuracionSchema, type Configuracion } from '../schemas/configuracion'

const CONFIG_SELECT = 'comisionLavadorPorcentaje:comision_lavador_porcentaje, comisionBase:comision_base'

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
      comision_base: parsed.comisionBase,
    })
    .eq('id', true)
    .select(CONFIG_SELECT)
    .single()
  if (error) throw new Error(error.message)
  return configuracionSchema.parse(data)
}
