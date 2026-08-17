import { z } from 'zod'

export const comboSchema = z.object({
  id: z.string(),
  nombre: z.string(),
  activo: z.boolean(),
})

export type Combo = z.infer<typeof comboSchema>
