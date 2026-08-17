import { db } from '../lib/db'
import {
  abrirTurnoInputSchema,
  turnoCajaSchema,
  type AbrirTurnoInput,
  type RolCaja,
  type TurnoCaja,
} from '../schemas/turnoCaja'

const TURNO_SELECT =
  'id, rol, responsable, baseInicial:base_inicial, abiertoEn:abierto_en, cerrado, conteoFisico:conteo_fisico, valorEsperado:valor_esperado, diferencia, justificacionDiferencia:justificacion_diferencia, cerradoPor:cerrado_por, cerradoEn:cerrado_en, recibidoPor:recibido_por'

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
    .insert({ rol: parsed.rol, responsable: parsed.responsable, base_inicial: parsed.baseInicial })
    .select(TURNO_SELECT)
    .single()
  if (error) throw new Error(error.message)
  return turnoCajaSchema.parse(data)
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
