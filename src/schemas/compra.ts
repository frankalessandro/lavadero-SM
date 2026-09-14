import { z } from 'zod'

// 'caja' = se paga con el efectivo del turno de jefe de zona (se resta del arqueo esperado,
// mismo mecanismo que gastos.origen='caja', 0042). 'gerencia' = se paga aparte, no toca ningún
// arqueo. Decisión de Alessandro (2026-09-14): puede ser cualquiera de las dos según el caso, no
// una regla fija — por eso el formulario lo pregunta en cada compra.
export const origenPagoCompraSchema = z.enum(['caja', 'gerencia'])

const nullableTrimmedString = z
  .string()
  .trim()
  .nullish()
  .transform((value) => value ?? undefined)

export const compraItemSchema = z.object({
  id: z.string(),
  compraId: z.string(),
  productoId: z.string(),
  cantidad: z.number().int().positive(),
  // Lo que la persona escribió que pagó por unidad — no un cálculo, no un promedio.
  costoUnitario: z.number().int().nonnegative(),
})

export const compraSchema = z.object({
  id: z.string(),
  consecutivo: z.number().int().positive(),
  proveedor: z.string(),
  numeroFactura: nullableTrimmedString,
  fecha: z.string(), // date YYYY-MM-DD
  origenPago: origenPagoCompraSchema,
  // Turno de jefe_zona que pagó la compra — solo si origenPago = 'caja'.
  turnoId: nullableTrimmedString,
  total: z.number().int().nonnegative(),
  registradoPor: z.string(),
  estado: z.enum(['activa', 'anulada']),
  motivoAnulacion: nullableTrimmedString,
  anuladaPor: nullableTrimmedString,
  anuladaEn: nullableTrimmedString,
  creadoEn: z.string(),
})

export const compraItemInputSchema = z.object({
  productoId: z.string().min(1, 'Selecciona un producto'),
  cantidad: z.number().int().positive('La cantidad debe ser mayor a cero'),
  costoUnitario: z.number().int().nonnegative('El costo debe ser mayor o igual a cero'),
})

export const compraInputSchema = z
  .object({
    proveedor: z.string().trim().min(1, 'El proveedor es obligatorio'),
    numeroFactura: z.string().trim().optional(),
    fecha: z.string().min(1, 'La fecha es obligatoria'),
    origenPago: origenPagoCompraSchema,
    turnoId: z.string().uuid().optional(),
    items: z.array(compraItemInputSchema).min(1, 'La compra no tiene productos'),
    registradoPor: z.string().trim().min(1, 'Indica quién registra la compra'),
  })
  .refine((data) => data.origenPago !== 'caja' || !!data.turnoId, {
    message: 'Si la compra se paga con caja, indica el turno',
    path: ['turnoId'],
  })

export const anularCompraInputSchema = z.object({
  motivo: z.string().trim().min(3, 'El motivo de anulación es obligatorio'),
  anuladaPor: z.string().trim().min(1, 'Indica quién anula la compra'),
})

export type OrigenPagoCompra = z.infer<typeof origenPagoCompraSchema>
export type CompraItem = z.infer<typeof compraItemSchema>
export type Compra = z.infer<typeof compraSchema>
export type CompraInput = z.infer<typeof compraInputSchema>
export type AnularCompraInput = z.infer<typeof anularCompraInputSchema>
