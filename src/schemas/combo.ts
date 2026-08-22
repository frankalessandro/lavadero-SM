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
  // false (default): precio calculado sumando los servicios que lo componen (combo_servicios).
  // true: precio fijo por tipo de vehículo (precios_combo_fijo), sin composición de servicios
  // — ej. motos, que "funcionan diferente a los carros" (confirmado con Alessandro).
  precioFijo: z.boolean(),
})

export const comboInputSchema = comboSchema
  .omit({ id: true, activo: true })
  .extend({
    nombre: z.string().trim().min(2, 'El nombre debe tener al menos 2 caracteres'),
    descripcion: z.string().trim().optional(),
    precioFijo: z.boolean().optional().default(false),
  })

export type Combo = z.infer<typeof comboSchema>
export type ComboInput = z.infer<typeof comboInputSchema>
