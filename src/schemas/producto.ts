import { z } from 'zod'

const nullableNonNegativeInt = z
  .number()
  .int()
  .nonnegative()
  .nullish()
  .transform((value) => value ?? undefined)

export const productoSchema = z.object({
  id: z.string(),
  nombre: z.string(),
  unidadMedida: z.string(),
  stockMinimo: z.number().int().nonnegative(),
  activo: z.boolean(),
  // Precio de venta al público (distinto de costo_unitario, que solo vive en las entradas de
  // movimientos_inventario) — nullable a propósito, mismo criterio "Sin definir" que
  // tarifas_parqueadero. Sin este valor, el producto no aparece como vendible en /jefe-zona/inventario.
  precioVenta: nullableNonNegativeInt,
  // Costo oficial del producto (precio de compra de referencia). Decisión "costo oficial del
  // producto": además de mostrar el margen (precioVenta − costo), sirve de fallback del costo de
  // mercancía vendida cuando el producto todavía no tiene entradas con costo capturado —
  // interno.costo_promedio_producto cae a este valor (0033_costo_producto.sql).
  costo: nullableNonNegativeInt,
})

export const productoInputSchema = productoSchema.omit({ id: true, activo: true }).extend({
  nombre: z.string().trim().min(2, 'El nombre debe tener al menos 2 caracteres'),
  unidadMedida: z.string().trim().min(1, 'La unidad de medida es obligatoria'),
  precioVenta: z.number().int().nonnegative().optional(),
  costo: z.number().int().nonnegative().optional(),
})

export type Producto = z.infer<typeof productoSchema>
export type ProductoInput = z.infer<typeof productoInputSchema>
