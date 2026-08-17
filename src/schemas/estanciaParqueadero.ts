import { z } from 'zod'

export const modalidadParqueaderoSchema = z.enum(['noche', 'mensualidad', 'fijo'])
export const metodoPagoParqueaderoSchema = z.enum(['efectivo', 'transferencia'])

export const estanciaParqueaderoSchema = z.object({
  id: z.string(),
  placa: z.string(),
  modalidad: modalidadParqueaderoSchema,
  horaIngreso: z.string(),
  horaSalida: z.string().optional(),
  cobro: z.number().int().nonnegative().optional(),
  metodoPago: metodoPagoParqueaderoSchema.optional(),
  estado: z.enum(['adentro', 'fuera']),
})

export const entradaInputSchema = z.object({
  placa: z.string().trim().min(1, 'La placa es obligatoria').toUpperCase(),
  modalidad: modalidadParqueaderoSchema,
})

export type ModalidadParqueadero = z.infer<typeof modalidadParqueaderoSchema>
export type EstanciaParqueadero = z.infer<typeof estanciaParqueaderoSchema>
export type EntradaInput = z.infer<typeof entradaInputSchema>
