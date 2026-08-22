import { db } from '../lib/db'
import { precioServicioSchema, type PrecioServicio } from '../schemas/precioServicio'

// Precio del servicio cuando es parte de un combo — de aquí sale el total del combo (suma de
// estos precios para los servicios que lo componen). Es más barato que el precio individual
// (ver `preciosServicioIndividual.ts`) — confirmado con la lista real del cliente.
export async function fetchPreciosServicioCombo(): Promise<PrecioServicio[]> {
  const { data, error } = await db
    .from('precios_servicios_combo')
    .select('id, servicioId:servicio_id, tipoVehiculoId:tipo_vehiculo_id, precio')
  if (error) throw new Error(error.message)
  return precioServicioSchema.array().parse(data)
}

export function findPrecioServicioCombo(
  precios: PrecioServicio[],
  servicioId: string,
  tipoVehiculoId: string,
): PrecioServicio | undefined {
  return precios.find((p) => p.servicioId === servicioId && p.tipoVehiculoId === tipoVehiculoId)
}

export async function upsertPrecioServicioCombo(
  servicioId: string,
  tipoVehiculoId: string,
  precio: number,
): Promise<PrecioServicio> {
  const { data, error } = await db
    .from('precios_servicios_combo')
    .upsert(
      { servicio_id: servicioId, tipo_vehiculo_id: tipoVehiculoId, precio },
      { onConflict: 'servicio_id,tipo_vehiculo_id' },
    )
    .select('id, servicioId:servicio_id, tipoVehiculoId:tipo_vehiculo_id, precio')
    .single()
  if (error) throw new Error(error.message)
  return precioServicioSchema.parse(data)
}
