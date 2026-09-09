import { db } from '../lib/db'
import { generarPasswordDesechable, normalizaParaEmail } from '../lib/password'
import {
  perfilSchema,
  perfilInputSchema,
  crearUsuarioInputSchema,
  type Perfil,
  type PerfilInput,
  type CrearUsuarioInput,
  type Rol,
} from '../schemas/perfil'

const PERFIL_SELECT =
  'id, nombre, roles, rolActivo:rol_activo, activo, debeCambiarPassword:debe_cambiar_password, personaId:persona_id, creadoEn:creado_en'

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
// Supabase Auth (ver 0011_perfiles.sql) — acá solo se asignan nombre/roles/activo/persona. Si la
// cuenta queda con un solo rol, se fija también `rol_activo` para que entre directo sin pasar por
// el selector de módulo.
export async function updatePerfil(id: string, input: PerfilInput): Promise<Perfil> {
  const parsed = perfilInputSchema.parse(input)
  const payload: Record<string, unknown> = {
    nombre: parsed.nombre,
    roles: parsed.roles,
    activo: parsed.activo,
    persona_id: parsed.personaId || null,
    rol_activo: parsed.roles.length === 1 ? parsed.roles[0] : null,
  }
  const { data, error } = await db.from('perfiles').update(payload).eq('id', id).select(PERFIL_SELECT).single()
  if (error) throw new Error(error.message)
  return perfilSchema.parse(data)
}

// Módulo activo — lo llama el selector de módulo (y `null` lo llama signOut para limpiar). La
// validación real (rol concedido + cuenta activa) vive en la RPC.
export async function setRolActivo(rol: Rol | null): Promise<void> {
  const { error } = await db.rpc('set_rol_activo', { p_rol: rol })
  if (error) throw new Error(error.message)
}

// La persona ya cambió su contraseña desechable en el primer ingreso — baja el flag.
export async function marcarPasswordCambiada(): Promise<void> {
  const { error } = await db.rpc('marcar_password_cambiada')
  if (error) throw new Error(error.message)
}

export interface UsuarioCreado {
  perfil: Perfil
  email: string
  password: string
}

// Crea la cuenta completa (correo + contraseña) sin pasar por Supabase Studio — la contraseña
// exige el privilegio de service role, que nunca puede llegar al bundle del cliente, así que ese
// paso corre en el Edge Function `admin-create-usuario`. El usuario es
// `<nombreapellido>@carwashsm.com` (el dominio no recibe correo) y la contraseña es desechable:
// se muestra una sola vez y la persona la cambia obligatoriamente en su primer ingreso.
export async function createUsuario(input: CrearUsuarioInput): Promise<UsuarioCreado> {
  const parsed = crearUsuarioInputSchema.parse(input)
  const nombreCompleto = `${parsed.nombre} ${parsed.apellido}`.trim()
  const email = `${normalizaParaEmail(parsed.nombre, parsed.apellido)}@carwashsm.com`
  const password = generarPasswordDesechable()

  const { data, error } = await db.functions.invoke<{ id: string }>('admin-create-usuario', {
    body: { email, password, nombre: nombreCompleto },
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

  const perfil = await updatePerfil(data.id, {
    nombre: nombreCompleto,
    roles: parsed.roles,
    activo: true,
    personaId: parsed.personaId,
  })
  return { perfil, email, password }
}

// Genera una contraseña desechable nueva para una cuenta y marca que debe cambiarla en el próximo
// ingreso. Sin correos — el admin le pasa la contraseña a la persona por fuera del sistema.
export async function resetPassword(userId: string): Promise<{ password: string }> {
  const password = generarPasswordDesechable()
  const { error } = await db.functions.invoke('admin-reset-password', {
    body: { userId, password },
  })
  if (error) {
    const context = (error as { context?: Response }).context
    if (context) {
      const body = await context.json().catch(() => null)
      throw new Error((body as { error?: string } | null)?.error ?? error.message)
    }
    throw new Error(error.message)
  }
  return { password }
}
