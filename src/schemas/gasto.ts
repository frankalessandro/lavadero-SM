import { z } from 'zod'

/**
 * Línea de negocio a la que se imputa un gasto (migración 0059).
 *
 * La rentabilidad se calcula con un P&L por línea para que el 40 % del lavador se lea sobre los
 * ingresos del LAVADO y no sobre el total (que incluye productos y parqueadero, que no pagan
 * comisión). Una categoría sin línea (`undefined`) es un gasto general/compartido —arriendo,
 * servicios públicos, nómina administrativa— que no se atribuye a ninguna línea y se resta una
 * sola vez del margen bruto consolidado. No inventar un reparto para esos: ver 0059.
 */
export const lineaNegocioSchema = z.enum(['lavadero', 'productos', 'parqueadero'])

export const LINEA_NEGOCIO_LABEL: Record<LineaNegocio, string> = {
  lavadero: 'Lavadero',
  productos: 'Productos',
  parqueadero: 'Parqueadero',
}

/** Etiqueta para el selector de categoría, incluyendo el caso "sin línea". */
export const LINEA_NEGOCIO_OPCIONES = [
  { valor: '', label: 'General (no se atribuye a una línea)' },
  ...lineaNegocioSchema.options.map((valor) => ({ valor, label: LINEA_NEGOCIO_LABEL[valor] })),
] as const

export const categoriaGastoSchema = z.object({
  id: z.string(),
  nombre: z.string(),
  activo: z.boolean(),
  // `undefined` = gasto general/compartido. La columna es nullable en Postgres y se normaliza a
  // undefined en el data layer, mismo criterio que `turnoId` acá abajo.
  linea: lineaNegocioSchema.optional(),
})

export const gastoSchema = z.object({
  id: z.string(),
  fecha: z.string(), // date (YYYY-MM-DD)
  categoriaId: z.string(),
  descripcion: z.string(),
  monto: z.number().int().positive(),
  responsable: z.string(),
  origen: z.enum(['caja', 'otro']),
  // Turno de caja al que se imputa el gasto — lo que `calcularValorEsperado` resta del arqueo.
  // Nullable: un gasto administrativo (`origen: 'otro'`) no sale de ninguna caja, y los gastos
  // anteriores a 0042 quedaron sin turno porque `createGasto` no escribía la columna.
  turnoId: z.string().optional(),
  creadoEn: z.string(),
})

export const gastoInputSchema = z.object({
  fecha: z.string().min(1, 'La fecha es obligatoria'),
  categoriaId: z.string().min(1, 'Selecciona una categoría'),
  descripcion: z.string().trim().min(1, 'La descripción es obligatoria'),
  monto: z.number().int().positive('El monto debe ser mayor a 0'),
  responsable: z.string().trim().min(1, 'El responsable es obligatorio'),
  origen: z.enum(['caja', 'otro']),
  turnoId: z.string().optional(),
})

export const categoriaGastoInputSchema = z.object({
  nombre: z.string().trim().min(2, 'El nombre debe tener al menos 2 caracteres'),
  linea: lineaNegocioSchema.optional(),
})

export type LineaNegocio = z.infer<typeof lineaNegocioSchema>
export type CategoriaGasto = z.infer<typeof categoriaGastoSchema>
export type CategoriaGastoInput = z.infer<typeof categoriaGastoInputSchema>
export type Gasto = z.infer<typeof gastoSchema>
export type GastoInput = z.infer<typeof gastoInputSchema>
