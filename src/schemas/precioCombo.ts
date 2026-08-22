import { z } from 'zod'

// Precio fijo de un combo por tipo de vehículo — solo aplica a combos con `precioFijo: true`
// (ej. motos: "funciona diferente a los carros", no es una suma de servicios). Ver
// `precioComboCalculado` en `src/data/combos.ts` para cuándo se usa esta tabla vs. la suma.
export const precioComboSchema = z.object({
  id: z.string(),
  comboId: z.string(),
  tipoVehiculoId: z.string(),
  precio: z.number().int().positive(),
})

export type PrecioCombo = z.infer<typeof precioComboSchema>
