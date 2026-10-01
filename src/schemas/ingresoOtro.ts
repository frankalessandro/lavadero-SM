import { z } from 'zod'
import { metodoPagoBaseSchema } from './orden'

// Otros ingresos (migración 0078): plata que entra al negocio y no es lavado, nevera ni
// parqueadero — hoy el alquiler del carro de comidas; mañana patrocinios, publicidad, etc.
// Es gestión de gerencia: no entra a ningún arqueo de caja.

export const categoriaIngresoSchema = z.object({
  id: z.string(),
  nombre: z.string(),
  activo: z.boolean(),
})

export const categoriaIngresoInputSchema = z.object({
  nombre: z.string().trim().min(2, 'El nombre debe tener al menos 2 caracteres'),
})

const nullableTrimmedString = z
  .string()
  .trim()
  .nullish()
  .transform((value) => value ?? undefined)

export const ingresoOtroSchema = z.object({
  id: z.string(),
  consecutivo: z.number().int(),
  fecha: z.string(), // date (YYYY-MM-DD)
  categoriaId: z.string(),
  descripcion: z.string(),
  monto: z.number().int().positive(),
  metodoPago: metodoPagoBaseSchema,
  registradoPor: z.string(),
  estado: z.enum(['activa', 'anulada']),
  motivoAnulacion: nullableTrimmedString,
  anuladaPor: nullableTrimmedString,
  anuladaEn: nullableTrimmedString,
  creadoEn: z.string(),
})

// Quién registra lo fija el servidor (cuenta autenticada), no viaja desde el cliente.
export const ingresoOtroInputSchema = z.object({
  fecha: z.string().min(1, 'La fecha es obligatoria'),
  categoriaId: z.string().min(1, 'Selecciona una categoría'),
  descripcion: z.string().trim().min(1, 'La descripción es obligatoria'),
  monto: z.number().int().positive('El monto debe ser mayor a 0'),
  metodoPago: metodoPagoBaseSchema,
})

export const anularIngresoOtroInputSchema = z.object({
  motivo: z.string().trim().min(3, 'El motivo de anulación es obligatorio'),
})

export type CategoriaIngreso = z.infer<typeof categoriaIngresoSchema>
export type CategoriaIngresoInput = z.infer<typeof categoriaIngresoInputSchema>
export type IngresoOtro = z.infer<typeof ingresoOtroSchema>
export type IngresoOtroInput = z.infer<typeof ingresoOtroInputSchema>
