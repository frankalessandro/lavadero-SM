import { z } from 'zod'

export const liquidacionSchema = z.object({
  id: z.string(),
  lavadorId: z.string(),
  periodoInicio: z.string(),
  periodoFin: z.string(),
  // Lo que efectivamente se paga (comisionBruta − deudaDescontada) — mismo significado de
  // siempre, ver 0065_deuda_lavadores.sql.
  monto: z.number().int().nonnegative(),
  // Comisión generada en el periodo, antes de restar deuda (préstamos/nevera). Para liquidaciones
  // de antes de 0065, comisionBruta = monto (backfill) y deudaDescontada = 0.
  comisionBruta: z.number().int().nonnegative(),
  deudaDescontada: z.number().int().nonnegative(),
  pagada: z.boolean(),
  pagadaEn: z
    .string()
    .nullish()
    .transform((value) => value ?? undefined),
  anulada: z.boolean().default(false),
  motivoAnulacion: z.string().nullish().transform((v) => v ?? undefined),
  anuladaPor: z.string().nullish().transform((v) => v ?? undefined),
  anuladaEn: z.string().nullish().transform((v) => v ?? undefined),
  creadoEn: z.string(),
})

export type Liquidacion = z.infer<typeof liquidacionSchema>
