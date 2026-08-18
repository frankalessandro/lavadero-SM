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
  pagoDiario: z.boolean(), // excepción parametrizable — regla de negocio 4
})

export const lavadorInputSchema = z.object({
  nombre: z.string().trim().min(2, 'El nombre debe tener al menos 2 caracteres'),
  telefono: z.string().trim().optional(),
  fechaIngreso: z.string().min(1, 'La fecha de ingreso es obligatoria'),
  fechaCumpleanos: z.string().trim().optional(),
  pagoDiario: z.boolean(),
})

export type Lavador = z.infer<typeof lavadorSchema>
export type LavadorInput = z.infer<typeof lavadorInputSchema>
