// Crea una cuenta de Supabase Auth (correo + contraseña) desde /admin/personal/usuarios — corre
// del lado del servidor porque supabase.auth.admin.createUser() exige la service role key, que
// nunca puede llegar al bundle del cliente (ver src/data/perfiles.ts:createUsuario).
//
// No asigna rol/nombre acá: el trigger on_auth_user_created (0011_perfiles.sql) ya crea la fila
// de `perfiles` con rol=null; el frontend llama a updatePerfil() justo después con la sesión
// normal del admin (RLS ya probada), así este archivo se queda mínimo — solo la parte que de
// verdad requiere privilegios de servidor.
import { createClient } from 'jsr:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Método no permitido' }, 405)
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return jsonResponse({ error: 'Falta el header de autorización' }, 401)
  }

  // Cliente con la sesión de quien llama (anon key + su JWT) — solo para identificarlo vía
  // auth.getUser(). No se usa para leer/escribir tablas: eso lo hace el cliente de service role
  // de abajo, que bypassa RLS a propósito para poder verificar el rol sin depender de policies.
  const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: userData, error: userError } = await callerClient.auth.getUser()
  if (userError || !userData.user) {
    return jsonResponse({ error: 'Sesión inválida' }, 401)
  }

  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  // Mismo criterio que la policy RLS es_admin()/es_activo() (0011_perfiles.sql) — repetido acá
  // porque un Edge Function no hereda RLS por sí solo.
  const { data: perfil, error: perfilError } = await adminClient
    .from('perfiles')
    .select('rol, activo')
    .eq('id', userData.user.id)
    .maybeSingle()
  if (perfilError) {
    return jsonResponse({ error: perfilError.message }, 500)
  }
  if (!perfil || perfil.rol !== 'admin' || !perfil.activo) {
    return jsonResponse({ error: 'No autorizado — solo administradores activos pueden crear usuarios' }, 403)
  }

  let body: { email?: unknown; password?: unknown; nombre?: unknown }
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ error: 'Body inválido' }, 400)
  }

  const email = typeof body.email === 'string' ? body.email.trim() : ''
  const password = typeof body.password === 'string' ? body.password : ''
  const nombre = typeof body.nombre === 'string' ? body.nombre.trim() : ''

  if (!email || !email.includes('@')) return jsonResponse({ error: 'Correo inválido' }, 400)
  if (password.length < 6) return jsonResponse({ error: 'La contraseña debe tener al menos 6 caracteres' }, 400)
  if (nombre.length < 2) return jsonResponse({ error: 'El nombre debe tener al menos 2 caracteres' }, 400)

  const { data: created, error: createError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { nombre },
  })
  if (createError) {
    return jsonResponse({ error: createError.message }, 400)
  }

  return jsonResponse({ id: created.user.id }, 200)
})
