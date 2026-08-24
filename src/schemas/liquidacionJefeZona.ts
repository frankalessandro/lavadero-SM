import { z } from 'zod'

// Liquidación de la comisión del jefe de patio (3% configurable, ver Configuración) — mismo
// shape que liquidacionSchema (src/schemas/liquidacion.ts) pero `responsable` es texto libre en
// vez de un lavadorId con FK, porque todavía no hay tabla de "jefes de zona" con id propio (ver
// nota en la migración 0028_comision_jefe_zona.sql).
export const liquidacionJefeZonaSchema = z.object({
  id: z.string(),
  responsable: z.string(),
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
