import { z } from 'zod'

// Matriz de precios por servicio: mismo mecanismo que antes usaban los combos (`precios`,
// retirada en 0021_servicios.sql) — ahora el precio del combo se calcula sumando estas filas
// para los servicios que lo componen (ver `precioComboCalculado` en `src/data/combos.ts`).
export const precioServicioSchema = z.object({
  id: z.string(),
  servicioId: z.string(),
  tipoVehiculoId: z.string(),
  precio: z.number().int().positive(),
})

export type PrecioServicio = z.infer<typeof precioServicioSchema>
