import { db } from '../lib/db'

export interface ComboServicio {
  comboId: string
  servicioId: string
}

// Toda la relación combo↔servicio, plana — mismo patrón que `precios`/`preciosServicio`: se
// trae completa una vez y se filtra en memoria (volumen esperado bajo, sin query por combo).
export async function fetchComboServicios(): Promise<ComboServicio[]> {
  const { data, error } = await db.from('combo_servicios').select('comboId:combo_id, servicioId:servicio_id')
  if (error) throw new Error(error.message)
  return (data ?? []) as ComboServicio[]
}

// Reemplaza la composición completa de un combo. PostgREST plano no da transacciones
// multi-tabla, así que es delete-then-insert (mismo criterio no atómico ya documentado en
// `generarLiquidacion`, `src/data/liquidaciones.ts`): si el insert falla tras el delete, se
// lanza un error explícito nombrando el combo afectado para revisión manual — el combo queda
// sin servicios (y por lo tanto sin precio calculado) hasta que se corrija a mano.
export async function setComboServicios(comboId: string, servicioIds: string[]): Promise<void> {
  const { error: errorDelete } = await db.from('combo_servicios').delete().eq('combo_id', comboId)
  if (errorDelete) throw new Error(errorDelete.message)

  if (servicioIds.length === 0) return

  const { error: errorInsert } = await db
    .from('combo_servicios')
    .insert(servicioIds.map((servicioId) => ({ combo_id: comboId, servicio_id: servicioId })))
  if (errorInsert) {
    throw new Error(
      `El combo ${comboId} se quedó sin servicios asignados: no se pudieron guardar los ${servicioIds.length} servicio(s) elegidos (${errorInsert.message}). Revisar manualmente.`,
    )
  }
}
