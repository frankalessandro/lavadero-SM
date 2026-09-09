import { redirect } from '@tanstack/react-router'
import type { Session } from '@supabase/supabase-js'
import { db, USE_LOCAL_DB } from './db'
import { fetchPerfilActual, setRolActivo } from '../data/perfiles'
import type { Perfil } from '../schemas/perfil'
import { ROL_HOME, type Rol } from './roles'

export interface AuthContext {
  session: Session | null
  perfil: Perfil
}

// Pantalla de inicio por rol tras elegir módulo — se re-exporta desde ./roles (fuente única).
export { ROL_HOME } from './roles'

// A dónde mandar a alguien recién autenticado:
//  - debe cambiar la contraseña desechable  -> /cambiar-password
//  - tiene más de un rol                    -> /seleccionar-modulo (siempre, en cada login)
//  - un solo rol (o rol_activo ya fijo)     -> su panel
export function rutaPostAuth(perfil: Perfil): string {
  if (perfil.debeCambiarPassword) return '/cambiar-password'
  if (perfil.roles.length > 1) return '/seleccionar-modulo'
  const rol = perfil.rolActivo ?? perfil.roles[0]
  return rol ? ROL_HOME[rol] : '/login'
}

// Guard de `beforeLoad` para los paneles por rol. `rol` = el que exige el panel.
//  - sin sesión               -> /login
//  - contraseña temporal      -> /cambiar-password
//  - no tiene ese rol / inactivo -> selector (si tiene varios) o /login
//  - tiene varios roles pero el módulo activo no es este -> /seleccionar-modulo
// Con un solo rol no se mira `rolActivo` (evita un bucle si quedara sin fijar); la RLS igual
// depende de que `rol_activo` esté puesto — lo hace updatePerfil al asignar el rol.
export function exigirRol(auth: AuthContext | null, rol: Rol): void {
  if (!auth) throw redirect({ to: '/login' })
  const { perfil } = auth
  if (perfil.debeCambiarPassword) throw redirect({ to: '/cambiar-password' })
  if (!perfil.activo || !perfil.roles.includes(rol)) {
    throw redirect({ to: perfil.roles.length > 1 ? '/seleccionar-modulo' : '/login' })
  }
  if (perfil.roles.length > 1 && perfil.rolActivo !== rol) {
    throw redirect({ to: '/seleccionar-modulo' })
  }
}

// Modo local (ver src/lib/db.ts): no hay Auth real, así que se sintetiza un perfil fijo para
// poder entrar directo por URL a /admin, /jefe-zona o /vigilante sin pasar por /login.
// VITE_LOCAL_ROL fija el rol (default 'admin'); VITE_LOCAL_ROLES (lista separada por comas) permite
// probar el selector de módulo en local.
const LOCAL_ROL: Rol = (import.meta.env.VITE_LOCAL_ROL as Rol | undefined) ?? 'admin'
const LOCAL_ROLES_RAW = (import.meta.env.VITE_LOCAL_ROLES as string | undefined)
  ?.split(',')
  .map((r) => r.trim())
  .filter(Boolean)
const LOCAL_ROLES = (LOCAL_ROLES_RAW && LOCAL_ROLES_RAW.length > 0 ? LOCAL_ROLES_RAW : [LOCAL_ROL]) as Rol[]
const LOCAL_AUTH_CONTEXT: AuthContext = {
  session: null,
  perfil: {
    id: 'local-dev',
    nombre: 'Modo local',
    roles: LOCAL_ROLES,
    rolActivo: LOCAL_ROLES.length === 1 ? LOCAL_ROLES[0] : null,
    activo: true,
    debeCambiarPassword: false,
    personaId: null,
    creadoEn: new Date().toISOString(),
  },
}

// null = sesión resuelta, sin usuario logueado. undefined solo se usa mientras se resuelve
// (ver App en main.tsx) — este módulo nunca devuelve undefined.
export async function resolveAuthContext(): Promise<AuthContext | null> {
  if (USE_LOCAL_DB) return LOCAL_AUTH_CONTEXT

  const { data, error } = await db.auth.getSession()
  if (error || !data.session) return null

  const perfil = await fetchPerfilActual(data.session.user.id)
  if (!perfil) return null

  return { session: data.session, perfil }
}

// Usado por App.tsx para reaccionar a login/logout — no-op en modo local, donde no hay Auth
// real que dispare cambios.
export function subscribeAuthChanges(onChange: () => void): () => void {
  if (USE_LOCAL_DB) return () => {}
  const { data } = db.auth.onAuthStateChange(onChange)
  return () => data.subscription.unsubscribe()
}

export async function signIn(email: string, password: string) {
  if (USE_LOCAL_DB) return
  const { error } = await db.auth.signInWithPassword({ email, password })
  if (error) throw new Error(error.message)
}

export async function signOut() {
  if (USE_LOCAL_DB) return
  // Limpia el módulo activo para que el próximo login vuelva a pasar por el selector (una cuenta
  // multi-rol no debe saltárselo con un bookmark viejo). Best-effort: si falla, igual se cierra.
  await setRolActivo(null).catch(() => {})
  await db.auth.signOut()
}
