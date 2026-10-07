import { z } from 'zod'

export const categoriaVehiculoSchema = z.enum(['auto', 'moto'])

export const tipoVehiculoSchema = z.object({
  id: z.string(),
  nombre: z.string().trim().min(2, 'El nombre debe tener al menos 2 caracteres'),
  categoria: categoriaVehiculoSchema,
  activo: z.boolean(),
  // Sin precio de lista: el jefe de patio digita el valor al registrar la orden (moto eléctrica).
  // Solo se siembra por migración, no se edita desde el CRUD.
  precioAbierto: z.boolean().default(false),
})

export const tipoVehiculoInputSchema = tipoVehiculoSchema.omit({ id: true, activo: true, precioAbierto: true })

export type CategoriaVehiculo = z.infer<typeof categoriaVehiculoSchema>
export type TipoVehiculo = z.infer<typeof tipoVehiculoSchema>
export type TipoVehiculoInput = z.infer<typeof tipoVehiculoInputSchema>
