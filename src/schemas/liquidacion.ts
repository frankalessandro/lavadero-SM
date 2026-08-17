import { z } from 'zod'

export const liquidacionSchema = z.object({
  id: z.string(),
  lavadorId: z.string(),
  periodoInicio: z.string(),
  periodoFin: z.string(),
  monto: z.number().int().nonnegative(),
  pagada: z.boolean(),
  pagadaEn: z
    .string()
    .nullish()
    .transform((value) => value ?? undefined),
  creadoEn: z.string(),
})

export type Liquidacion = z.infer<typeof liquidacionSchema>
