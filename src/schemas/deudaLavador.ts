import { z } from 'zod'

// 'prestamo' = efectivo entregado de la caja del turno. 'consumo' = productos de nevera cargados
// a una cuenta que se cerró contra este lavador en vez de cobrarse en plata. 'liquidacion' = fila
// que inserta generar_liquidacion con el monto (negativo) que se descontó en ese corte. Ver
// 0065_deuda_lavadores.sql.
export const tipoDeudaLavadorSchema = z.enum(['prestamo', 'consumo', 'liquidacion'])

const nullableTrimmedString = z
  .string()
  .trim()
  .nullish()
  .transform((value) => value ?? undefined)

export const deudaLavadorSchema = z.object({
  id: z.string(),
  lavadorId: z.string(),
  tipo: tipoDeudaLavadorSchema,
  // Con signo: prestamo/consumo positivos, liquidacion negativo. La suma de las filas 'activo'
  // de un lavador es su deuda pendiente actual.
  monto: z.number().int(),
  turnoId: nullableTrimmedString,
  cuentaId: nullableTrimmedString,
  liquidacionId: nullableTrimmedString,
  motivo: nullableTrimmedString,
  registradoPor: z.string(),
  estado: z.enum(['activo', 'anulado']),
  motivoAnulacion: nullableTrimmedString,
  anuladaPor: nullableTrimmedString,
  anuladaEn: nullableTrimmedString,
  creadoEn: z.string(),
})

export const prestamoLavadorInputSchema = z.object({
  lavadorId: z.string().min(1, 'Selecciona un lavador'),
  monto: z.number().int().positive('El monto debe ser mayor a cero'),
  motivo: z.string().trim().optional(),
  turnoId: z.string().uuid('No hay turno abierto para prestar desde su caja'),
  registradoPor: z.string().trim().min(1, 'Indica quién presta'),
})

export const anularDeudaLavadorInputSchema = z.object({
  motivo: z.string().trim().min(3, 'El motivo de anulación es obligatorio'),
  anuladaPor: z.string().trim().min(1, 'Indica quién anula'),
})

export type TipoDeudaLavador = z.infer<typeof tipoDeudaLavadorSchema>
export type DeudaLavador = z.infer<typeof deudaLavadorSchema>
export type PrestamoLavadorInput = z.infer<typeof prestamoLavadorInputSchema>
export type AnularDeudaLavadorInput = z.infer<typeof anularDeudaLavadorInputSchema>
