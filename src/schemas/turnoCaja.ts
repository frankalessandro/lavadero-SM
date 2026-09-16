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
  // al abrir, pero se puede transferir a mitad de turno sin cerrar/reabrir (traspaso en dos pasos,
  // ver solicitarTraspaso/aceptarTraspaso en src/data/turnos.ts, 0072).
  responsableActual: z.string(),
  // La persona de verdad: FK a `perfiles` — la cuenta ES la persona desde 0056 (antes era el
  // roster `personal_operativo` de 0043). El texto de arriba queda como evidencia de lo que se
  // tecleó en su momento; estos ids son los que se usan para agrupar y liquidar. Opcionales
  // porque los turnos anteriores a 0043 que no mapearon quedan sin persona.
  responsablePersonaId: nullableTrimmedString,
  responsableActualPersonaId: nullableTrimmedString,
  // Traspaso en dos pasos (0072): mientras esto tenga valor, el turno sigue a nombre de
  // `responsableActual*` — solo cambia cuando la cuenta destino acepta con su propia sesión.
  traspasoPendienteAPersonaId: nullableTrimmedString,
  traspasoPendienteANombre: nullableTrimmedString,
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

// El responsable ya NO se elige — es siempre la cuenta autenticada que abre el turno (0072, RPC
// `abrir_turno` la deriva de auth.uid() en el servidor). El input del cliente solo trae lo que de
// verdad se decide en pantalla.
export const abrirTurnoInputSchema = z.object({
  rol: rolCajaSchema,
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
  dePersonaId: nullableTrimmedString,
  aPersonaId: nullableTrimmedString,
  hechoEn: z.string(),
  // Conteo de inventario hecho al traspasar (0068); vacío si el turno no tenía inventario a cargo.
  conteoId: nullableTrimmedString,
})

export type RolCaja = z.infer<typeof rolCajaSchema>
export type TurnoCaja = z.infer<typeof turnoCajaSchema>
export type AbrirTurnoInput = z.infer<typeof abrirTurnoInputSchema>
export type CerrarTurnoInput = z.infer<typeof cerrarTurnoInputSchema>
export type TraspasoTurno = z.infer<typeof traspasoTurnoSchema>
