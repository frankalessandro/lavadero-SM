import { db } from '../lib/db'
import {
  perfilSchema,
  perfilInputSchema,
  crearUsuarioInputSchema,
  type Perfil,
  type PerfilInput,
  type CrearUsuarioInput,
} from '../schemas/perfil'

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

// Crea la cuenta completa (correo + contraseña) sin pasar por Supabase Studio — la contraseña
// exige el privilegio de service role, que nunca puede llegar al bundle del cliente, así que este
// paso corre en el Edge Function `admin-create-usuario` (supabase/functions/admin-create-usuario),
// no acá. El trigger on_auth_user_created (0011_perfiles.sql) ya crea la fila de `perfiles` con
// rol=null apenas se crea la cuenta; `updatePerfil` (RLS normal de admin, ya probado) es lo que
// le asigna nombre/rol/activo justo después, sin duplicar esa lógica dentro del Edge Function.
export async function createUsuario(input: CrearUsuarioInput): Promise<Perfil> {
  const parsed = crearUsuarioInputSchema.parse(input)
  const { data, error } = await db.functions.invoke<{ id: string }>('admin-create-usuario', {
    body: { email: parsed.email, password: parsed.password, nombre: parsed.nombre },
  })
  if (error) {
    // FunctionsHttpError (respuesta 4xx/5xx del Edge Function) trae el mensaje real en el body
    // de `context` (Response), no en `error.message` (que solo dice "non-2xx status code").
    const context = (error as { context?: Response }).context
    if (context) {
      const body = await context.json().catch(() => null)
      throw new Error((body as { error?: string } | null)?.error ?? error.message)
    }
    throw new Error(error.message)
  }
  if (!data?.id) throw new Error('El servidor no devolvió el id del usuario creado')
  return updatePerfil(data.id, { nombre: parsed.nombre, rol: parsed.rol, activo: true })
}
