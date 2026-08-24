import { db } from '../lib/db'
import { liquidacionJefeZonaSchema, type LiquidacionJefeZona } from '../schemas/liquidacionJefeZona'
import { fetchOrdenesEnRango } from './ordenes'

const LIQUIDACION_SELECT =
  'id, responsable, periodoInicio:periodo_inicio, periodoFin:periodo_fin, monto, pagada, pagadaEn:pagada_en, creadoEn:creado_en'

export async function fetchLiquidacionesJefeZona(): Promise<LiquidacionJefeZona[]> {
  const { data, error } = await db
    .from('liquidaciones_jefe_zona')
    .select(LIQUIDACION_SELECT)
    .order('creado_en', { ascending: false })
  if (error) throw new Error(error.message)
  return liquidacionJefeZonaSchema.array().parse(data)
}

export interface ComisionPendienteJefeZona {
  responsable: string
  montoPendiente: number
  cantidadOrdenes: number
}

// A diferencia de fetchComisionesPendientes (lavadores, con tabla propia y activo/inactivo), acá
// no hay roster de "jefes de zona" — la lista de responsables sale de quién efectivamente quedó
// registrado como responsable del turno al crear cada orden (ver createOrden). Solo aparecen
// responsables con algo pendiente; alguien que ya liquidó todo simplemente no sale en la lista.
export async function fetchComisionesPendientesJefeZona(): Promise<ComisionPendienteJefeZona[]> {
  const { data, error } = await db
    .from('ordenes')
    .select('jefe_zona_responsable, comision_jefe_zona')
    .is('liquidacion_jefe_zona_id', null)
    .neq('estado', 'anulada')
  if (error) throw new Error(error.message)

  const acumulado = new Map<string, { monto: number; cantidad: number }>()
  for (const fila of data as { jefe_zona_responsable: string | null; comision_jefe_zona: number }[]) {
    if (!fila.jefe_zona_responsable) continue
    const actual = acumulado.get(fila.jefe_zona_responsable) ?? { monto: 0, cantidad: 0 }
    actual.monto += fila.comision_jefe_zona
    actual.cantidad += 1
    acumulado.set(fila.jefe_zona_responsable, actual)
  }

  return Array.from(acumulado.entries())
    .map(([responsable, v]) => ({ responsable, montoPendiente: v.monto, cantidadOrdenes: v.cantidad }))
    .sort((a, b) => b.montoPendiente - a.montoPendiente)
}

async function ordenesElegiblesJefeZona(responsable: string, periodoInicio: string, periodoFin: string) {
  const hastaExclusivoISO = new Date(`${periodoFin}T00:00:00.000Z`)
  hastaExclusivoISO.setUTCDate(hastaExclusivoISO.getUTCDate() + 1)

  return (
    await fetchOrdenesEnRango(new Date(`${periodoInicio}T00:00:00.000Z`).toISOString(), hastaExclusivoISO.toISOString())
  ).filter(
    (orden) =>
      orden.jefeZonaResponsable === responsable && orden.liquidacionJefeZonaId === undefined && orden.estado !== 'anulada',
  )
}

export interface MontoPeriodoJefeZona {
  monto: number
  cantidadOrdenes: number
}

export async function fetchMontoPeriodoJefeZona(
  responsable: string,
  periodoInicio: string,
  periodoFin: string,
): Promise<MontoPeriodoJefeZona> {
  const ordenes = await ordenesElegiblesJefeZona(responsable, periodoInicio, periodoFin)
  return {
    monto: ordenes.reduce((suma, orden) => suma + orden.comisionJefeZona, 0),
    cantidadOrdenes: ordenes.length,
  }
}

// Mismo patrón no-atómico que generarLiquidacion (lavadores): PostgREST plano no da transacciones
// multi-tabla, así que si el paso 2 (marcar las órdenes) falla, se reporta explícito para revisión
// manual en vez de fallar en silencio.
export async function generarLiquidacionJefeZona(
  responsable: string,
  periodoInicio: string,
  periodoFin: string,
): Promise<LiquidacionJefeZona> {
  const ordenes = await ordenesElegiblesJefeZona(responsable, periodoInicio, periodoFin)
  const monto = ordenes.reduce((suma, orden) => suma + orden.comisionJefeZona, 0)

  const { data: creada, error: errorInsert } = await db
    .from('liquidaciones_jefe_zona')
    .insert({ responsable, periodo_inicio: periodoInicio, periodo_fin: periodoFin, monto })
    .select(LIQUIDACION_SELECT)
    .single()
  if (errorInsert) throw new Error(errorInsert.message)

  const liquidacion = liquidacionJefeZonaSchema.parse(creada)

  if (ordenes.length > 0) {
    const { error: errorUpdate } = await db
      .from('ordenes')
      .update({ liquidacion_jefe_zona_id: liquidacion.id })
      .in(
        'id',
        ordenes.map((orden) => orden.id),
      )
    if (errorUpdate) {
      throw new Error(
        `La liquidación ${liquidacion.id} se creó por $${monto} pero no se pudo marcar ${ordenes.length} orden(es) como liquidadas: ${errorUpdate.message}. Revisar manualmente.`,
      )
    }
  }

  return liquidacion
}

// Para reabrir la colilla de una liquidación ya generada (histórico) — a diferencia del preview
// de fetchMontoPeriodoJefeZona (que mira el rango de fechas), esto cuenta directo por
// liquidacion_jefe_zona_id, exacto a lo que quedó liquidado de verdad.
export async function fetchCantidadOrdenesLiquidacionJefeZona(liquidacionId: string): Promise<number> {
  const { count, error } = await db
    .from('ordenes')
    .select('id', { count: 'exact', head: true })
    .eq('liquidacion_jefe_zona_id', liquidacionId)
  if (error) throw new Error(error.message)
  return count ?? 0
}

export async function marcarLiquidacionJefeZonaPagada(id: string): Promise<LiquidacionJefeZona> {
  const { data, error } = await db
    .from('liquidaciones_jefe_zona')
    .update({ pagada: true, pagada_en: new Date().toISOString() })
    .eq('id', id)
    .select(LIQUIDACION_SELECT)
    .single()
  if (error) throw new Error(error.message)
  return liquidacionJefeZonaSchema.parse(data)
}
