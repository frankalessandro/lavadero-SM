import { z } from 'zod'

const nullableTrimmedString = z
  .string()
  .trim()
  .nullish()
  .transform((value) => value ?? undefined)

export const diaDescansoSchema = z.object({
  id: z.string(),
  fecha: z.string(), // date, formato YYYY-MM-DD
  lavadorId: z.string(),
  motivo: nullableTrimmedString,
  actualizadoEn: z.string(),
  actualizadoPor: nullableTrimmedString,
})

export const asistenciaLavadorSchema = z.object({
  id: z.string(),
  lavadorId: z.string(),
  fecha: z.string(),
  horaEntrada: z.string(),
  registradoPor: z.string(),
  creadoEn: z.string(),
})

export const marcarAsistenciaInputSchema = z.object({
  lavadorId: z.string().min(1, 'Selecciona el lavador'),
  registradoPor: z.string().trim().min(1, 'Indica quién marca la asistencia'),
})

export const cambiarDescansoInputSchema = z.object({
  lavadorId: z.string().min(1, 'Selecciona el lavador'),
  actualizadoPor: z.string().trim().min(1, 'Indica quién hace el cambio'),
})

export type DiaDescanso = z.infer<typeof diaDescansoSchema>
export type AsistenciaLavador = z.infer<typeof asistenciaLavadorSchema>
export type MarcarAsistenciaInput = z.infer<typeof marcarAsistenciaInputSchema>
export type CambiarDescansoInput = z.infer<typeof cambiarDescansoInputSchema>
