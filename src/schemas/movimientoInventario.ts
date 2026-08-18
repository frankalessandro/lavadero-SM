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
export const movimientoInventarioInputSchema = z
  .object({
    productoId: z.string().min(1, 'Selecciona un producto'),
    tipo: tipoMovimientoInventarioSchema,
    cantidad: z.number().int().refine((v) => v !== 0, 'La cantidad no puede ser cero'),
    costoUnitario: z.number().int().nonnegative().optional(),
    proveedor: z.string().trim().optional(),
    motivo: z.string().trim().optional(),
    responsable: z.string().trim().min(1, 'El responsable es obligatorio'),
  })
  .refine((data) => data.tipo !== 'entrada' || data.cantidad > 0, {
    message: 'La cantidad de una entrada debe ser positiva',
    path: ['cantidad'],
  })
  .refine((data) => data.tipo !== 'salida' || data.cantidad < 0, {
    message: 'La cantidad de una salida debe ser negativa (se resta del stock)',
    path: ['cantidad'],
  })
  .refine((data) => data.tipo !== 'ajuste' || !!data.motivo, {
    message: 'El motivo es obligatorio para un ajuste de inventario',
    path: ['motivo'],
  })

export type TipoMovimientoInventario = z.infer<typeof tipoMovimientoInventarioSchema>
export type MovimientoInventario = z.infer<typeof movimientoInventarioSchema>
export type MovimientoInventarioInput = z.infer<typeof movimientoInventarioInputSchema>
