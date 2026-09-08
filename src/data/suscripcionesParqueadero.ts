import { db } from '../lib/db'
import {
  suscripcionInputSchema,
  suscripcionParqueaderoSchema,
  type SuscripcionInput,
  type SuscripcionParqueadero,
} from '../schemas/suscripcionParqueadero'

const SELECT =
  'id, placa, titular, telefono, modalidad, valor, fechaInicio:fecha_inicio, fechaFin:fecha_fin, activo, nota, creadoPor:creado_por, creadoEn:creado_en'

export async function fetchSuscripciones(): Promise<SuscripcionParqueadero[]> {
  const { data, error } = await db
    .from('suscripciones_parqueadero')
    .select(SELECT)
    .order('activo', { ascending: false })
    .order('fecha_fin', { ascending: true })
  if (error) throw new Error(error.message)
  return suscripcionParqueaderoSchema.array().parse(data)
}

export async function createSuscripcion(
  input: SuscripcionInput,
  creadoPor: string,
): Promise<SuscripcionParqueadero> {
  const parsed = suscripcionInputSchema.parse(input)
  const { data, error } = await db
    .from('suscripciones_parqueadero')
    .insert({
      placa: parsed.placa,
      titular: parsed.titular,
      telefono: parsed.telefono || null,
      modalidad: parsed.modalidad,
      valor: parsed.valor,
      fecha_inicio: parsed.fechaInicio,
      fecha_fin: parsed.fechaFin,
      nota: parsed.nota || null,
      creado_por: creadoPor,
    })
    .select(SELECT)
    .single()
  if (error) throw new Error(error.message)
  return suscripcionParqueaderoSchema.parse(data)
}

export async function updateSuscripcion(
  id: string,
  input: SuscripcionInput,
): Promise<SuscripcionParqueadero> {
  const parsed = suscripcionInputSchema.parse(input)
  const { data, error } = await db
    .from('suscripciones_parqueadero')
    .update({
      placa: parsed.placa,
      titular: parsed.titular,
      telefono: parsed.telefono || null,
      modalidad: parsed.modalidad,
      valor: parsed.valor,
      fecha_inicio: parsed.fechaInicio,
      fecha_fin: parsed.fechaFin,
      nota: parsed.nota || null,
    })
    .eq('id', id)
    .select(SELECT)
    .single()
  if (error) throw new Error(error.message)
  return suscripcionParqueaderoSchema.parse(data)
}

// Regla 5: se inactiva, no se borra.
export async function setSuscripcionActiva(id: string, activo: boolean): Promise<SuscripcionParqueadero> {
  const { data, error } = await db
    .from('suscripciones_parqueadero')
    .update({ activo })
    .eq('id', id)
    .select(SELECT)
    .single()
  if (error) throw new Error(error.message)
  return suscripcionParqueaderoSchema.parse(data)
}

// La suscripción activa de una placa — para el aviso de la portería del vigilante. Si hay más de
// una activa (renovación cargada por adelantado) se devuelve la de vencimiento más lejano.
export async function fetchSuscripcionActivaPorPlaca(
  placa: string,
): Promise<SuscripcionParqueadero | undefined> {
  const normalizada = placa.trim().toUpperCase()
  if (!normalizada) return undefined
  const { data, error } = await db
    .from('suscripciones_parqueadero')
    .select(SELECT)
    .eq('placa', normalizada)
    .eq('activo', true)
    .order('fecha_fin', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data ? suscripcionParqueaderoSchema.parse(data) : undefined
}
