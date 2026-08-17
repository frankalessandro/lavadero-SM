import { z } from 'zod'
import { categoriaVehiculoSchema } from './tipoVehiculo'

const nullableTrimmedString = z
  .string()
  .trim()
  .nullish()
  .transform((value) => value ?? undefined)

export const comboSchema = z.object({
  id: z.string(),
  nombre: z.string(),
  descripcion: nullableTrimmedString,
  categoria: categoriaVehiculoSchema,
  activo: z.boolean(),
})

export const comboInputSchema = comboSchema
  .omit({ id: true, activo: true })
  .extend({
    nombre: z.string().trim().min(2, 'El nombre debe tener al menos 2 caracteres'),
    descripcion: z.string().trim().optional(),
  })

export type Combo = z.infer<typeof comboSchema>
export type ComboInput = z.infer<typeof comboInputSchema>
