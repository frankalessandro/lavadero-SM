import type { Session } from '@supabase/supabase-js'
import { db } from './db'
import { fetchPerfilActual } from '../data/perfiles'
import type { Perfil } from '../schemas/perfil'

export interface AuthContext {
  session: Session
  perfil: Perfil
}

// null = sesión resuelta, sin usuario logueado. undefined solo se usa mientras se resuelve
// (ver App en main.tsx) — este módulo nunca devuelve undefined.
export async function resolveAuthContext(): Promise<AuthContext | null> {
  const { data, error } = await db.auth.getSession()
  if (error || !data.session) return null

  const perfil = await fetchPerfilActual(data.session.user.id)
  if (!perfil) return null

  return { session: data.session, perfil }
}

export async function signIn(email: string, password: string) {
  const { error } = await db.auth.signInWithPassword({ email, password })
  if (error) throw new Error(error.message)
}

export async function signOut() {
  await db.auth.signOut()
}
