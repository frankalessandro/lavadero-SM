import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { PostgrestClient } from '@supabase/postgrest-js'

// Modo local de pruebas (VITE_USE_LOCAL_DB=true): apunta al Postgres/PostgREST del
// docker-compose en vez de Supabase real, para poder sembrar/borrar datos de prueba sin
// afectar KPIs de producción. Ese stack no tiene Auth — ver src/lib/auth.ts para el perfil
// sintético que evita depender de `db.auth` en este modo.
export const USE_LOCAL_DB = import.meta.env.VITE_USE_LOCAL_DB === 'true'

const LOCAL_POSTGREST_URL = import.meta.env.VITE_POSTGREST_URL ?? 'http://localhost:3001'

function createDb() {
  if (USE_LOCAL_DB) {
    // Mismo método `.from(...)` que expone SupabaseClient — es lo único que usa el resto de
    // la app (src/data/*.ts). El cast es seguro porque ningún código corre `db.auth.*` cuando
    // USE_LOCAL_DB está activo (auth.ts y App.tsx lo evitan explícitamente).
    return new PostgrestClient(LOCAL_POSTGREST_URL) as unknown as SupabaseClient
  }

  const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
  const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY no configuradas (ver .env.example)')
  }
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
}

export const db = createDb()
