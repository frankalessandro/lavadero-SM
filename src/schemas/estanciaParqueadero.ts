import { z } from 'zod'

export const modalidadParqueaderoSchema = z.enum(['noche', 'mensualidad', 'fijo'])
export const metodoPagoParqueaderoSchema = z.enum(['efectivo', 'transferencia', 'datafono'])

// Postgres devuelve `null` (no `undefined`) en las columnas nullable sin valor —
// `.nullish()` + transform normaliza ambos a `undefined` para el resto de la app.
export const estanciaParqueaderoSchema = z.object({
  id: z.string(),
  placa: z.string(),
  modalidad: modalidadParqueaderoSchema,
  horaIngreso: z.string(),
  horaSalida: z
    .string()
    .nullish()
    .transform((value) => value ?? undefined),
  cobro: z
    .number()
    .int()
    .nonnegative()
    .nullish()
    .transform((value) => value ?? undefined),
  metodoPago: metodoPagoParqueaderoSchema.nullish().transform((value) => value ?? undefined),
  estado: z.enum(['adentro', 'fuera']),
})

export const entradaInputSchema = z.object({
  placa: z.string().trim().min(1, 'La placa es obligatoria').toUpperCase(),
  modalidad: modalidadParqueaderoSchema,
})

export type ModalidadParqueadero = z.infer<typeof modalidadParqueaderoSchema>
export type MetodoPagoParqueadero = z.infer<typeof metodoPagoParqueaderoSchema>
export type EstanciaParqueadero = z.infer<typeof estanciaParqueaderoSchema>
export type EntradaInput = z.infer<typeof entradaInputSchema>
