import { db } from '../lib/db'
import { lavadorInputSchema, lavadorSchema, type Lavador, type LavadorInput } from '../schemas/lavador'

const LAVADOR_SELECT =
  'id, nombre, telefono, fechaIngreso:fecha_ingreso, fechaCumpleanos:fecha_cumpleanos, activo, pagoDiario:pago_diario'

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
// aparte. El primero es el activo con más tiempo sin ser asignado (o nunca asignado, NULL
// primero). Al asignar, se actualiza su marca de tiempo y pasa al final de la cola.
export async function suggestNextLavador(): Promise<string | undefined> {
  const { data, error } = await db
    .from('lavadores')
    .select('id')
    .eq('activo', true)
    .order('ultima_asignacion', { nullsFirst: true })
    .limit(1)
  if (error) throw new Error(error.message)
  return data[0]?.id
}

export async function registrarAsignacion(lavadorId: string): Promise<void> {
  const { error } = await db
    .from('lavadores')
    .update({ ultima_asignacion: new Date().toISOString() })
    .eq('id', lavadorId)
  if (error) throw new Error(error.message)
}
