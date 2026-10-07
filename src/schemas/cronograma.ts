import { z } from 'zod'

const nullableString = z
  .string()
  .nullish()
  .transform((value) => value ?? undefined)

// Lo que NO se deriva de `dias_descanso`: el cambio a mano de quién entra a las 7am (y lava el
// baño) o sale a las 7pm, y el seguimiento de si el baño se hizo. Una fila por fecha, creada la
// primera vez que alguien cambia o marca algo ese día (0082).
export const cronogramaExtraSchema = z.object({
  id: z.string(),
  fecha: z.string(),
  banoLavadorId: nullableString,
  saleLavadorId: nullableString,
  banoHechoEn: nullableString,
  banoHechoPor: nullableString,
  actualizadoEn: z.string(),
  actualizadoPor: nullableString,
})

// Un lavador con permiso ese día no trabaja y no se le marca asistencia (ni cuenta como falta).
export const permisoLavadorSchema = z.object({
  id: z.string(),
  lavadorId: z.string(),
  fecha: z.string(),
  motivo: z.string(),
  registradoPor: z.string(),
  anulado: z.boolean(),
  creadoEn: z.string(),
})

export const permisoInputSchema = z.object({
  lavadorId: z.string().min(1, 'Selecciona el lavador'),
  motivo: z.string().trim().min(3, 'Indica el motivo del permiso (mínimo 3 caracteres)'),
})

export type CronogramaExtra = z.infer<typeof cronogramaExtraSchema>
export type PermisoLavador = z.infer<typeof permisoLavadorSchema>
export type PermisoInput = z.infer<typeof permisoInputSchema>
