import { z } from 'zod'

// Matriz de precios: la existencia de un registro combo+tipo es lo que habilita
// esa combinación en recepción — regla de negocio 1 (precio siempre desde la lista).
export const precioSchema = z.object({
  id: z.string(),
  comboId: z.string(),
  tipoVehiculoId: z.string(),
  precio: z.number().int().positive(),
})

export type Precio = z.infer<typeof precioSchema>
