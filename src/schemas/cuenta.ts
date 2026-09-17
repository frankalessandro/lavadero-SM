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
  // Cuenta a costo para gerencia (0073): cada producto que se le carga se valora al costo del
  // producto en vez del precio de venta, desde que se agrega — no al cerrar. `destinatarioId` es
  // el gerente que la recibe, `motivo`/`autorizadoPor` quedan fijos desde que se abre.
  aCosto: z.boolean(),
  destinatarioId: nullableTrimmedString,
  motivo: nullableTrimmedString,
  autorizadoPor: nullableTrimmedString,
  creadoEn: z.string(),
})

export const abrirCuentaInputSchema = z
  .object({
    titular: z.string().trim().min(2, 'El nombre de la cuenta es obligatorio'),
    nota: z.string().trim().optional(),
    abiertaPor: z.string().trim().min(1, 'Indica quién abre la cuenta'),
    // A costo (0073): solo para una cuenta de gerencia, con motivo y quién autoriza obligatorios.
    aCosto: z.boolean().default(false),
    destinatarioId: z.string().optional(),
    motivo: z.string().trim().optional(),
    autorizadoPor: z.string().trim().optional(),
  })
  .refine((d) => !d.aCosto || Boolean(d.destinatarioId), {
    message: 'Selecciona a qué gerente se le entrega',
    path: ['destinatarioId'],
  })
  .refine((d) => !d.aCosto || (d.motivo ?? '').length >= 5, {
    message: 'Indica el motivo de la cuenta a costo',
    path: ['motivo'],
  })
  .refine((d) => !d.aCosto || (d.autorizadoPor ?? '').length >= 1, {
    message: 'Indica quién autoriza la cuenta a costo',
    path: ['autorizadoPor'],
  })

export const anularCuentaInputSchema = z.object({
  motivo: z.string().trim().min(3, 'El motivo de anulación es obligatorio'),
  anuladaPor: z.string().trim().min(1, 'Indica quién anula la cuenta'),
  // 0068: ¿los productos se consumieron (salen del inventario) o volvieron a la nevera?
  seConsumio: z.boolean({ error: 'Indica si los productos se consumieron o volvieron a la nevera' }),
})

export type EstadoCuenta = z.infer<typeof estadoCuentaSchema>
export type Cuenta = z.infer<typeof cuentaSchema>
export type AbrirCuentaInput = z.infer<typeof abrirCuentaInputSchema>
export type AnularCuentaInput = z.infer<typeof anularCuentaInputSchema>
