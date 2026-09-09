import { db } from '../lib/db'
import { liquidacionJefeZonaSchema, type LiquidacionJefeZona } from '../schemas/liquidacionJefeZona'
import { fetchOrdenesEnRango } from './ordenes'
import { fetchPerfiles } from './perfiles'

const LIQUIDACION_SELECT =
  'id, responsable, personaId:persona_id, periodoInicio:periodo_inicio, periodoFin:periodo_fin, monto, pagada, pagadaEn:pagada_en, anulada, motivoAnulacion:motivo_anulacion, anuladaPor:anulada_por, anuladaEn:anulada_en, creadoEn:creado_en'

export async function fetchLiquidacionesJefeZona(): Promise<LiquidacionJefeZona[]> {
  const { data, error } = await db
    .from('liquidaciones_jefe_zona')
    .select(LIQUIDACION_SELECT)
    .order('creado_en', { ascending: false })
  if (error) throw new Error(error.message)
  return liquidacionJefeZonaSchema.array().parse(data)
}

export interface ComisionPendienteJefeZona {
  personaId: string
  responsable: string
  montoPendiente: number
  cantidadOrdenes: number
}

// Agrupa por `jefe_zona_persona_id`, NO por el texto `jefe_zona_responsable`. Ese texto se tecleaba
// a mano y produjo 13 grafías para 3 personas — la comisión de Julián llegó a estar partida en seis
// pedazos (ver 0043_personal_operativo.sql). El nombre que se muestra sale de la cuenta
// (`perfiles`, que desde 0056 ES la persona), no de la orden. Las órdenes que no mapearon a nadie
// quedan fuera (no hay a quién pagarles); las migraciones 0043 y 0056 abortan si existiera alguna
// así, de modo que en la práctica no las hay.
export async function fetchComisionesPendientesJefeZona(): Promise<ComisionPendienteJefeZona[]> {
  const [{ data, error }, personal] = await Promise.all([
    db
      .from('ordenes')
      .select('jefe_zona_persona_id, comision_jefe_zona')
      .is('liquidacion_jefe_zona_id', null)
      .neq('estado', 'anulada'),
    fetchPerfiles(),
  ])
  if (error) throw new Error(error.message)

  const nombrePorId = new Map(personal.map((p) => [p.id, p.nombre?.trim() || 'Sin nombre']))
  const acumulado = new Map<string, { monto: number; cantidad: number }>()
  for (const fila of data as { jefe_zona_persona_id: string | null; comision_jefe_zona: number }[]) {
    if (!fila.jefe_zona_persona_id) continue
    const actual = acumulado.get(fila.jefe_zona_persona_id) ?? { monto: 0, cantidad: 0 }
    actual.monto += fila.comision_jefe_zona
    actual.cantidad += 1
    acumulado.set(fila.jefe_zona_persona_id, actual)
  }

  return Array.from(acumulado.entries())
    .map(([personaId, v]) => ({
      personaId,
      responsable: nombrePorId.get(personaId) ?? 'Persona no encontrada',
      montoPendiente: v.monto,
      cantidadOrdenes: v.cantidad,
    }))
    .sort((a, b) => b.montoPendiente - a.montoPendiente)
}

export interface OrdenPendienteJefeZona {
  id: string
  consecutivo: number
  creadoEn: string
  placa: string
  tipoVehiculoId: string
  comboId?: string
  // Nombres de los servicios sueltos agregados encima del combo (o todo lo que lleva la orden si
  // no hay combo) — el combo se resuelve aparte en la pantalla, que ya tiene el catálogo cargado.
  adicionales: string[]
  precio: number
  comisionJefeZona: number
}

// Detalle línea por línea de lo que este responsable tiene sin liquidar — para el modal que se
// abre desde su tarjeta de "Comisiones pendientes". Mismo filtro que fetchComisionesPendientesJefeZona
// (responsable + sin liquidacion_jefe_zona_id + no anulada), pero trayendo el desglose de cada orden
// en vez del acumulado. La comisión es por orden (3% del precio de lista), no por cada servicio suelto.
export async function fetchOrdenesPendientesJefeZona(personaId: string): Promise<OrdenPendienteJefeZona[]> {
  const { data, error } = await db
    .from('ordenes')
    .select(
      'id, consecutivo, creadoEn:creado_en, placa, tipoVehiculoId:tipo_vehiculo_id, comboId:combo_id, precio, comisionJefeZona:comision_jefe_zona, serviciosAdicionales:orden_servicios(servicios(nombre))',
    )
    .eq('jefe_zona_persona_id', personaId)
    .is('liquidacion_jefe_zona_id', null)
    .neq('estado', 'anulada')
    .order('creado_en', { ascending: false })
  if (error) throw new Error(error.message)

  return (
    data as unknown as {
      id: string
      consecutivo: number
      creadoEn: string
      placa: string
      tipoVehiculoId: string
      comboId: string | null
      precio: number
      comisionJefeZona: number
      serviciosAdicionales: { servicios: { nombre: string } | null }[]
    }[]
  ).map((row) => ({
    id: row.id,
    consecutivo: row.consecutivo,
    creadoEn: row.creadoEn,
    placa: row.placa,
    tipoVehiculoId: row.tipoVehiculoId,
    comboId: row.comboId ?? undefined,
    adicionales: (row.serviciosAdicionales ?? []).map((s) => s.servicios?.nombre ?? '').filter(Boolean),
    precio: row.precio,
    comisionJefeZona: row.comisionJefeZona,
  }))
}

export interface ResumenPeriodoJefeZona {
  personaId: string
  responsable: string
  cantidadOrdenes: number
  montoTotal: number
  montoPendiente: number
}

// Mismo reporte por periodo que fetchResumenPeriodoLavadores (src/data/liquidaciones.ts), para
// el selector día/semana/mes de /admin/dinero/liquidaciones — agrupa por responsable todo lo
// generado en el rango, liquidado o no.
export async function fetchResumenPeriodoJefeZona(periodoInicio: string, periodoFin: string): Promise<ResumenPeriodoJefeZona[]> {
  const hastaExclusivoISO = new Date(`${periodoFin}T00:00:00.000Z`)
  hastaExclusivoISO.setUTCDate(hastaExclusivoISO.getUTCDate() + 1)
  const ordenes = await fetchOrdenesEnRango(new Date(`${periodoInicio}T00:00:00.000Z`).toISOString(), hastaExclusivoISO.toISOString())

  const nombrePorId = new Map((await fetchPerfiles()).map((p) => [p.id, p.nombre?.trim() || 'Sin nombre']))
  const acumulado = new Map<string, { cantidad: number; total: number; pendiente: number }>()
  for (const orden of ordenes) {
    if (orden.estado === 'anulada' || !orden.jefeZonaPersonaId) continue
    const actual = acumulado.get(orden.jefeZonaPersonaId) ?? { cantidad: 0, total: 0, pendiente: 0 }
    actual.cantidad += 1
    actual.total += orden.comisionJefeZona
    if (orden.liquidacionJefeZonaId === undefined) actual.pendiente += orden.comisionJefeZona
    acumulado.set(orden.jefeZonaPersonaId, actual)
  }

  return Array.from(acumulado.entries())
    .map(([personaId, a]) => ({
      personaId,
      responsable: nombrePorId.get(personaId) ?? 'Persona no encontrada',
      cantidadOrdenes: a.cantidad,
      montoTotal: a.total,
      montoPendiente: a.pendiente,
    }))
    .sort((a, b) => b.montoTotal - a.montoTotal)
}

async function ordenesElegiblesJefeZona(personaId: string, periodoInicio: string, periodoFin: string) {
  const hastaExclusivoISO = new Date(`${periodoFin}T00:00:00.000Z`)
  hastaExclusivoISO.setUTCDate(hastaExclusivoISO.getUTCDate() + 1)

  return (
    await fetchOrdenesEnRango(new Date(`${periodoInicio}T00:00:00.000Z`).toISOString(), hastaExclusivoISO.toISOString())
  ).filter(
    (orden) =>
      orden.jefeZonaPersonaId === personaId && orden.liquidacionJefeZonaId === undefined && orden.estado !== 'anulada',
  )
}

export interface MontoPeriodoJefeZona {
  monto: number
  cantidadOrdenes: number
}

export async function fetchMontoPeriodoJefeZona(
  personaId: string,
  periodoInicio: string,
  periodoFin: string,
): Promise<MontoPeriodoJefeZona> {
  const ordenes = await ordenesElegiblesJefeZona(personaId, periodoInicio, periodoFin)
  return {
    monto: ordenes.reduce((suma, orden) => suma + orden.comisionJefeZona, 0),
    cantidadOrdenes: ordenes.length,
  }
}

// Mismo patrón no-atómico que generarLiquidacion (lavadores): PostgREST plano no da transacciones
// multi-tabla, así que si el paso 2 (marcar las órdenes) falla, se reporta explícito para revisión
// manual en vez de fallar en silencio.
export async function generarLiquidacionJefeZona(
  personaId: string,
  responsable: string,
  periodoInicio: string,
  periodoFin: string,
): Promise<LiquidacionJefeZona> {
  const ordenes = await ordenesElegiblesJefeZona(personaId, periodoInicio, periodoFin)
  const monto = ordenes.reduce((suma, orden) => suma + orden.comisionJefeZona, 0)

  const { data: creada, error: errorInsert } = await db
    .from('liquidaciones_jefe_zona')
    // `responsable` se guarda como snapshot del nombre al momento del corte; `persona_id` es la
    // clave real (renombrar a alguien después no debe reescribir su histórico de colillas).
    .insert({ responsable, persona_id: personaId, periodo_inicio: periodoInicio, periodo_fin: periodoFin, monto })
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

// Deshace un corte de jefe de patio mal generado — ver `anularLiquidacion` (lavadores). RPC
// `anular_liquidacion_jefe_zona` (0049), solo admin, solo si no está pagada.
export async function anularLiquidacionJefeZona(id: string, motivo: string, anuladaPor: string): Promise<LiquidacionJefeZona> {
  const { data, error } = await db
    .rpc('anular_liquidacion_jefe_zona', { p_id: id, p_motivo: motivo, p_anulada_por: anuladaPor })
    .select(LIQUIDACION_SELECT)
    .single()
  if (error) throw new Error(error.message)
  return liquidacionJefeZonaSchema.parse(data)
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
