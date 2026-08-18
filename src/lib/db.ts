import { createClient } from '@supabase/supabase-js'

// Supabase real (Auth + Postgres vía PostgREST embebido). `db.from(...)` sigue siendo la
// misma API de @supabase/postgrest-js que antes usaba el PostgrestClient suelto contra el
// Docker local — data/*.ts no cambia. La diferencia real: cada request ahora lleva el JWT
// de la sesión activa, que es lo que activa `auth.uid()` en las políticas RLS.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error('VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY no configuradas (ver .env.example)')
}

export const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
