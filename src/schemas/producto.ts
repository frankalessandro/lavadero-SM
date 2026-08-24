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
})

export const productoInputSchema = productoSchema.omit({ id: true, activo: true }).extend({
  nombre: z.string().trim().min(2, 'El nombre debe tener al menos 2 caracteres'),
  unidadMedida: z.string().trim().min(1, 'La unidad de medida es obligatoria'),
  precioVenta: z.number().int().nonnegative().optional(),
})

export type Producto = z.infer<typeof productoSchema>
export type ProductoInput = z.infer<typeof productoInputSchema>
