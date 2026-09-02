import { z } from 'zod'

// Cuenta abierta a nombre de alguien sin vehículo (lavador, acompañante, transeúnte) — se le
// cargan productos a lo largo del rato (ventas `pendiente` con `cuenta_id`) y se cierra cobrando
// todo junto. Ver 0041_cuentas_abiertas.sql.
export const estadoCuentaSchema = z.enum(['abierta', 'cerrada', 'anulada'])

const nullableTrimmedString = z
  .string()
  .trim()
  .nullish()
  .transform((value) => value ?? undefined)

const nullableTimestamp = z
  .string()
  .nullish()
  .transform((value) => value ?? undefined)

export const cuentaSchema = z.object({
  id: z.string(),
  titular: z.string().trim().min(1),
  nota: nullableTrimmedString,
  estado: estadoCuentaSchema,
  abiertaPor: z.string().trim().min(1),
  abiertaEn: z.string(),
  cerradaEn: nullableTimestamp,
  cerradaPor: nullableTrimmedString,
  turnoId: nullableTrimmedString,
  creadoEn: z.string(),
})

export const abrirCuentaInputSchema = z.object({
  titular: z.string().trim().min(2, 'El nombre de la cuenta es obligatorio'),
  nota: z.string().trim().optional(),
  abiertaPor: z.string().trim().min(1, 'Indica quién abre la cuenta'),
})

export const anularCuentaInputSchema = z.object({
  motivo: z.string().trim().min(3, 'El motivo de anulación es obligatorio'),
  anuladaPor: z.string().trim().min(1, 'Indica quién anula la cuenta'),
})

export type EstadoCuenta = z.infer<typeof estadoCuentaSchema>
export type Cuenta = z.infer<typeof cuentaSchema>
export type AbrirCuentaInput = z.infer<typeof abrirCuentaInputSchema>
export type AnularCuentaInput = z.infer<typeof anularCuentaInputSchema>
