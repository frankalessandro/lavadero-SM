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

// Solo la modalidad efectivo es dinero físico que se puede contar — transferencias no entran
// al arqueo. Gastos en caja se asumen pagados en efectivo desde la misma caja.
export async function calcularValorEsperado(turno: TurnoCaja): Promise<number> {
  const gastosRes = await db.from('gastos').select('monto').eq('turno_id', turno.id).eq('origen', 'caja')
  if (gastosRes.error) throw new Error(gastosRes.error.message)
  const salidas = (gastosRes.data ?? []).reduce((total, g) => total + (g.monto as number), 0)

  let ingresos: number
  if (turno.rol === 'jefe_zona') {
    const ordenesRes = await db
      .from('ordenes')
      .select('precio')
      .eq('turno_id', turno.id)
      .eq('estado', 'entregado')
      .eq('metodo_pago', 'efectivo')
    if (ordenesRes.error) throw new Error(ordenesRes.error.message)
    ingresos = (ordenesRes.data ?? []).reduce((total, o) => total + (o.precio as number), 0)
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
