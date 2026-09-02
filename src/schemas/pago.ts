import { z } from 'zod'
import { metodoPagoBaseSchema } from './orden'

// Una línea de pago dentro de un cobro partido (1–3 por cobro). El total del cobro se reparte
// entre estas líneas y la suma debe cuadrar EXACTO (regla confirmada: sin saldo pendiente).
export const pagoLineaInputSchema = z
  .object({
    metodo: metodoPagoBaseSchema,
    // Enteros COP, igual que el resto de montos del sistema.
    monto: z.number().int().positive('Cada monto debe ser mayor a cero'),
    referencia: z.string().trim().optional(),
  })
  .refine((l) => (l.metodo !== 'transferencia' && l.metodo !== 'datafono') || !!l.referencia, {
    message: 'La referencia es obligatoria en transferencia o datáfono',
    path: ['referencia'],
  })

// El chequeo "1–3 líneas que suman exacto el total + referencia por línea" vive en
// `pagoLineasCuadra` (src/lib/pagoLineas.ts, sobre el borrador del formulario) y se revalida en
// las RPC `cobrar_orden` / `registrar_venta_carrito` / `corregir_pagos` (el borde de confianza).

export const pagoSchema = z.object({
  id: z.string(),
  ordenId: z
    .string()
    .nullish()
    .transform((v) => v ?? undefined),
  ventaGrupoId: z
    .string()
    .nullish()
    .transform((v) => v ?? undefined),
  cuentaId: z
    .string()
    .nullish()
    .transform((v) => v ?? undefined),
  metodoPago: metodoPagoBaseSchema,
  monto: z.number().int().positive(),
  referenciaPago: z
    .string()
    .trim()
    .nullish()
    .transform((v) => v ?? undefined),
  turnoId: z
    .string()
    .nullish()
    .transform((v) => v ?? undefined),
  anulado: z.boolean(),
  esCorreccion: z.boolean(),
  motivoCorreccion: z
    .string()
    .nullish()
    .transform((v) => v ?? undefined),
  corregidoPor: z
    .string()
    .nullish()
    .transform((v) => v ?? undefined),
  corregidoEn: z
    .string()
    .nullish()
    .transform((v) => v ?? undefined),
  creadoEn: z.string(),
})

export type PagoLineaInput = z.infer<typeof pagoLineaInputSchema>
export type Pago = z.infer<typeof pagoSchema>
