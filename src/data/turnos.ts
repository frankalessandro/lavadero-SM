import { db } from '../lib/db'
import {
  abrirTurnoInputSchema,
  turnoCajaSchema,
  traspasoTurnoSchema,
  type AbrirTurnoInput,
  type RolCaja,
  type TurnoCaja,
  type TraspasoTurno,
} from '../schemas/turnoCaja'

const TURNO_SELECT =
  'id, rol, responsable, responsableActual:responsable_actual, baseInicial:base_inicial, abiertoEn:abierto_en, cerrado, conteoFisico:conteo_fisico, valorEsperado:valor_esperado, diferencia, justificacionDiferencia:justificacion_diferencia, cerradoPor:cerrado_por, cerradoEn:cerrado_en, recibidoPor:recibido_por'

const TRASPASO_SELECT = 'id, turnoId:turno_id, de, a, hechoEn:hecho_en'

export async function fetchTurnoAbierto(rol: RolCaja): Promise<TurnoCaja | undefined> {
  const { data, error } = await db
    .from('turnos_caja')
    .select(TURNO_SELECT)
    .eq('rol', rol)
    .eq('cerrado', false)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data ? turnoCajaSchema.parse(data) : undefined
}

export async function fetchTurnos(rol?: RolCaja): Promise<TurnoCaja[]> {
  let query = db.from('turnos_caja').select(TURNO_SELECT).order('abierto_en', { ascending: false })
  if (rol) query = query.eq('rol', rol)
  const { data, error } = await query
  if (error) throw new Error(error.message)
  return turnoCajaSchema.array().parse(data)
}

export async function abrirTurno(input: AbrirTurnoInput): Promise<TurnoCaja> {
  const parsed = abrirTurnoInputSchema.parse(input)
  const { data, error } = await db
    .from('turnos_caja')
    .insert({
      rol: parsed.rol,
      responsable: parsed.responsable,
      responsable_actual: parsed.responsable,
      base_inicial: parsed.baseInicial,
    })
    .select(TURNO_SELECT)
    .single()
  if (error) throw new Error(error.message)
  return turnoCajaSchema.parse(data)
}

// Transfiere la responsabilidad del turno a mitad de servicio (ej. el jefe de zona se ausenta)
// sin cerrar/reabrir turno — `responsable` (quién lo abrió) no cambia, regla de negocio 14 sigue
// intacta. Se registra primero en el log de traspasos y luego se actualiza el turno (no atómico,
// mismo criterio que `generarLiquidacion`: si el update fallara después del insert, error
// explícito para revisión manual — caso excepcional, no falla en silencio).
export async function transferirResponsable(turnoId: string, actual: string, nuevoResponsable: string): Promise<TurnoCaja> {
  const { error: errorTraspaso } = await db
    .from('traspasos_turno')
    .insert({ turno_id: turnoId, de: actual, a: nuevoResponsable })
  if (errorTraspaso) throw new Error(errorTraspaso.message)

  const { data, error } = await db
    .from('turnos_caja')
    .update({ responsable_actual: nuevoResponsable })
    .eq('id', turnoId)
    .eq('cerrado', false) // regla de negocio 14: un turno cerrado es inmodificable
    .select(TURNO_SELECT)
    .single()
  if (error) {
    throw new Error(
      `El traspaso quedó registrado pero no se pudo actualizar el turno ${turnoId} — revisa manualmente. ${error.message}`,
    )
  }
  return turnoCajaSchema.parse(data)
}

export async function fetchTraspasos(turnoId: string): Promise<TraspasoTurno[]> {
  const { data, error } = await db
    .from('traspasos_turno')
    .select(TRASPASO_SELECT)
    .eq('turno_id', turnoId)
    .order('hecho_en', { ascending: false })
  if (error) throw new Error(error.message)
  return traspasoTurnoSchema.array().parse(data)
}

async function ingresosLavadosEfectivo(turnoId: string): Promise<number> {
  const { data, error } = await db
    .from('ordenes')
    .select('precio')
    .eq('turno_id', turnoId)
    .eq('estado', 'entregado')
    .eq('metodo_pago', 'efectivo')
  if (error) throw new Error(error.message)
  return (data ?? []).reduce((total, o) => total + (o.precio as number), 0)
}

// Ventas de productos de inventario (agua, cerveza, etc.) — se cuentan aparte de los lavados en
// los indicadores del dashboard, pero suman igual al arqueo del turno de jefe_zona: es la misma
// caja física. Solo 'activa' (una venta anulada nunca movió dinero real) y efectivo.
async function ingresosVentasEfectivo(turnoId: string): Promise<number> {
  const { data, error } = await db
    .from('ventas')
    .select('total')
    .eq('turno_id', turnoId)
    .eq('estado', 'activa')
    .eq('metodo_pago', 'efectivo')
  if (error) throw new Error(error.message)
  return (data ?? []).reduce((total, v) => total + (v.total as number), 0)
}

async function gastosDeCaja(turnoId: string): Promise<number> {
  const { data, error } = await db.from('gastos').select('monto').eq('turno_id', turnoId).eq('origen', 'caja')
  if (error) throw new Error(error.message)
  return (data ?? []).reduce((total, g) => total + (g.monto as number), 0)
}

// Solo la modalidad efectivo es dinero físico que se puede contar — transferencias no entran
// al arqueo. Gastos en caja se asumen pagados en efectivo desde la misma caja.
export async function calcularValorEsperado(turno: TurnoCaja): Promise<number> {
  const salidas = await gastosDeCaja(turno.id)

  let ingresos: number
  if (turno.rol === 'jefe_zona') {
    const [lavados, ventas] = await Promise.all([ingresosLavadosEfectivo(turno.id), ingresosVentasEfectivo(turno.id)])
    ingresos = lavados + ventas
  } else {
    const estanciasRes = await db
      .from('estancias_parqueadero')
      .select('cobro')
      .eq('turno_id', turno.id)
      .eq('estado', 'fuera')
      .eq('metodo_pago', 'efectivo')
    if (estanciasRes.error) throw new Error(estanciasRes.error.message)
    ingresos = (estanciasRes.data ?? []).reduce((total, e) => total + ((e.cobro as number | null) ?? 0), 0)
  }

  return turno.baseInicial + ingresos - salidas
}

export interface DesgloseEsperado {
  base: number
  ingresosLavados: number
  ingresosVentas: number
  gastos: number
  total: number
}

// Mismas fuentes que calcularValorEsperado, pero separadas — solo para mostrar el detalle en el
// paso 2 del cierre de turno (arqueo ciego). Ingresos por lavados y por ventas se ven aparte
// (como pidió el negocio), pero ambos suman al mismo total esperado.
export async function desgloseEsperado(turno: TurnoCaja): Promise<DesgloseEsperado> {
  const gastos = await gastosDeCaja(turno.id)
  const ingresosLavados = turno.rol === 'jefe_zona' ? await ingresosLavadosEfectivo(turno.id) : 0
  const ingresosVentas = turno.rol === 'jefe_zona' ? await ingresosVentasEfectivo(turno.id) : 0
  const total = turno.rol === 'jefe_zona' ? turno.baseInicial + ingresosLavados + ingresosVentas - gastos : await calcularValorEsperado(turno)
  return { base: turno.baseInicial, ingresosLavados, ingresosVentas, gastos, total }
}

export async function cerrarTurno(
  turno: TurnoCaja,
  conteoFisico: number,
  cerradoPor: string,
  justificacionDiferencia?: string,
  recibidoPor?: string,
): Promise<TurnoCaja> {
  const valorEsperado = await calcularValorEsperado(turno)
  const diferencia = conteoFisico - valorEsperado

  if (diferencia !== 0 && !justificacionDiferencia) {
    throw new Error('Hay una diferencia en el arqueo — la justificación es obligatoria para cerrar el turno.')
  }

  const { data, error } = await db
    .from('turnos_caja')
    .update({
      cerrado: true,
      conteo_fisico: conteoFisico,
      valor_esperado: valorEsperado,
      diferencia,
      justificacion_diferencia: justificacionDiferencia,
      cerrado_por: cerradoPor,
      cerrado_en: new Date().toISOString(),
      recibido_por: recibidoPor,
    })
    .eq('id', turno.id)
    .eq('cerrado', false) // regla de negocio 14: un turno cerrado es inmodificable
    .select(TURNO_SELECT)
    .single()
  if (error) throw new Error(error.message)
  return turnoCajaSchema.parse(data)
}
