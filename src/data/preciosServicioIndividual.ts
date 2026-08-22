import { db } from '../lib/db'
import { precioServicioSchema, type PrecioServicio } from '../schemas/precioServicio'

// Precio del servicio vendido solo (orden sin combo) o agregado suelto encima de un combo —
// catálogo independiente de `preciosServicioCombo.ts`, normalmente $5.000 más caro por el
// mismo servicio pero no siempre sigue ese patrón al centavo (confirmado con el cliente).
export async function fetchPreciosServicioIndividual(): Promise<PrecioServicio[]> {
  const { data, error } = await db
    .from('precios_servicios_individual')
    .select('id, servicioId:servicio_id, tipoVehiculoId:tipo_vehiculo_id, precio')
  if (error) throw new Error(error.message)
  return precioServicioSchema.array().parse(data)
}

export function findPrecioServicioIndividual(
  precios: PrecioServicio[],
  servicioId: string,
  tipoVehiculoId: string,
): PrecioServicio | undefined {
  return precios.find((p) => p.servicioId === servicioId && p.tipoVehiculoId === tipoVehiculoId)
}

export async function upsertPrecioServicioIndividual(
  servicioId: string,
  tipoVehiculoId: string,
  precio: number,
): Promise<PrecioServicio> {
  const { data, error } = await db
    .from('precios_servicios_individual')
    .upsert(
      { servicio_id: servicioId, tipo_vehiculo_id: tipoVehiculoId, precio },
      { onConflict: 'servicio_id,tipo_vehiculo_id' },
    )
    .select('id, servicioId:servicio_id, tipoVehiculoId:tipo_vehiculo_id, precio')
    .single()
  if (error) throw new Error(error.message)
  return precioServicioSchema.parse(data)
}
