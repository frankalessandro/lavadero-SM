import { db } from '../lib/db'
import {
  cronogramaExtraSchema,
  permisoInputSchema,
  permisoLavadorSchema,
  type CronogramaExtra,
  type PermisoInput,
  type PermisoLavador,
} from '../schemas/cronograma'
import {
  ensureDiasDescansoGenerados,
  fetchDiasDescanso,
  posicionQueDescansa,
  resolverIdsOrdenBase,
} from './asistenciaLavadores'
import { sumarDiasISO } from '../lib/cronograma'

const EXTRA_SELECT =
  'id, fecha, banoLavadorId:bano_lavador_id, saleLavadorId:sale_lavador_id, banoHechoEn:bano_hecho_en, banoHechoPor:bano_hecho_por, actualizadoEn:actualizado_en, actualizadoPor:actualizado_por'
const PERMISO_SELECT =
  'id, lavadorId:lavador_id, fecha, motivo, registradoPor:registrado_por, anulado, creadoEn:creado_en'

export async function fetchCronogramaExtras(desdeISO: string, hastaISO: string): Promise<CronogramaExtra[]> {
  const { data, error } = await db
    .from('cronograma_dias')
    .select(EXTRA_SELECT)
    .gte('fecha', desdeISO)
    .lte('fecha', hastaISO)
    .order('fecha')
  if (error) throw new Error(error.message)
  return cronogramaExtraSchema.array().parse(data)
}

// Incluye los anulados: el historial no se pierde, la UI filtra los vigentes.
export async function fetchPermisos(desdeISO: string, hastaISO: string): Promise<PermisoLavador[]> {
  const { data, error } = await db
    .from('permisos_lavadores')
    .select(PERMISO_SELECT)
    .gte('fecha', desdeISO)
    .lte('fecha', hastaISO)
    .order('fecha')
  if (error) throw new Error(error.message)
  return permisoLavadorSchema.array().parse(data)
}

export interface CronogramaMes {
  descansos: Awaited<ReturnType<typeof fetchDiasDescanso>>
  extras: CronogramaExtra[]
  permisos: PermisoLavador[]
}

// Todo lo que pinta un mes. Los descansos se piden con un día de margen a cada lado porque "entra
// 7am" se deriva del descanso del día anterior y "sale 7pm" del del día siguiente. Antes se
// genera la rotación hasta ese borde (idempotente), así un mes nunca se ve vacío.
export async function fetchCronogramaMes(desdeISO: string, hastaISO: string): Promise<CronogramaMes> {
  const margenDesde = sumarDiasISO(desdeISO, -1)
  const margenHasta = sumarDiasISO(hastaISO, 1)
  await ensureDiasDescansoGenerados(margenHasta)
  const [descansos, extras, permisos] = await Promise.all([
    fetchDiasDescanso(margenDesde, margenHasta),
    fetchCronogramaExtras(desdeISO, hastaISO),
    fetchPermisos(desdeISO, hastaISO),
  ])
  return { descansos, extras, permisos }
}

// Cambio a mano de quién entra a las 7am / sale a las 7pm. `null` vuelve a la rotación.
export async function guardarTurnoDia(
  fecha: string,
  cambio: { banoLavadorId?: string | null; saleLavadorId?: string | null },
  actualizadoPor: string,
): Promise<void> {
  const fila: Record<string, unknown> = {
    fecha,
    actualizado_en: new Date().toISOString(),
    actualizado_por: actualizadoPor,
  }
  if (cambio.banoLavadorId !== undefined) fila.bano_lavador_id = cambio.banoLavadorId
  if (cambio.saleLavadorId !== undefined) fila.sale_lavador_id = cambio.saleLavadorId
  const { error } = await db.from('cronograma_dias').upsert(fila, { onConflict: 'fecha' })
  if (error) throw new Error(error.message)
}

// Seguimiento del baño: se marca (o se deshace, por si se marcó por error) quién y cuándo.
export async function marcarBano(fecha: string, hecho: boolean, actualizadoPor: string): Promise<void> {
  const ahora = new Date().toISOString()
  const { error } = await db.from('cronograma_dias').upsert(
    {
      fecha,
      bano_hecho_en: hecho ? ahora : null,
      bano_hecho_por: hecho ? actualizadoPor : null,
      actualizado_en: ahora,
      actualizado_por: actualizadoPor,
    },
    { onConflict: 'fecha' },
  )
  if (error) throw new Error(error.message)
}

// Si ese lavador ya tuvo un permiso anulado ese día, se reactiva (la fila es única por lavador y
// fecha) en vez de chocar con la restricción.
export async function crearPermiso(fecha: string, input: PermisoInput, registradoPor: string): Promise<void> {
  const parsed = permisoInputSchema.parse(input)
  const { error } = await db.from('permisos_lavadores').upsert(
    {
      lavador_id: parsed.lavadorId,
      fecha,
      motivo: parsed.motivo,
      registrado_por: registradoPor,
      anulado: false,
    },
    { onConflict: 'lavador_id,fecha' },
  )
  if (error) throw new Error(error.message)
}

export async function anularPermiso(id: string): Promise<void> {
  const { error } = await db.from('permisos_lavadores').update({ anulado: true }).eq('id', id)
  if (error) throw new Error(error.message)
}

// Vuelve a la rotación fija los días desde `desdeISO` (hoy) hasta fin de mes: reescribe quién
// descansa y borra los cambios a mano de entra/sale de esos días. Los días pasados no se tocan
// (el histórico no se reescribe). El cambio anterior queda en la bitácora.
export async function restablecerMes(desdeISO: string, hastaISO: string): Promise<void> {
  const { data, error } = await db.from('dias_descanso').select('fecha').gte('fecha', desdeISO).lte('fecha', hastaISO)
  if (error) throw new Error(error.message)
  const fechas = (data as { fecha: string }[]).map((f) => f.fecha)
  if (fechas.length === 0) return

  // dias_descanso no admite DELETE (el histórico se corrige, no se borra): se recalcula qué
  // lavador toca cada fecha según la rotación y se actualiza esa fila.
  const ids = await resolverIdsOrdenBase()
  for (const fecha of fechas) {
    const [y, m, d] = fecha.split('-').map(Number)
    const posicion = posicionQueDescansa(Date.UTC(y, m - 1, d))
    if (posicion === undefined) continue
    const lavadorId = ids[posicion]
    if (!lavadorId) continue
    const { error: errorUpd } = await db
      .from('dias_descanso')
      .update({ lavador_id: lavadorId, actualizado_por: null, motivo: null, actualizado_en: new Date().toISOString() })
      .eq('fecha', fecha)
    if (errorUpd) throw new Error(errorUpd.message)
  }

  const { error: errorExtras } = await db
    .from('cronograma_dias')
    .update({ bano_lavador_id: null, sale_lavador_id: null, actualizado_en: new Date().toISOString() })
    .gte('fecha', desdeISO)
    .lte('fecha', hastaISO)
  if (errorExtras) throw new Error(errorExtras.message)
}
