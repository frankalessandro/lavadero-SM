import { z } from 'zod'

export const configuracionSchema = z.object({
  comisionLavadorPorcentaje: z.number().min(0).max(1),
  comisionBase: z.enum(['lista', 'cobrado']),
  periodicidadLiquidacion: z.enum(['diaria', 'semanal']),
  // Recargo fijo para motos de alto cilindraje (checkbox en recepción) — se suma al precio del
  // combo/servicios antes de repartir comisión, igual que cualquier otro monto del total.
  recargoAltoCilindraje: z.number().int().nonnegative(),
})

export type Configuracion = z.infer<typeof configuracionSchema>
