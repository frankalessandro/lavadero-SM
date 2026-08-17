import { z } from 'zod'

export const tipoVehiculoSchema = z.object({
  id: z.string(),
  nombre: z.string().trim().min(2, 'El nombre debe tener al menos 2 caracteres'),
  activo: z.boolean(),
})

export const tipoVehiculoInputSchema = tipoVehiculoSchema.omit({ id: true, activo: true })

export type TipoVehiculo = z.infer<typeof tipoVehiculoSchema>
export type TipoVehiculoInput = z.infer<typeof tipoVehiculoInputSchema>
