import { db } from '../lib/db'
import { liquidacionSchema, type Liquidacion } from '../schemas/liquidacion'
import { fetchLavadores } from './lavadores'
import { fetchOrdenesEnRango } from './ordenes'

const LIQUIDACION_SELECT =
  'id, lavadorId:lavador_id, periodoInicio:periodo_inicio, periodoFin:periodo_fin, monto, pagada, pagadaEn:pagada_en, creadoEn:creado_en'

export async function fetchLiquidaciones(): Promise<Liquidacion[]> {
  const { data, error } = await db
    .from('liquidaciones')
    .select(LIQUIDACION_SELECT)
    .order('creado_en', { ascending: false })
  if (error) throw new Error(error.message)
  return liquidacionSchema.array().parse(data)
}

export interface ComisionPendiente {
  lavadorId: string
  lavadorNombre: string
  montoPendiente: number
  cantidadOrdenes: number
}

// Regla de negocio 4: liquidación semanal sobre el acumulado, excepto lavadores con
// pagoDiario=true (excepción parametrizable) — esos se muestran aparte, no entran aquí.
export async function fetchComisionesPendientes(): Promise<ComisionPendiente[]> {
  const lavadores = await fetchLavadores()
  const elegibles = lavadores.filter((l) => l.activo && !l.pagoDiario)
  if (elegibles.length === 0) return []

  // Solo entregadas: la comisión se vuelve pagable cuando el servicio se cobró de verdad,
  // no mientras el vehículo sigue en proceso o listo esperando al cliente.
  const { data, error } = await db
    .from('ordenes')
    .select('lavador_id, comision_lavador')
    .is('liquidacion_id', null)
    .eq('estado', 'entregado')
  if (error) throw new Error(error.message)

  const acumulado = new Map<string, { monto: number; cantidad: number }>()
  for (const fila of data as { lavador_id: string; comision_lavador: number }[]) {
    const actual = acumulado.get(fila.lavador_id) ?? { monto: 0, cantidad: 0 }
    actual.monto += fila.comision_lavador
    actual.cantidad += 1
    acumulado.set(fila.lavador_id, actual)
  }

  return elegibles.map((lavador) => {
    const acumuladoLavador = acumulado.get(lavador.id) ?? { monto: 0, cantidad: 0 }
    return {
      lavadorId: lavador.id,
      lavadorNombre: lavador.nombre,
      montoPendiente: acumuladoLavador.monto,
      cantidadOrdenes: acumuladoLavador.cantidad,
    }
  })
}

// Órdenes que entrarían en una liquidación de este lavador para el rango [periodoInicio,
// periodoFin] (fechas YYYY-MM-DD, ambas inclusivas) — mismo filtro que aplica `generarLiquidacion`
// al momento de crearla, extraído aparte para poder mostrar un monto preciso ANTES de generar
// (admin ahora puede elegir diaria o semanal por lavador, así que el monto ya no es siempre
// "todo lo pendiente" — depende del rango elegido).
async function ordenesElegibles(lavadorId: string, periodoInicio: string, periodoFin: string) {
  // periodoFin es una fecha (YYYY-MM-DD) inclusiva para el usuario; fetchOrdenesEnRango usa
  // límite superior exclusivo, así que se extiende un día para incluir todo el día de cierre.
  const hastaExclusivoISO = new Date(`${periodoFin}T00:00:00.000Z`)
  hastaExclusivoISO.setUTCDate(hastaExclusivoISO.getUTCDate() + 1)

  return (
    await fetchOrdenesEnRango(new Date(`${periodoInicio}T00:00:00.000Z`).toISOString(), hastaExclusivoISO.toISOString())
  ).filter((orden) => orden.lavadorId === lavadorId && orden.liquidacionId === undefined && orden.estado === 'entregado')
}

export interface MontoPeriodo {
  monto: number
  cantidadOrdenes: number
}

// Preview del monto real que generaría una liquidación diaria o semanal para este lavador y
// rango — se usa antes de confirmar, porque `montoPendiente` de fetchComisionesPendientes es el
// acumulado TOTAL sin liquidar, no lo que cae dentro de un rango diario/semanal específico.
export async function fetchMontoPeriodo(lavadorId: string, periodoInicio: string, periodoFin: string): Promise<MontoPeriodo> {
  const ordenes = await ordenesElegibles(lavadorId, periodoInicio, periodoFin)
  return {
    monto: ordenes.reduce((suma, orden) => suma + orden.comisionLavador, 0),
    cantidadOrdenes: ordenes.length,
  }
}

// No hay transacciones multi-tabla vía PostgREST plano, así que se hace en dos pasos:
// 1) inserta la liquidación con el monto calculado, 2) marca las órdenes correspondientes
// con el id recién creado. Si el paso 2 falla se reporta explícitamente — la liquidación
// queda creada pero las órdenes sin marcar, hay que revisar manualmente (no falla en silencio).
export async function generarLiquidacion(
  lavadorId: string,
  periodoInicio: string,
  periodoFin: string,
): Promise<Liquidacion> {
  const ordenes = await ordenesElegibles(lavadorId, periodoInicio, periodoFin)

  const monto = ordenes.reduce((suma, orden) => suma + orden.comisionLavador, 0)

  const { data: creada, error: errorInsert } = await db
    .from('liquidaciones')
    .insert({
      lavador_id: lavadorId,
      periodo_inicio: periodoInicio,
      periodo_fin: periodoFin,
      monto,
    })
    .select(LIQUIDACION_SELECT)
    .single()
  if (errorInsert) throw new Error(errorInsert.message)

  const liquidacion = liquidacionSchema.parse(creada)

  if (ordenes.length > 0) {
    const { error: errorUpdate } = await db
      .from('ordenes')
      .update({ liquidacion_id: liquidacion.id })
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

export async function marcarLiquidacionPagada(id: string): Promise<Liquidacion> {
  const { data, error } = await db
    .from('liquidaciones')
    .update({ pagada: true, pagada_en: new Date().toISOString() })
    .eq('id', id)
    .select(LIQUIDACION_SELECT)
    .single()
  if (error) throw new Error(error.message)
  return liquidacionSchema.parse(data)
}
