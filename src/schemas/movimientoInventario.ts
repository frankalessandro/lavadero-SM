import { z } from 'zod'

export const tipoMovimientoInventarioSchema = z.enum(['entrada', 'salida', 'ajuste'])

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

export const movimientoInventarioSchema = z.object({
  id: z.string(),
  productoId: z.string(),
  tipo: tipoMovimientoInventarioSchema,
  cantidad: z.number().int(), // con signo: negativo resta del stock
  costoUnitario: nullableNumber,
  proveedor: nullableTrimmedString,
  motivo: nullableTrimmedString,
  responsable: z.string(),
  creadoEn: z.string(),
})

// `cantidad` ya llega con el signo aplicado por la UI (entrada positiva, salida negativa,
// ajuste el que el usuario indique) — el data layer no reinterpreta el signo.
// Desde 0069 va por la RPC `registrar_movimiento_inventario`: la justificación es obligatoria en
// todo movimiento manual y el responsable lo fija el servidor (el del turno abierto, o la cuenta de
// admin) — no se escribe a mano. Mismas reglas repetidas acá solo para el mensaje por campo.
export const MIN_JUSTIFICACION_MOVIMIENTO = 10

export const movimientoInventarioInputSchema = z
  .object({
    productoId: z.string().min(1, 'Selecciona un producto'),
    tipo: tipoMovimientoInventarioSchema,
    cantidad: z.number().int().refine((v) => v !== 0, 'La cantidad no puede ser cero'),
    costoUnitario: z.number().int().nonnegative().optional(),
    proveedor: z.string().trim().optional(),
    motivo: z
      .string()
      .trim()
      .min(MIN_JUSTIFICACION_MOVIMIENTO, `La justificación es obligatoria (mínimo ${MIN_JUSTIFICACION_MOVIMIENTO} caracteres)`),
  })
  .refine((data) => data.tipo !== 'entrada' || data.cantidad > 0, {
    message: 'La cantidad de una entrada debe ser positiva',
    path: ['cantidad'],
  })
  .refine((data) => data.tipo !== 'salida' || data.cantidad < 0, {
    message: 'La cantidad de una salida debe ser negativa (se resta del stock)',
    path: ['cantidad'],
  })

export type TipoMovimientoInventario = z.infer<typeof tipoMovimientoInventarioSchema>
export type MovimientoInventario = z.infer<typeof movimientoInventarioSchema>
export type MovimientoInventarioInput = z.infer<typeof movimientoInventarioInputSchema>
