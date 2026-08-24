import { db } from '../lib/db'
import { lavadorInputSchema, lavadorSchema, type Lavador, type LavadorInput } from '../schemas/lavador'
import { fetchAsistenciasDelDia, fetchDiasDescanso } from './asistenciaLavadores'

const LAVADOR_SELECT =
  'id, nombre, telefono, fechaIngreso:fecha_ingreso, fechaCumpleanos:fecha_cumpleanos, activo, ultimaAsignacion:ultima_asignacion'

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
// Desempate por `hora_entrada` (confirmado con Alessandro): cuando `ultima_asignacion` empata
// —típicamente todos en NULL al abrir un día nuevo, antes del primer lavado— la primera oleada
// del día se ordena por orden de llegada real (asistencia), no alfabético ni arbitrario.
export async function suggestNextLavador(): Promise<string | undefined> {
  const hoy = new Date().toISOString().slice(0, 10)
  const [asistenciasHoy, descansosHoy, { data: ocupados, error: errorOcupados }, { data, error }] = await Promise.all([
    fetchAsistenciasDelDia(hoy),
    fetchDiasDescanso(hoy, hoy),
    db.from('ordenes').select('lavador_id, lavador_id_2').eq('estado', 'en_proceso'),
    db.from('lavadores').select('id, ultimaAsignacion:ultima_asignacion').eq('activo', true),
  ])
  if (errorOcupados) throw new Error(errorOcupados.message)
  if (error) throw new Error(error.message)

  const presentesIds = new Set(asistenciasHoy.map((a) => a.lavadorId))
  const horaEntradaPorId = new Map(asistenciasHoy.map((a) => [a.lavadorId, a.horaEntrada]))
  const descansaHoyId = descansosHoy[0]?.lavadorId
  const ocupadosIds = new Set(
    (ocupados as { lavador_id: string | null; lavador_id_2: string | null }[]).flatMap((o) =>
      [o.lavador_id, o.lavador_id_2].filter((id): id is string => !!id),
    ),
  )

  const elegibles = (data as { id: string; ultimaAsignacion: string | null }[]).filter(
    (l) => presentesIds.has(l.id) && l.id !== descansaHoyId && !ocupadosIds.has(l.id),
  )
  elegibles.sort((a, b) => {
    const asigA = a.ultimaAsignacion ? new Date(a.ultimaAsignacion).getTime() : -Infinity
    const asigB = b.ultimaAsignacion ? new Date(b.ultimaAsignacion).getTime() : -Infinity
    if (asigA !== asigB) return asigA - asigB
    const horaA = horaEntradaPorId.get(a.id)
    const horaB = horaEntradaPorId.get(b.id)
    if (!horaA || !horaB) return 0
    return new Date(horaA).getTime() - new Date(horaB).getTime()
  })

  return elegibles[0]?.id
}

export async function registrarAsignacion(lavadorId: string): Promise<void> {
  const { error } = await db
    .from('lavadores')
    .update({ ultima_asignacion: new Date().toISOString() })
    .eq('id', lavadorId)
  if (error) throw new Error(error.message)
}
