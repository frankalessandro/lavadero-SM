import type { Session } from '@supabase/supabase-js'
import { db, USE_LOCAL_DB } from './db'
import { fetchPerfilActual } from '../data/perfiles'
import type { Perfil, Rol } from '../schemas/perfil'

export interface AuthContext {
  session: Session | null
  perfil: Perfil
}

// Pantalla de inicio por rol tras login (o al entrar a "/" ya con sesión) — un solo lugar
// para no duplicar el mapeo entre /login y /.
export const ROL_HOME: Record<Rol, string> = {
  admin: '/admin',
  jefe_zona: '/jefe-zona',
  vigilante: '/vigilante',
}

// Modo local (ver src/lib/db.ts): no hay Auth real, así que se sintetiza un perfil fijo para
// poder entrar directo por URL a /admin, /jefe-zona o /vigilante sin pasar por /login.
// Rol configurable con VITE_LOCAL_ROL (default 'admin', el que más pantallas cubre para probar).
const LOCAL_ROL: Rol = (import.meta.env.VITE_LOCAL_ROL as Rol | undefined) ?? 'admin'
const LOCAL_AUTH_CONTEXT: AuthContext = {
  session: null,
  perfil: { id: 'local-dev', nombre: 'Modo local', rol: LOCAL_ROL, activo: true, creadoEn: new Date().toISOString() },
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
  await db.auth.signOut()
}
