import { db } from '../lib/db'
import { liquidacionSchema, type Liquidacion } from '../schemas/liquidacion'
import { fetchLavadores } from './lavadores'
import { fetchOrdenesEnRango } from './ordenes'
import type { TipoVehiculo } from '../schemas/tipoVehiculo'
import type { Combo } from '../schemas/combo'

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

// Regla de negocio 4: liquidación sobre el acumulado, sin descuentos al lavador. Admin elige
// diaria o semanal por lavador en cada generación (ver generarLiquidacion) — no hace falta una
// excepción parametrizada de antemano por lavador, cualquiera puede liquidarse en el periodo que
// el negocio decida.
export async function fetchComisionesPendientes(): Promise<ComisionPendiente[]> {
  const lavadores = await fetchLavadores()
  const elegibles = lavadores.filter((l) => l.activo)
  if (elegibles.length === 0) return []

  // Cuenta en_proceso + listo + entregado (todo menos anuladas) — confirmado explícitamente con
  // el negocio: se le paga al lavador por el trabajo del día sin importar si el cliente ya pagó
  // o si el lavado sigue en curso, porque la comisión ya quedó fija desde que se creó la orden
  // (regla 1), no depende de en qué estado esté.
  const { data, error } = await db
    .from('ordenes')
    .select('lavador_id, comision_lavador')
    .is('liquidacion_id', null)
    .neq('estado', 'anulada')
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
  ).filter((orden) => orden.lavadorId === lavadorId && orden.liquidacionId === undefined && orden.estado !== 'anulada')
}

export interface DesgloseComboItem {
  comboNombre: string
  cantidad: number
  monto: number
}

export interface DesgloseCategoria {
  cantidad: number
  monto: number
  // Detalle por combo dentro de la categoría — así "5 carros" no se queda genérico, se ve
  // exactamente cuántos fueron de cada combo (ej. 2 de "Combo 1", 3 de "Combo 6"). Las órdenes
  // sin combo (solo servicios sueltos) van aparte, bajo "Sin combo".
  porCombo: DesgloseComboItem[]
}

export interface DesgloseVehiculos {
  autos: DesgloseCategoria
  motos: DesgloseCategoria
}

const SIN_COMBO_LABEL = 'Sin combo'

// Reparte un grupo de órdenes (ya filtradas al lavador/rango o liquidación que corresponda) en
// autos/motos según `tipos_vehiculo.categoria` — cualquier tipo que no sea 'moto' (auto,
// camioneta, camioneta de platón...) cuenta como "carro", que es como lo pidió el negocio
// ("cuántos carros, cuántas motos"), no una tercera categoría suelta. Dentro de cada categoría,
// además reparte por combo (por id, no por nombre — auto y moto pueden compartir nombre de
// combo como "Combo 2" siendo filas distintas, ver CLAUDE.md).
function desglosarPorCategoria(
  ordenes: { tipoVehiculoId: string; comboId?: string; comisionLavador: number }[],
  tiposVehiculo: Pick<TipoVehiculo, 'id' | 'categoria'>[],
  combos: Pick<Combo, 'id' | 'nombre'>[],
): DesgloseVehiculos {
  const categoriaPorTipo = new Map(tiposVehiculo.map((t) => [t.id, t.categoria]))
  const nombrePorCombo = new Map(combos.map((c) => [c.id, c.nombre]))

  const acumuladores = {
    autos: new Map<string, DesgloseComboItem>(),
    motos: new Map<string, DesgloseComboItem>(),
  }

  for (const orden of ordenes) {
    const acumulador = categoriaPorTipo.get(orden.tipoVehiculoId) === 'moto' ? acumuladores.motos : acumuladores.autos
    const comboKey = orden.comboId ?? 'sin-combo'
    const comboNombre = orden.comboId ? (nombrePorCombo.get(orden.comboId) ?? 'Combo eliminado') : SIN_COMBO_LABEL
    const actual = acumulador.get(comboKey) ?? { comboNombre, cantidad: 0, monto: 0 }
    actual.cantidad += 1
    actual.monto += orden.comisionLavador
    acumulador.set(comboKey, actual)
  }

  function totalizar(acumulador: Map<string, DesgloseComboItem>): DesgloseCategoria {
    const porCombo = Array.from(acumulador.values()).sort((a, b) => b.cantidad - a.cantidad)
    return {
      cantidad: porCombo.reduce((suma, item) => suma + item.cantidad, 0),
      monto: porCombo.reduce((suma, item) => suma + item.monto, 0),
      porCombo,
    }
  }

  return { autos: totalizar(acumuladores.autos), motos: totalizar(acumuladores.motos) }
}

export interface MontoPeriodo {
  monto: number
  cantidadOrdenes: number
  desglose: DesgloseVehiculos
}

// Preview del monto real que generaría una liquidación diaria o semanal para este lavador y
// rango — se usa antes de confirmar, porque `montoPendiente` de fetchComisionesPendientes es el
// acumulado TOTAL sin liquidar, no lo que cae dentro de un rango diario/semanal específico.
// Incluye el desglose por carros/motos para que el admin vea, antes de generar, cuánto hizo con
// cada uno en ese periodo.
export async function fetchMontoPeriodo(
  lavadorId: string,
  periodoInicio: string,
  periodoFin: string,
  tiposVehiculo: Pick<TipoVehiculo, 'id' | 'categoria'>[],
  combos: Pick<Combo, 'id' | 'nombre'>[],
): Promise<MontoPeriodo> {
  const ordenes = await ordenesElegibles(lavadorId, periodoInicio, periodoFin)
  return {
    monto: ordenes.reduce((suma, orden) => suma + orden.comisionLavador, 0),
    cantidadOrdenes: ordenes.length,
    desglose: desglosarPorCategoria(ordenes, tiposVehiculo, combos),
  }
}

// Desglose por carros/motos de una liquidación YA generada — a diferencia de fetchMontoPeriodo
// (que mira el rango de fechas), esto lee directo `ordenes.liquidacion_id`, así que es exacto a
// lo que quedó liquidado de verdad (sirve tanto recién generada como para reimprimir la colilla
// de una liquidación vieja del histórico).
export async function fetchDesgloseLiquidacion(
  liquidacionId: string,
  tiposVehiculo: Pick<TipoVehiculo, 'id' | 'categoria'>[],
  combos: Pick<Combo, 'id' | 'nombre'>[],
): Promise<DesgloseVehiculos> {
  const { data, error } = await db
    .from('ordenes')
    .select('tipoVehiculoId:tipo_vehiculo_id, comboId:combo_id, comisionLavador:comision_lavador')
    .eq('liquidacion_id', liquidacionId)
  if (error) throw new Error(error.message)
  const filas = data as { tipoVehiculoId: string; comboId: string | null; comisionLavador: number }[]
  return desglosarPorCategoria(
    filas.map((f) => ({ tipoVehiculoId: f.tipoVehiculoId, comboId: f.comboId ?? undefined, comisionLavador: f.comisionLavador })),
    tiposVehiculo,
    combos,
  )
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
