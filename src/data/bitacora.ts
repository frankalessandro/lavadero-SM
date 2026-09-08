import { db } from '../lib/db'
import { bitacoraEntradaSchema, type BitacoraEntrada } from '../schemas/bitacora'

const BITACORA_SELECT =
  'id, ocurridoEn:ocurrido_en, usuarioId:usuario_id, usuarioNombre:usuario_nombre, usuarioRol:usuario_rol, personaId:persona_id, personaNombre:persona_nombre, entidad, entidadId:entidad_id, accion, antes, despues'

export interface FiltroBitacora {
  desdeISO: string
  hastaISO: string
  accion?: string
  entidad?: string
  personaId?: string
}

// Solo admin puede leer (policy de 0044). El tope de 500 filas es deliberado: la bitácora crece
// sin techo y esta pantalla es de consulta, no de exportación — si hace falta más, se acota el
// rango. El orden es por `id` y no por `ocurrido_en` porque dos eventos de la misma transacción
// comparten el `now()` de la transacción y quedarían desempatados al azar.
export async function fetchBitacora(filtro: FiltroBitacora): Promise<BitacoraEntrada[]> {
  let query = db
    .from('bitacora')
    .select(BITACORA_SELECT)
    .gte('ocurrido_en', filtro.desdeISO)
    .lt('ocurrido_en', filtro.hastaISO)
    .order('id', { ascending: false })
    .limit(500)

  if (filtro.accion) query = query.eq('accion', filtro.accion)
  if (filtro.entidad) query = query.eq('entidad', filtro.entidad)
  if (filtro.personaId) query = query.eq('persona_id', filtro.personaId)

  const { data, error } = await query
  if (error) throw new Error(error.message)
  return bitacoraEntradaSchema.array().parse(data)
}

// Historial completo de UN registro (toda su vida: creación, ediciones, anulación). Se abre desde
// el detalle de una orden/venta y no depende del rango de fechas del filtro de la pantalla.
export async function fetchBitacoraDeEntidad(entidad: string, entidadId: string): Promise<BitacoraEntrada[]> {
  const { data, error } = await db
    .from('bitacora')
    .select(BITACORA_SELECT)
    .eq('entidad', entidad)
    .eq('entidad_id', entidadId)
    .order('id', { ascending: true })
  if (error) throw new Error(error.message)
  return bitacoraEntradaSchema.array().parse(data)
}
