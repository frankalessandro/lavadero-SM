import { z } from 'zod'
import { metodoPagoSchema } from './orden'

export const estadoVentaSchema = z.enum(['activa', 'anulada'])

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
    vendidoPor: z.string().trim().min(1, 'El responsable es obligatorio'),
  })
  .refine((data) => data.metodoPago !== 'transferencia' || !!data.referenciaPago, {
    message: 'La referencia es obligatoria en pagos por transferencia',
    path: ['referenciaPago'],
  })

export const anularVentaInputSchema = z.object({
  motivo: z.string().trim().min(3, 'El motivo de anulación es obligatorio'),
  anuladaPor: z.string().trim().min(1, 'Indica quién anula la venta'),
})

export type EstadoVenta = z.infer<typeof estadoVentaSchema>
export type Venta = z.infer<typeof ventaSchema>
export type VentaInput = z.infer<typeof ventaInputSchema>
export type AnularVentaInput = z.infer<typeof anularVentaInputSchema>
