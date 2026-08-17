import { z } from 'zod'

export const productoSchema = z.object({
  id: z.string(),
  nombre: z.string(),
  unidadMedida: z.string(),
  stockMinimo: z.number().int().nonnegative(),
  activo: z.boolean(),
})

export const productoInputSchema = productoSchema.omit({ id: true, activo: true }).extend({
  nombre: z.string().trim().min(2, 'El nombre debe tener al menos 2 caracteres'),
  unidadMedida: z.string().trim().min(1, 'La unidad de medida es obligatoria'),
})

export type Producto = z.infer<typeof productoSchema>
export type ProductoInput = z.infer<typeof productoInputSchema>
