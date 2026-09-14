import { db } from '../lib/db'
import { liquidacionSchema, type Liquidacion } from '../schemas/liquidacion'
import { fetchLavadores } from './lavadores'
import { fetchOrdenesEnRango } from './ordenes'
import { fetchDeudaPendiente, fetchDeudaPendientePorLavador } from './deudasLavador'
import type { TipoVehiculo } from '../schemas/tipoVehiculo'
import type { Combo } from '../schemas/combo'

const LIQUIDACION_SELECT =
  'id, lavadorId:lavador_id, periodoInicio:periodo_inicio, periodoFin:periodo_fin, monto, comisionBruta:comision_bruta, deudaDescontada:deuda_descontada, pagada, pagadaEn:pagada_en, anulada, motivoAnulacion:motivo_anulacion, anuladaPor:anulada_por, anuladaEn:anulada_en, creadoEn:creado_en'

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
  // Comisión acumulada sin liquidar (sin restar deuda) — mismo significado de siempre.
  montoPendiente: number
  cantidadOrdenes: number
  // Deuda pendiente del lavador (préstamos + consumo de nevera, 0065) — lo que se le descontaría
  // si se liquidara TODO lo pendiente ahora mismo.
  deudaPendiente: number
  // max(0, montoPendiente − deudaPendiente) — nunca negativo (regla confirmada: si la deuda es
  // mayor, la liquidación de ese corte queda en $0 y el resto de deuda sigue pendiente).
  montoNeto: number
}

// "Lavar entre 2" (a criterio de recepción/jefe de zona): reparte la comisión total de la orden
// 50/50 entre lavadorId (principal) y lavadorId2. El principal se lleva el redondeo hacia arriba
// cuando el monto es impar, para que las dos mitades siempre sumen exactamente comisionLavador
// (nunca se pierde ni se inventa plata al repartir).
function splitComision(comisionLavador: number, tieneSegundo: boolean): [number, number] {
  if (!tieneSegundo) return [comisionLavador, 0]
  const mitadPrincipal = Math.ceil(comisionLavador / 2)
  return [mitadPrincipal, comisionLavador - mitadPrincipal]
}

// Cuánto de `orden.comisionLavador` (el TOTAL de la orden) le corresponde a este lavador
// específico — la mitad si lavó entre 2, el total si fue el único. Se usa en cualquier lugar que
// necesite el monto REAL de un lavador (liquidar, mostrar pendientes), nunca comisionLavador
// directo cuando puede haber un segundo lavador de por medio.
export function comisionParaLavador(
  orden: { comisionLavador: number; lavadorId?: string; lavadorId2?: string },
  lavadorId: string,
): number {
  if (!orden.lavadorId2) return orden.comisionLavador
  const [mitadPrincipal, mitadSegundo] = splitComision(orden.comisionLavador, true)
  return orden.lavadorId === lavadorId ? mitadPrincipal : mitadSegundo
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
  // (regla 1), no depende de en qué estado esté. No se filtra por liquidacion_id/liquidacion_id_2
  // en la query (a diferencia de antes) porque ahora son independientes entre sí — una orden con
  // segundo lavador puede estar liquidada para uno y pendiente para el otro, se decide en JS
  // abajo, por columna, cuál de los dos lavadores sigue pendiente.
  const { data, error } = await db
    .from('ordenes')
    .select('lavador_id, lavador_id_2, comision_lavador, liquidacion_id, liquidacion_id_2')
    .neq('estado', 'anulada')
  if (error) throw new Error(error.message)

  const acumulado = new Map<string, { monto: number; cantidad: number }>()
  function sumar(lavadorId: string, monto: number) {
    const actual = acumulado.get(lavadorId) ?? { monto: 0, cantidad: 0 }
    actual.monto += monto
    actual.cantidad += 1
    acumulado.set(lavadorId, actual)
  }
  for (const fila of data as {
    lavador_id: string | null
    lavador_id_2: string | null
    comision_lavador: number
    liquidacion_id: string | null
    liquidacion_id_2: string | null
  }[]) {
    const tieneSegundo = !!fila.lavador_id_2
    const [mitadPrincipal, mitadSegundo] = splitComision(fila.comision_lavador, tieneSegundo)
    if (fila.lavador_id && fila.liquidacion_id == null) {
      sumar(fila.lavador_id, tieneSegundo ? mitadPrincipal : fila.comision_lavador)
    }
    if (fila.lavador_id_2 && fila.liquidacion_id_2 == null) {
      sumar(fila.lavador_id_2, mitadSegundo)
    }
  }

  const deudaPorLavador = await fetchDeudaPendientePorLavador()

  return elegibles.map((lavador) => {
    const acumuladoLavador = acumulado.get(lavador.id) ?? { monto: 0, cantidad: 0 }
    const deudaPendiente = deudaPorLavador.get(lavador.id) ?? 0
    return {
      lavadorId: lavador.id,
      lavadorNombre: lavador.nombre,
      montoPendiente: acumuladoLavador.monto,
      cantidadOrdenes: acumuladoLavador.cantidad,
      deudaPendiente,
      montoNeto: Math.max(0, acumuladoLavador.monto - deudaPendiente),
    }
  })
}

export interface ResumenPeriodoLavador {
  lavadorId: string
  lavadorNombre: string
  cantidadOrdenes: number
  // Comisión generada en el periodo, haya quedado liquidada o no — para comparar "cuánto se
  // ganó" contra el histórico de liquidaciones (que muestra lo ya cortado/pagado de verdad).
  montoTotal: number
  // De ese total, lo que sigue sin liquidación (ni principal ni de segundo lavador según aplique).
  montoPendiente: number
}

// Reporte por periodo (día/semana/mes vía PeriodoSelector) para /admin/dinero/liquidaciones —
// a diferencia de fetchComisionesPendientes (acumulado TOTAL histórico sin liquidar, sin fecha),
// esto agrupa por lavador todo lo generado dentro de un rango específico, liquidado o no.
export async function fetchResumenPeriodoLavadores(periodoInicio: string, periodoFin: string): Promise<ResumenPeriodoLavador[]> {
  const hastaExclusivoISO = new Date(`${periodoFin}T00:00:00.000Z`)
  hastaExclusivoISO.setUTCDate(hastaExclusivoISO.getUTCDate() + 1)

  const [lavadores, ordenes] = await Promise.all([
    fetchLavadores(),
    fetchOrdenesEnRango(new Date(`${periodoInicio}T00:00:00.000Z`).toISOString(), hastaExclusivoISO.toISOString()),
  ])

  const acumulado = new Map<string, { cantidad: number; total: number; pendiente: number }>()
  function sumar(lavadorId: string, monto: number, liquidado: boolean) {
    const actual = acumulado.get(lavadorId) ?? { cantidad: 0, total: 0, pendiente: 0 }
    actual.cantidad += 1
    actual.total += monto
    if (!liquidado) actual.pendiente += monto
    acumulado.set(lavadorId, actual)
  }
  for (const orden of ordenes) {
    if (orden.estado === 'anulada') continue
    if (orden.lavadorId) sumar(orden.lavadorId, comisionParaLavador(orden, orden.lavadorId), orden.liquidacionId !== undefined)
    if (orden.lavadorId2) sumar(orden.lavadorId2, comisionParaLavador(orden, orden.lavadorId2), orden.liquidacionId2 !== undefined)
  }

  const nombrePorId = new Map(lavadores.map((l) => [l.id, l.nombre] as const))
  return Array.from(acumulado.entries())
    .map(([lavadorId, a]) => ({
      lavadorId,
      lavadorNombre: nombrePorId.get(lavadorId) ?? '—',
      cantidadOrdenes: a.cantidad,
      montoTotal: a.total,
      montoPendiente: a.pendiente,
    }))
    .sort((a, b) => b.montoTotal - a.montoTotal)
}

// Órdenes que entrarían en una liquidación de este lavador para el rango [periodoInicio,
// periodoFin] (fechas YYYY-MM-DD, ambas inclusivas) — mismo filtro que aplica `generarLiquidacion`
// al momento de crearla, extraído aparte para poder mostrar un monto preciso ANTES de generar
// (admin ahora puede elegir diaria o semanal por lavador, así que el monto ya no es siempre
// "todo lo pendiente" — depende del rango elegido).
// Órdenes donde este lavador participó (principal o segundo) y todavía tiene esa mitad sin
// liquidar — cada columna (liquidacionId/liquidacionId2) es independiente, así que una orden con
// dos lavadores puede seguir "elegible" para uno aunque ya se haya liquidado para el otro.
async function ordenesElegibles(lavadorId: string, periodoInicio: string, periodoFin: string) {
  // periodoFin es una fecha (YYYY-MM-DD) inclusiva para el usuario; fetchOrdenesEnRango usa
  // límite superior exclusivo, así que se extiende un día para incluir todo el día de cierre.
  const hastaExclusivoISO = new Date(`${periodoFin}T00:00:00.000Z`)
  hastaExclusivoISO.setUTCDate(hastaExclusivoISO.getUTCDate() + 1)

  return (
    await fetchOrdenesEnRango(new Date(`${periodoInicio}T00:00:00.000Z`).toISOString(), hastaExclusivoISO.toISOString())
  ).filter((orden) => {
    if (orden.estado === 'anulada') return false
    if (orden.lavadorId === lavadorId && orden.liquidacionId === undefined) return true
    if (orden.lavadorId2 === lavadorId && orden.liquidacionId2 === undefined) return true
    return false
  })
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
  // Comisión generada en el rango, sin restar deuda (lo que dice el desglose de abajo).
  monto: number
  cantidadOrdenes: number
  desglose: DesgloseVehiculos
  // Deuda pendiente del lavador AHORA MISMO (no depende del rango — 0065) y lo que realmente se
  // pagaría si se generara esta liquidación: max(0, monto − deudaPendiente).
  deudaPendiente: number
  montoNeto: number
}

// Preview del monto real que generaría una liquidación diaria o semanal para este lavador y
// rango — se usa antes de confirmar, porque `montoPendiente` de fetchComisionesPendientes es el
// acumulado TOTAL sin liquidar, no lo que cae dentro de un rango diario/semanal específico.
// Incluye el desglose por carros/motos para que el admin vea, antes de generar, cuánto hizo con
// cada uno en ese periodo, y la deuda que se le descontaría (0065).
export async function fetchMontoPeriodo(
  lavadorId: string,
  periodoInicio: string,
  periodoFin: string,
  tiposVehiculo: Pick<TipoVehiculo, 'id' | 'categoria'>[],
  combos: Pick<Combo, 'id' | 'nombre'>[],
): Promise<MontoPeriodo> {
  const [ordenes, deudaPendiente] = await Promise.all([
    ordenesElegibles(lavadorId, periodoInicio, periodoFin),
    fetchDeudaPendiente(lavadorId),
  ])
  // El desglose y el monto deben ser la MITAD para este lavador cuando la orden se lavó entre 2,
  // no el total de la orden — de ahí el map antes de pasarlo a desglosarPorCategoria.
  const ordenesConSuMonto = ordenes.map((orden) => ({
    ...orden,
    comisionLavador: comisionParaLavador(orden, lavadorId),
  }))
  const monto = ordenesConSuMonto.reduce((suma, orden) => suma + orden.comisionLavador, 0)
  return {
    monto,
    cantidadOrdenes: ordenes.length,
    desglose: desglosarPorCategoria(ordenesConSuMonto, tiposVehiculo, combos),
    deudaPendiente,
    montoNeto: Math.max(0, monto - deudaPendiente),
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
  // Una liquidación puede haber marcado la orden por cualquiera de las dos columnas (principal o
  // segundo lavador, ver generarLiquidacion) — de ahí el `.or`. Cuál de las dos columnas coincide
  // con este liquidacionId es justamente lo que dice si le toca la mitad de principal o de
  // segundo (no hace falta volver a consultar quién es el lavador).
  const { data, error } = await db
    .from('ordenes')
    .select(
      'tipoVehiculoId:tipo_vehiculo_id, comboId:combo_id, comisionLavador:comision_lavador, lavadorId2:lavador_id_2, liquidacionId:liquidacion_id',
    )
    .or(`liquidacion_id.eq.${liquidacionId},liquidacion_id_2.eq.${liquidacionId}`)
  if (error) throw new Error(error.message)
  const filas = data as {
    tipoVehiculoId: string
    comboId: string | null
    comisionLavador: number
    lavadorId2: string | null
    liquidacionId: string | null
  }[]
  return desglosarPorCategoria(
    filas.map((f) => {
      const tieneSegundo = !!f.lavadorId2
      const [mitadPrincipal, mitadSegundo] = splitComision(f.comisionLavador, tieneSegundo)
      const comisionLavador = !tieneSegundo ? f.comisionLavador : f.liquidacionId === liquidacionId ? mitadPrincipal : mitadSegundo
      return { tipoVehiculoId: f.tipoVehiculoId, comboId: f.comboId ?? undefined, comisionLavador }
    }),
    tiposVehiculo,
    combos,
  )
}

// No hay transacciones multi-tabla vía PostgREST plano, así que se hace en tres pasos: 1) inserta
// la liquidación (con el neto ya calculado — comisionBruta menos deuda aplicada, 0065), 2) marca
// las órdenes correspondientes con el id recién creado, 3) si se descontó deuda, deja la fila
// 'liquidacion' en el ledger de deudas_lavador que refleja ese descuento. Si un paso falla se
// reporta explícitamente con lo que sí quedó hecho — no falla en silencio, hay que revisar manual.
//
// La deuda se aplica hasta donde alcance la comisión de ESTE corte (regla confirmada,
// 2026-09-14): nunca se genera un monto negativo. Si sobra deuda, sigue pendiente para la
// siguiente liquidación — no se "pierde" ni se inventa, sigue en el ledger sin tocar.
export async function generarLiquidacion(
  lavadorId: string,
  periodoInicio: string,
  periodoFin: string,
): Promise<Liquidacion> {
  const [ordenes, deudaPendiente] = await Promise.all([
    ordenesElegibles(lavadorId, periodoInicio, periodoFin),
    fetchDeudaPendiente(lavadorId),
  ])

  const comisionBruta = ordenes.reduce((suma, orden) => suma + comisionParaLavador(orden, lavadorId), 0)
  const deudaDescontada = Math.min(Math.max(deudaPendiente, 0), comisionBruta)
  const monto = comisionBruta - deudaDescontada

  const { data: creada, error: errorInsert } = await db
    .from('liquidaciones')
    .insert({
      lavador_id: lavadorId,
      periodo_inicio: periodoInicio,
      periodo_fin: periodoFin,
      monto,
      comision_bruta: comisionBruta,
      deuda_descontada: deudaDescontada,
    })
    .select(LIQUIDACION_SELECT)
    .single()
  if (errorInsert) throw new Error(errorInsert.message)

  const liquidacion = liquidacionSchema.parse(creada)

  if (ordenes.length > 0) {
    // Cada orden se marca por la columna que corresponde a ESTE lavador — principal
    // (liquidacion_id) o segundo (liquidacion_id_2) — para no tocar la liquidación pendiente del
    // otro lavador cuando la orden se lavó entre 2.
    const idsPrincipal = ordenes.filter((orden) => orden.lavadorId === lavadorId).map((orden) => orden.id)
    const idsSegundo = ordenes.filter((orden) => orden.lavadorId2 === lavadorId).map((orden) => orden.id)
    const resultados = await Promise.all([
      idsPrincipal.length > 0
        ? db.from('ordenes').update({ liquidacion_id: liquidacion.id }).in('id', idsPrincipal)
        : Promise.resolve({ error: null }),
      idsSegundo.length > 0
        ? db.from('ordenes').update({ liquidacion_id_2: liquidacion.id }).in('id', idsSegundo)
        : Promise.resolve({ error: null }),
    ])
    const errorUpdate = resultados.find((r) => r.error)?.error
    if (errorUpdate) {
      throw new Error(
        `La liquidación ${liquidacion.id} se creó por $${monto} pero no se pudo marcar ${ordenes.length} orden(es) como liquidadas: ${errorUpdate.message}. Revisar manualmente.`,
      )
    }
  }

  if (deudaDescontada > 0) {
    const { error: errorDeuda } = await db.from('deudas_lavador').insert({
      lavador_id: lavadorId,
      tipo: 'liquidacion',
      monto: -deudaDescontada,
      liquidacion_id: liquidacion.id,
      motivo: `Descontado al liquidar (periodo ${periodoInicio} → ${periodoFin})`,
      registrado_por: 'Generación de liquidación',
    })
    if (errorDeuda) {
      throw new Error(
        `La liquidación ${liquidacion.id} se generó por $${monto} (se descontaron $${deudaDescontada} de deuda) pero no se pudo registrar ese descuento en el ledger de deuda: ${errorDeuda.message}. Revisar manualmente — la deuda del lavador puede quedar duplicada si se vuelve a liquidar sin corregir esto.`,
      )
    }
  }

  return liquidacion
}

// Deshace un corte mal generado (rango/lavador equivocado, se generó dos veces). Va por la RPC
// `anular_liquidacion` (0049): solo si NO está pagada, devuelve las órdenes a "pendiente"
// (liquidacion_id → null) y marca la liquidación `anulada` con motivo/quién, en una transacción.
// Solo admin (chequeo dentro de la RPC).
export async function anularLiquidacion(id: string, motivo: string, anuladaPor: string): Promise<Liquidacion> {
  const { data, error } = await db
    .rpc('anular_liquidacion', { p_id: id, p_motivo: motivo, p_anulada_por: anuladaPor })
    .select(LIQUIDACION_SELECT)
    .single()
  if (error) throw new Error(error.message)
  return liquidacionSchema.parse(data)
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
