import { z } from 'zod'

// Liquidación de la comisión del jefe de patio (3% configurable, ver Configuración) — mismo
// shape que liquidacionSchema (src/schemas/liquidacion.ts). Desde 0043 el sujeto es una FK a
// `personal_operativo` (`personaId`); `responsable` quedó como snapshot del nombre al momento del
// corte, para que renombrar a alguien después no reescriba las colillas ya emitidas.
export const liquidacionJefeZonaSchema = z.object({
  id: z.string(),
  responsable: z.string(),
  personaId: z
    .string()
    .nullish()
    .transform((value) => value ?? undefined),
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

export type LiquidacionJefeZona = z.infer<typeof liquidacionJefeZonaSchema>
