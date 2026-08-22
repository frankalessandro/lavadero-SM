import { z } from 'zod'

const nullableTrimmedString = z
  .string()
  .trim()
  .nullish()
  .transform((value) => value ?? undefined)

const nullableDate = z
  .string()
  .nullish()
  .transform((value) => value ?? undefined)

export const lavadorSchema = z.object({
  id: z.string(),
  nombre: z.string(),
  telefono: nullableTrimmedString,
  fechaIngreso: z.string(), // date, siempre tiene valor (default en BD)
  fechaCumpleanos: nullableDate,
  activo: z.boolean(),
  // Cola de rotación (regla de negocio 9) — NULL = nunca asignado, va primero. Se expone para
  // poder mostrar el orden completo en el dashboard, no solo el siguiente (suggestNextLavador
  // sigue siendo la fuente de verdad al momento de asignar en /recepcion).
  ultimaAsignacion: nullableDate,
})

export const lavadorInputSchema = z.object({
  nombre: z.string().trim().min(2, 'El nombre debe tener al menos 2 caracteres'),
  telefono: z.string().trim().optional(),
  fechaIngreso: z.string().min(1, 'La fecha de ingreso es obligatoria'),
  fechaCumpleanos: z.string().trim().optional(),
})

export type Lavador = z.infer<typeof lavadorSchema>
export type LavadorInput = z.infer<typeof lavadorInputSchema>
