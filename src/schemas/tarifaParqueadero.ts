import { z } from 'zod'
import { modalidadParqueaderoSchema } from './estanciaParqueadero'

export const tarifaParqueaderoSchema = z.object({
  id: z.string(),
  modalidad: modalidadParqueaderoSchema,
  precio: z
    .number()
    .int()
    .positive()
    .nullish()
    .transform((value) => value ?? undefined), // undefined = tarifa aún sin definir (Plan §13)
})

export type TarifaParqueadero = z.infer<typeof tarifaParqueaderoSchema>
