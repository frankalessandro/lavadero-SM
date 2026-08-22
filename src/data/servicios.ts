import { db } from '../lib/db'
import { servicioSchema, servicioInputSchema, type Servicio, type ServicioInput } from '../schemas/servicio'

export async function fetchServicios(): Promise<Servicio[]> {
  const { data, error } = await db.from('servicios').select('*').order('nombre')
  if (error) throw new Error(error.message)
  return servicioSchema.array().parse(data)
}

export async function createServicio(input: ServicioInput): Promise<Servicio> {
  const parsed = servicioInputSchema.parse(input)
  const { data, error } = await db.from('servicios').insert(parsed).select().single()
  if (error) throw new Error(error.message)
  return servicioSchema.parse(data)
}

export async function updateServicio(id: string, input: ServicioInput): Promise<Servicio> {
  const parsed = servicioInputSchema.parse(input)
  const { data, error } = await db.from('servicios').update(parsed).eq('id', id).select().single()
  if (error) throw new Error(error.message)
  return servicioSchema.parse(data)
}

export async function setServicioActivo(id: string, activo: boolean): Promise<Servicio> {
  const { data, error } = await db.from('servicios').update({ activo }).eq('id', id).select().single()
  if (error) throw new Error(error.message)
  return servicioSchema.parse(data)
}
