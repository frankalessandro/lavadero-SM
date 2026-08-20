import { z } from 'zod'

export const rolCajaSchema = z.enum(['jefe_zona', 'vigilante'])

const nullableTrimmedString = z
  .string()
  .trim()
  .nullish()
  .transform((value) => value ?? undefined)

const nullableNumber = z
  .number()
  .int()
  .nullish()
  .transform((value) => value ?? undefined)

const nullableTimestamp = z
  .string()
  .nullish()
  .transform((value) => value ?? undefined)

export const turnoCajaSchema = z.object({
  id: z.string(),
  rol: rolCajaSchema,
  responsable: z.string(),
  // Quién abrió el turno (inmutable). `responsableActual` es quién está a cargo AHORA — igual
  // al abrir, pero se puede transferir a mitad de turno sin cerrar/reabrir (ver transferirResponsable).
  responsableActual: z.string(),
  baseInicial: z.number().int().nonnegative(),
  abiertoEn: z.string(),
  cerrado: z.boolean(),
  conteoFisico: nullableNumber,
  valorEsperado: nullableNumber,
  diferencia: nullableNumber,
  justificacionDiferencia: nullableTrimmedString,
  cerradoPor: nullableTrimmedString,
  cerradoEn: nullableTimestamp,
  recibidoPor: nullableTrimmedString,
})

export const abrirTurnoInputSchema = z.object({
  rol: rolCajaSchema,
  responsable: z.string().trim().min(1, 'El responsable es obligatorio'),
  baseInicial: z.number().int().nonnegative('La base inicial no puede ser negativa'),
})

// Arqueo ciego (regla de negocio 15): el conteo físico se pide antes de mostrar el valor
// esperado. La justificación es obligatoria solo si hay diferencia — se valida en el data layer
// porque ahí es donde se conoce el valor esperado real, no en este schema de input puro.
export const cerrarTurnoInputSchema = z.object({
  conteoFisico: z.number().int().nonnegative('El conteo debe ser un valor válido'),
  justificacionDiferencia: z.string().trim().optional(),
  recibidoPor: z.string().trim().optional(),
})

// Log append-only de traspasos de responsabilidad (regla antifraude: bitácora de auditoría).
export const traspasoTurnoSchema = z.object({
  id: z.string(),
  turnoId: z.string(),
  de: z.string(),
  a: z.string(),
  hechoEn: z.string(),
})

export type RolCaja = z.infer<typeof rolCajaSchema>
export type TurnoCaja = z.infer<typeof turnoCajaSchema>
export type AbrirTurnoInput = z.infer<typeof abrirTurnoInputSchema>
export type CerrarTurnoInput = z.infer<typeof cerrarTurnoInputSchema>
export type TraspasoTurno = z.infer<typeof traspasoTurnoSchema>
