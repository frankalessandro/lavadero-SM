import { db } from '../lib/db'
import { lavadorInputSchema, lavadorSchema, type Lavador, type LavadorInput } from '../schemas/lavador'
import { fetchAsistenciasDelDia, fetchDiasDescanso } from './asistenciaLavadores'

const LAVADOR_SELECT =
  'id, nombre, telefono, fechaIngreso:fecha_ingreso, fechaCumpleanos:fecha_cumpleanos, activo, pagoDiario:pago_diario, ultimaAsignacion:ultima_asignacion'

export async function fetchLavadores(): Promise<Lavador[]> {
  const { data, error } = await db
    .from('lavadores')
    .select(LAVADOR_SELECT)
    .order('nombre')
  if (error) throw new Error(error.message)
  return lavadorSchema.array().parse(data)
}

// Regla de negocio 5: los lavadores nunca se eliminan, solo se crean/editan/inactivan.
export async function createLavador(input: LavadorInput): Promise<Lavador> {
  const parsed = lavadorInputSchema.parse(input)
  const { data, error } = await db
    .from('lavadores')
    .insert({
      nombre: parsed.nombre,
      telefono: parsed.telefono,
      fecha_ingreso: parsed.fechaIngreso,
      fecha_cumpleanos: parsed.fechaCumpleanos,
      pago_diario: parsed.pagoDiario,
    })
    .select(LAVADOR_SELECT)
    .single()
  if (error) throw new Error(error.message)
  return lavadorSchema.parse(data)
}

export async function updateLavador(id: string, input: LavadorInput): Promise<Lavador> {
  const parsed = lavadorInputSchema.parse(input)
  const { data, error } = await db
    .from('lavadores')
    .update({
      nombre: parsed.nombre,
      telefono: parsed.telefono,
      fecha_ingreso: parsed.fechaIngreso,
      fecha_cumpleanos: parsed.fechaCumpleanos,
      pago_diario: parsed.pagoDiario,
    })
    .eq('id', id)
    .select(LAVADOR_SELECT)
    .single()
  if (error) throw new Error(error.message)
  return lavadorSchema.parse(data)
}

export async function setLavadorActivo(id: string, activo: boolean): Promise<Lavador> {
  const { data, error } = await db
    .from('lavadores')
    .update({ activo })
    .eq('id', id)
    .select(LAVADOR_SELECT)
    .single()
  if (error) throw new Error(error.message)
  return lavadorSchema.parse(data)
}

// Cola de rotación persistida en la propia tabla (regla de negocio 9) — sin tabla de cola
// aparte. El primero elegible es el activo con más tiempo sin ser asignado (o nunca asignado,
// NULL primero), que haya marcado llegada hoy (asistencias_lavadores, M9), a quien no le toque
// descansar hoy (dias_descanso, M9), y que no esté ocupado ahora mismo (sin una orden en_proceso
// a su cargo — regla 9: si está ocupado la cola avanza y él conserva su posición para la
// siguiente ronda, lo cual sale gratis de no tocar su `ultima_asignacion` mientras no aparece
// en este cálculo). Al asignar, se actualiza su marca de tiempo y pasa al final de la cola.
export async function suggestNextLavador(): Promise<string | undefined> {
  const hoy = new Date().toISOString().slice(0, 10)
  const [asistenciasHoy, descansosHoy, { data: ocupados, error: errorOcupados }, { data, error }] = await Promise.all([
    fetchAsistenciasDelDia(hoy),
    fetchDiasDescanso(hoy, hoy),
    db.from('ordenes').select('lavador_id').eq('estado', 'en_proceso'),
    db.from('lavadores').select('id').eq('activo', true).order('ultima_asignacion', { nullsFirst: true }),
  ])
  if (errorOcupados) throw new Error(errorOcupados.message)
  if (error) throw new Error(error.message)

  const presentesIds = new Set(asistenciasHoy.map((a) => a.lavadorId))
  const descansaHoyId = descansosHoy[0]?.lavadorId
  const ocupadosIds = new Set((ocupados as { lavador_id: string }[]).map((o) => o.lavador_id))

  return (data as { id: string }[]).find(
    (l) => presentesIds.has(l.id) && l.id !== descansaHoyId && !ocupadosIds.has(l.id),
  )?.id
}

export async function registrarAsignacion(lavadorId: string): Promise<void> {
  const { error } = await db
    .from('lavadores')
    .update({ ultima_asignacion: new Date().toISOString() })
    .eq('id', lavadorId)
  if (error) throw new Error(error.message)
}
