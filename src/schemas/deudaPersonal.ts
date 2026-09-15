import { z } from 'zod'

// Deudas del personal (0070, generaliza 0065): lavadores, jefes de patio y gerencia.
//   · Suman a lo que debe: 'prestamo' (efectivo de la caja), 'consumo' (cuenta de nevera cargada,
//     a precio de venta), 'faltante' (faltante de conteo que gerencia decidió cobrar, a costo).
//   · Restan: 'abono' (en efectivo a la caja del turno o por fuera) y 'liquidacion' (descuento
//     elegido al generar la liquidación).
// Ledger con signo: la deuda pendiente es la suma de las filas 'activo'.
export const tipoDeudaSchema = z.enum(['prestamo', 'consumo', 'faltante', 'abono', 'liquidacion'])
export const metodoAbonoSchema = z.enum(['efectivo', 'fuera'])

const nullableTrimmedString = z
  .string()
  .trim()
  .nullish()
  .transform((value) => value ?? undefined)

export const deudaPersonalSchema = z.object({
  id: z.string(),
  lavadorId: nullableTrimmedString,
  personaId: nullableTrimmedString,
  tipo: tipoDeudaSchema,
  monto: z.number().int(),
  turnoId: nullableTrimmedString,
  cuentaId: nullableTrimmedString,
  liquidacionId: nullableTrimmedString,
  liquidacionJefeZonaId: nullableTrimmedString,
  conteoLineaId: nullableTrimmedString,
  metodoAbono: metodoAbonoSchema.nullish().transform((v) => v ?? undefined),
  motivo: nullableTrimmedString,
  registradoPor: z.string(),
  estado: z.enum(['activo', 'anulado']),
  motivoAnulacion: nullableTrimmedString,
  anuladaPor: nullableTrimmedString,
  anuladaEn: nullableTrimmedString,
  creadoEn: z.string(),
})

// A quién se le carga: un lavador (tabla `lavadores`) o una persona con cuenta del sistema.
export const deudorSchema = z.object({
  tipo: z.enum(['lavador', 'persona']),
  id: z.string().min(1, 'Selecciona a quién'),
})

export const prestamoInputSchema = z.object({
  deudor: deudorSchema,
  monto: z.number().int().positive('El monto debe ser mayor a cero'),
  motivo: z.string().trim().optional(),
})

export const abonoInputSchema = z
  .object({
    deudor: deudorSchema,
    monto: z.number().int().positive('El abono debe ser mayor a cero'),
    metodo: metodoAbonoSchema,
    motivo: z.string().trim().optional(),
  })
  .refine((d) => d.metodo === 'efectivo' || (d.motivo ?? '').length >= 5, {
    message: 'Indica cómo se pagó (ej. transferencia Nequi, descuento de nómina)',
    path: ['motivo'],
  })

export const TIPO_DEUDA_LABEL: Record<TipoDeuda, string> = {
  prestamo: 'Préstamo',
  consumo: 'Consumo de nevera',
  faltante: 'Faltante de inventario',
  abono: 'Abono',
  liquidacion: 'Descuento en liquidación',
}

export type TipoDeuda = z.infer<typeof tipoDeudaSchema>
export type MetodoAbono = z.infer<typeof metodoAbonoSchema>
export type DeudaPersonal = z.infer<typeof deudaPersonalSchema>
export type Deudor = z.infer<typeof deudorSchema>
export type PrestamoInput = z.infer<typeof prestamoInputSchema>
export type AbonoInput = z.infer<typeof abonoInputSchema>
