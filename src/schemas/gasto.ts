import { z } from 'zod'

export const categoriaGastoSchema = z.object({
  id: z.string(),
  nombre: z.string(),
  activo: z.boolean(),
})

export const gastoSchema = z.object({
  id: z.string(),
  fecha: z.string(), // date (YYYY-MM-DD)
  categoriaId: z.string(),
  descripcion: z.string(),
  monto: z.number().int().positive(),
  responsable: z.string(),
  origen: z.enum(['caja', 'otro']),
  creadoEn: z.string(),
})

export const gastoInputSchema = z.object({
  fecha: z.string().min(1, 'La fecha es obligatoria'),
  categoriaId: z.string().min(1, 'Selecciona una categoría'),
  descripcion: z.string().trim().min(1, 'La descripción es obligatoria'),
  monto: z.number().int().positive('El monto debe ser mayor a 0'),
  responsable: z.string().trim().min(1, 'El responsable es obligatorio'),
  origen: z.enum(['caja', 'otro']),
})

export const categoriaGastoInputSchema = z.object({
  nombre: z.string().trim().min(2, 'El nombre debe tener al menos 2 caracteres'),
})

export type CategoriaGasto = z.infer<typeof categoriaGastoSchema>
export type CategoriaGastoInput = z.infer<typeof categoriaGastoInputSchema>
export type Gasto = z.infer<typeof gastoSchema>
export type GastoInput = z.infer<typeof gastoInputSchema>
