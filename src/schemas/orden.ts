import { z } from 'zod'

export const metodoPagoSchema = z.enum(['efectivo', 'transferencia'])
export const estadoOrdenSchema = z.enum(['en_proceso', 'listo', 'entregado', 'anulada'])

// Postgres devuelve `null` (no `undefined`) en las columnas nullable sin valor —
// `.nullish()` + transform normaliza ambos a `undefined` para el resto de la app.
const nullableTrimmedString = z
  .string()
  .trim()
  .nullish()
  .transform((value) => value ?? undefined)

const nullableTimestamp = z
  .string()
  .nullish()
  .transform((value) => value ?? undefined)

const nullableSegundos = z
  .number()
  .int()
  .nonnegative()
  .nullish()
  .transform((value) => value ?? undefined)

export const ordenSchema = z.object({
  id: z.string(),
  consecutivo: z.number().int().positive(),
  placa: z.string().trim().min(1),
  clienteNombre: z.string().trim().min(1),
  clienteTelefono: nullableTrimmedString,
  clienteCorreo: nullableTrimmedString,
  tipoVehiculoId: z.string(),
  comboId: z.string(),
  lavadorId: z.string(),
  precio: z.number().int().positive(),
  comisionLavador: z.number().int().nonnegative(),
  comisionNegocio: z.number().int().nonnegative(),
  // Se conoce recién al cobrar/entregar, no al registrar el vehículo.
  metodoPago: metodoPagoSchema.nullish().transform((value) => value ?? undefined),
  referenciaPago: nullableTrimmedString,
  observaciones: nullableTrimmedString,
  estado: estadoOrdenSchema,
  creadoEn: z.string(),
  listaEn: nullableTimestamp,
  entregadaEn: nullableTimestamp,
  // KPIs de M3/M10: duración fijada al momento de cada transición, no recalculada después.
  tiempoLavadoSegundos: nullableSegundos,
  tiempoEsperaEntregaSegundos: nullableSegundos,
  liquidacionId: nullableTimestamp,
  motivoAnulacion: nullableTrimmedString,
  anuladaEn: nullableTimestamp,
  anuladaPor: nullableTrimmedString,
})

export const anularOrdenInputSchema = z.object({
  motivo: z.string().trim().min(3, 'El motivo de anulación es obligatorio'),
  anuladaPor: z.string().trim().min(1, 'Indica quién anula la orden'),
})

// Registro del vehículo — sin datos de pago, eso llega en el cobro (M2 real: se cobra al
// entregar, no al recibir el vehículo).
export const ordenInputSchema = z.object({
  placa: z.string().trim().min(1, 'La placa es obligatoria').toUpperCase(),
  clienteNombre: z.string().trim().min(1, 'El nombre del cliente es obligatorio'),
  clienteTelefono: z.string().trim().optional(),
  clienteCorreo: z.string().trim().email('Correo inválido').optional(),
  tipoVehiculoId: z.string().min(1, 'Selecciona el tipo de vehículo'),
  comboId: z.string().min(1, 'Selecciona el combo'),
  lavadorId: z.string().min(1, 'Selecciona el lavador'),
  observaciones: z.string().trim().optional(),
})

// Edición de datos de contacto del cliente mientras el vehículo sigue en_proceso o listo (antes
// de cobrar/entregar) — placa/combo/tipo no se tocan aquí, esos definen el servicio ya registrado.
export const clienteInfoInputSchema = z.object({
  clienteNombre: z.string().trim().min(1, 'El nombre del cliente es obligatorio'),
  clienteTelefono: z.string().trim().optional(),
  clienteCorreo: z.string().trim().email('Correo inválido').optional(),
})

// Cobro + entrega (M3: no se entrega sin haberse cobrado).
export const cobroInputSchema = z
  .object({
    metodoPago: metodoPagoSchema,
    referenciaPago: z.string().trim().optional(),
  })
  .refine((data) => data.metodoPago !== 'transferencia' || !!data.referenciaPago, {
    message: 'La referencia es obligatoria en pagos por transferencia',
    path: ['referenciaPago'],
  })

export type Orden = z.infer<typeof ordenSchema>
export type OrdenInput = z.infer<typeof ordenInputSchema>
export type CobroInput = z.infer<typeof cobroInputSchema>
export type ClienteInfoInput = z.infer<typeof clienteInfoInputSchema>
export type AnularOrdenInput = z.infer<typeof anularOrdenInputSchema>
export type MetodoPago = z.infer<typeof metodoPagoSchema>
export type EstadoOrden = z.infer<typeof estadoOrdenSchema>
