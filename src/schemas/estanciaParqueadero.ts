import { z } from 'zod'

export const modalidadParqueaderoSchema = z.enum(['noche', 'mensualidad', 'fijo'])
export const metodoPagoParqueaderoSchema = z.enum(['efectivo', 'transferencia', 'datafono'])
// Clases propias del parqueadero (0075), independientes de `tipos_vehiculo` del lavadero: la
// tarifa depende de la clase. "carro" agrupa automóvil y camionetas.
export const claseVehiculoParqueaderoSchema = z.enum(['carro', 'moto', 'motocarro'])

export const CLASE_VEHICULO_LABEL: Record<z.infer<typeof claseVehiculoParqueaderoSchema>, string> = {
  carro: 'Carro',
  moto: 'Moto',
  motocarro: 'Moto carro',
}

// Postgres devuelve `null` (no `undefined`) en las columnas nullable sin valor —
// `.nullish()` + transform normaliza ambos a `undefined` para el resto de la app.
export const estanciaParqueaderoSchema = z.object({
  id: z.string(),
  consecutivo: z.number().int(),
  placa: z.string(),
  modalidad: modalidadParqueaderoSchema,
  claseVehiculo: claseVehiculoParqueaderoSchema,
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
  // Parte del `cobro` que corresponde a la multa por salir fuera de ventana (regla 7).
  multa: z.number().int().nonnegative(),
  metodoPago: metodoPagoParqueaderoSchema.nullish().transform((value) => value ?? undefined),
  estado: z.enum(['adentro', 'fuera']),
})

export const entradaInputSchema = z.object({
  placa: z.string().trim().min(1, 'La placa es obligatoria').toUpperCase(),
  modalidad: modalidadParqueaderoSchema,
  claseVehiculo: claseVehiculoParqueaderoSchema,
})

export type ModalidadParqueadero = z.infer<typeof modalidadParqueaderoSchema>
export type ClaseVehiculoParqueadero = z.infer<typeof claseVehiculoParqueaderoSchema>
export type MetodoPagoParqueadero = z.infer<typeof metodoPagoParqueaderoSchema>
export type EstanciaParqueadero = z.infer<typeof estanciaParqueaderoSchema>
export type EntradaInput = z.infer<typeof entradaInputSchema>
