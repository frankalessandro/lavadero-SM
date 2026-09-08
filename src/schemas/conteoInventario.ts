import { z } from 'zod'

export const momentoConteoSchema = z.enum(['apertura', 'cierre'])

const nullableString = z
  .string()
  .nullish()
  .transform((v) => v ?? undefined)

// Cabecera de un conteo — sin datos sensibles (el valor en $ vive en las líneas, admin-only).
export const conteoInventarioSchema = z.object({
  id: z.string(),
  turnoId: z.string(),
  momento: momentoConteoSchema,
  contadoPor: z.string(),
  contadoPorPersonaId: nullableString,
  justificacion: nullableString,
  creadoEn: z.string(),
})

// Lo que devuelve `preview_conteo_inventario` — qué debería haber de cada producto, para
// comparar contra el conteo ciego. No trae costo (jefe de zona no ve costos).
export const previewLineaConteoSchema = z.object({
  productoId: z.string(),
  nombre: z.string(),
  unidadMedida: z.string(),
  esperado: z.number().int(),
  enCuentasPendientes: z.number().int(),
})

// Línea guardada — la lee solo admin (lleva `valorDiferencia` a costo).
export const conteoLineaSchema = z.object({
  id: z.string(),
  conteoId: z.string(),
  productoId: z.string(),
  esperado: z.number().int(),
  contado: z.number().int(),
  enCuentasPendientes: z.number().int(),
  diferencia: z.number().int(),
  valorDiferencia: z.number().int(),
  respondePersonaId: nullableString,
  motivo: nullableString,
  ajusteMovimientoId: nullableString,
  estadoFaltante: z.enum(['ninguno', 'pendiente', 'resuelto']),
})

// Una línea del payload que se manda a las RPC.
export const conteoLineaInputSchema = z.object({
  productoId: z.string(),
  contado: z.number().int().nonnegative(),
  respondePersonaId: z.string().optional(),
  motivo: z.string().trim().optional(),
})

export type MomentoConteo = z.infer<typeof momentoConteoSchema>
export type ConteoInventario = z.infer<typeof conteoInventarioSchema>
export type PreviewLineaConteo = z.infer<typeof previewLineaConteoSchema>
export type ConteoLinea = z.infer<typeof conteoLineaSchema>
export type ConteoLineaInput = z.infer<typeof conteoLineaInputSchema>
