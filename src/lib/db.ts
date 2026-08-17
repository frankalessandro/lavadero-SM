import { PostgrestClient } from '@supabase/postgrest-js'

// PostgREST local sobre el Postgres de Docker (ver docker-compose.yml). Cuando el proyecto
// se conecte a Supabase de verdad, esto se reemplaza por la URL de Supabase — el resto del
// código (data/*.ts) no cambia porque `db.from(...)` es la misma API en ambos casos.
const POSTGREST_URL = import.meta.env.VITE_POSTGREST_URL ?? 'http://localhost:3001'

export const db = new PostgrestClient(POSTGREST_URL)
