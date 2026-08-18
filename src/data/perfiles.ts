import { db } from '../lib/db'
import { perfilSchema, perfilInputSchema, type Perfil, type PerfilInput } from '../schemas/perfil'

const PERFIL_SELECT = 'id, nombre, rol, activo, creadoEn:creado_en'

export async function fetchPerfiles(): Promise<Perfil[]> {
  const { data, error } = await db.from('perfiles').select(PERFIL_SELECT).order('creado_en')
  if (error) throw new Error(error.message)
  return perfilSchema.array().parse(data)
}

export async function fetchPerfilActual(userId: string): Promise<Perfil | null> {
  const { data, error } = await db.from('perfiles').select(PERFIL_SELECT).eq('id', userId).maybeSingle()
  if (error) throw new Error(error.message)
  return data ? perfilSchema.parse(data) : null
}

// Las filas de `perfiles` las crea el trigger on_auth_user_created al registrarse el usuario en
// Supabase Auth (ver 0011_perfiles.sql) — no hay create/delete aquí, solo asignar rol/nombre/activo.
export async function updatePerfil(id: string, input: PerfilInput): Promise<Perfil> {
  const parsed = perfilInputSchema.parse(input)
  const { data, error } = await db.from('perfiles').update(parsed).eq('id', id).select(PERFIL_SELECT).single()
  if (error) throw new Error(error.message)
  return perfilSchema.parse(data)
}
