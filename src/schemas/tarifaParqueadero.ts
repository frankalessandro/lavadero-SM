import { z } from 'zod'
import { claseVehiculoParqueaderoSchema, modalidadParqueaderoSchema } from './estanciaParqueadero'

// Una fila por modalidad × clase de vehículo (0075).
export const tarifaParqueaderoSchema = z.object({
  id: z.string(),
  modalidad: modalidadParqueaderoSchema,
  claseVehiculo: claseVehiculoParqueaderoSchema,
  precio: z
    .number()
    .int()
    .positive()
    .nullish()
    .transform((value) => value ?? undefined), // undefined = tarifa aún sin definir (Plan §13)
  // Multa por salir después de la ventana 7–8am (regla 7). 0 = solo se avisa, no se cobra.
  multaFueraVentana: z.number().int().nonnegative(),
})

export type TarifaParqueadero = z.infer<typeof tarifaParqueaderoSchema>
