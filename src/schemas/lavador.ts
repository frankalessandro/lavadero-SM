import { z } from 'zod'

export const lavadorSchema = z.object({
  id: z.string(),
  nombre: z.string(),
  activo: z.boolean(),
  pagoDiario: z.boolean(), // excepción parametrizable — regla de negocio 4
})

export type Lavador = z.infer<typeof lavadorSchema>
