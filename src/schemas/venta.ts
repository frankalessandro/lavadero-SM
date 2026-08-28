import { z } from 'zod'
import { metodoPagoSchema } from './orden'

// `pendiente` = producto cargado a una orden de lavado, aún sin cobrar y sin descontar
// inventario. Pasa a `activa` (con su salida de stock) cuando se cobra la orden. Ver
// 0035_venta_asociada_a_orden.sql.
export const estadoVentaSchema = z.enum(['activa', 'anulada', 'pendiente'])

const nullableTrimmedString = z
  .string()
  .trim()
  .nullish()
  .transform((value) => value ?? undefined)

const nullableTimestamp = z
  .string()
  .nullish()
  .transform((value) => value ?? undefined)

// Venta de un producto de inventario (agua, cerveza, etc.) — registrada por jefe de zona,
// consecutivo propio para el tiquete (mismo estándar antifraude que las órdenes). Sin comisión:
// 100% va al negocio (regla confirmada, ver CLAUDE.md).
export const ventaSchema = z.object({
  id: z.string(),
  consecutivo: z.number().int().positive(),
  productoId: z.string(),
  cantidad: z.number().int().positive(),
  // Snapshot del precio de venta al momento de vender — no se recalcula si después cambia el
  // precio_venta del producto (mismo criterio que ordenes.precio).
  precioUnitario: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
  metodoPago: metodoPagoSchema,
  referenciaPago: nullableTrimmedString,
  turnoId: nullableTrimmedString,
  // Orden de lavado a la que se cargó el producto (null = venta aparte de mostrador). Cuando
  // está presente, la venta se cobra junto con el lavado al entregar el vehículo.
  ordenId: nullableTrimmedString,
  vendidoPor: z.string().trim().min(1),
  estado: estadoVentaSchema,
  motivoAnulacion: nullableTrimmedString,
  anuladaPor: nullableTrimmedString,
  anuladaEn: nullableTimestamp,
  creadoEn: z.string(),
})

export const ventaInputSchema = z
  .object({
    productoId: z.string().min(1, 'Selecciona un producto'),
    cantidad: z.number().int().positive('La cantidad debe ser mayor a cero'),
    metodoPago: metodoPagoSchema,
    referenciaPago: z.string().trim().optional(),
    // Cuando viene, la venta se carga a esa orden como `pendiente` y su método/referencia
    // reales se definen al cobrar la orden — por eso la referencia no se exige acá en ese caso.
    ordenId: z.string().uuid().optional(),
    vendidoPor: z.string().trim().min(1, 'El responsable es obligatorio'),
  })
  .refine(
    (data) =>
      !!data.ordenId ||
      (data.metodoPago !== 'transferencia' && data.metodoPago !== 'datafono') ||
      !!data.referenciaPago,
    {
      message: 'La referencia es obligatoria en pagos por transferencia o datáfono',
      path: ['referenciaPago'],
    },
  )

export const anularVentaInputSchema = z.object({
  motivo: z.string().trim().min(3, 'El motivo de anulación es obligatorio'),
  anuladaPor: z.string().trim().min(1, 'Indica quién anula la venta'),
})

export type EstadoVenta = z.infer<typeof estadoVentaSchema>
export type Venta = z.infer<typeof ventaSchema>
export type VentaInput = z.infer<typeof ventaInputSchema>
export type AnularVentaInput = z.infer<typeof anularVentaInputSchema>
