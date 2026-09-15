import { z } from 'zod'

// Los que se registran desde la app. 'traspaso' = conteo al transferir el turno a mitad de servicio (0068).
export const momentoConteoSchema = z.enum(['apertura', 'cierre', 'traspaso'])

const nullableString = z
  .string()
  .nullish()
  .transform((v) => v ?? undefined)

// Cabecera de un conteo — sin datos sensibles (el valor en $ vive en las líneas, admin-only).
export const conteoInventarioSchema = z.object({
  id: z.string(),
  turnoId: z.string(),
  // 'reinicio' = conteo base cargado por SQL (0067), no sale de las RPC de la app.
  momento: z.enum(['apertura', 'cierre', 'traspaso', 'reinicio']),
  contadoPor: z.string(),
  contadoPorPersonaId: nullableString,
  justificacion: nullableString,
  creadoEn: z.string(),
  // Foto de las cuentas/órdenes con productos sin cobrar que se confirmaron (cierre y traspaso, 0068).
  pendientesConfirmados: z
    .array(
      z.object({
        tipo: z.string(),
        id: z.string(),
        titulo: z.string(),
        desde: z.string(),
        detalle: z.string(),
        total: z.number(),
      }),
    )
    .nullish()
    .transform((v) => v ?? undefined),
})

// Lo que devuelve `preview_conteo_inventario` — qué debería haber de cada producto, para
// comparar contra el conteo ciego. No trae costo (jefe de zona no ve costos).
// Desde 0068 el esperado es encadenado: `anterior` (lo contado en el conteo previo del producto)
// − `vendido` + `entradas` + `otros` (ajustes/salidas manuales). `movido` = el producto tuvo
// movimientos desde la marca de tiempo con que se empezó a contar → hay que recontarlo.
export const previewLineaConteoSchema = z.object({
  productoId: z.string(),
  nombre: z.string(),
  unidadMedida: z.string(),
  esperado: z.number().int(),
  enCuentasPendientes: z.number().int(),
  anterior: z.number().int().nullable(),
  anteriorEn: z.string().nullable(),
  vendido: z.number().int(),
  entradas: z.number().int(),
  otros: z.number().int(),
  movido: z.boolean(),
  marca: z.string(),
})

// Línea guardada — la lee solo admin (lleva `valorDiferencia` a costo).
export const conteoLineaSchema = z.object({
  id: z.string(),
  conteoId: z.string(),
  productoId: z.string(),
  esperado: z.number().int(),
  contado: z.number().int(),
  // Primer conteo cuando hubo reconteo de ese producto (0068); null si se contó una sola vez.
  contadoInicial: z.number().int().nullable(),
  enCuentasPendientes: z.number().int(),
  diferencia: z.number().int(),
  valorDiferencia: z.number().int(),
  respondePersonaId: nullableString,
  motivo: nullableString,
  ajusteMovimientoId: nullableString,
  estadoFaltante: z.enum(['ninguno', 'pendiente', 'resuelto', 'descartado']),
})

// Una línea del payload que se manda a las RPC.
export const conteoLineaInputSchema = z.object({
  productoId: z.string(),
  contado: z.number().int().nonnegative(),
  contadoInicial: z.number().int().nonnegative().optional(),
  respondePersonaId: z.string().optional(),
  motivo: z.string().trim().optional(),
})

// Cuenta abierta u orden con productos cargados sin cobrar — se confirma una por una antes del
// conteo de cierre o de traspaso (0068). Sin costo: son precios de venta.
export const pendienteCobroSchema = z.object({
  tipo: z.enum(['cuenta', 'orden']),
  id: z.string(),
  titulo: z.string(),
  desde: z.string(),
  detalle: z.string(),
  total: z.number().int(),
})

export type MomentoConteo = z.infer<typeof momentoConteoSchema>
export type PendienteCobro = z.infer<typeof pendienteCobroSchema>
export type ConteoInventario = z.infer<typeof conteoInventarioSchema>
export type PreviewLineaConteo = z.infer<typeof previewLineaConteoSchema>
export type ConteoLinea = z.infer<typeof conteoLineaSchema>
export type ConteoLineaInput = z.infer<typeof conteoLineaInputSchema>
