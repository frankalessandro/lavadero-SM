import { z } from 'zod'

export const configuracionSchema = z.object({
  comisionLavadorPorcentaje: z.number().min(0).max(1),
  comisionBase: z.enum(['lista', 'cobrado']),
})

export type Configuracion = z.infer<typeof configuracionSchema>
