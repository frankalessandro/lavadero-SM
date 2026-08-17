import { z } from 'zod'

export const metodoPagoSchema = z.enum(['efectivo', 'transferencia'])
export const estadoOrdenSchema = z.enum(['en_proceso', 'listo', 'entregado'])

export const ordenSchema = z.object({
  id: z.string(),
  consecutivo: z.number().int().positive(),
  placa: z.string().trim().min(1),
  clienteNombre: z.string().trim().min(1),
  clienteTelefono: z.string().trim().optional(),
  tipoVehiculoId: z.string(),
  comboId: z.string(),
  lavadorId: z.string(),
  precio: z.number().int().positive(),
  comisionLavador: z.number().int().nonnegative(),
  comisionNegocio: z.number().int().nonnegative(),
  metodoPago: metodoPagoSchema,
  referenciaPago: z.string().trim().optional(),
  observaciones: z.string().trim().optional(),
  estado: estadoOrdenSchema,
  creadoEn: z.string(),
})

export const ordenInputSchema = z
  .object({
    placa: z.string().trim().min(1, 'La placa es obligatoria').toUpperCase(),
    clienteNombre: z.string().trim().min(1, 'El nombre del cliente es obligatorio'),
    clienteTelefono: z.string().trim().optional(),
    tipoVehiculoId: z.string().min(1, 'Selecciona el tipo de vehículo'),
    comboId: z.string().min(1, 'Selecciona el combo'),
    lavadorId: z.string().min(1, 'Selecciona el lavador'),
    metodoPago: metodoPagoSchema,
    referenciaPago: z.string().trim().optional(),
    observaciones: z.string().trim().optional(),
  })
  .refine((data) => data.metodoPago !== 'transferencia' || !!data.referenciaPago, {
    message: 'La referencia es obligatoria en pagos por transferencia',
    path: ['referenciaPago'],
  })

export type Orden = z.infer<typeof ordenSchema>
export type OrdenInput = z.infer<typeof ordenInputSchema>
export type MetodoPago = z.infer<typeof metodoPagoSchema>
export type EstadoOrden = z.infer<typeof estadoOrdenSchema>
