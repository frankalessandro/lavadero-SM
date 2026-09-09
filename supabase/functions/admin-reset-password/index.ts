// Restablece la contraseña de una cuenta desde /admin/personal/usuarios — sin correos. Corre del
// lado del servidor porque supabase.auth.admin.updateUserById() exige la service role key, que
// nunca puede llegar al bundle del cliente (mismo patrón que admin-create-usuario).
//
// La contraseña desechable la genera el cliente y viaja en el body — es un valor de un solo uso
// que la persona cambia obligatoriamente en su siguiente ingreso (perfiles.debe_cambiar_password).
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

  const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: userData, error: userError } = await callerClient.auth.getUser()
  if (userError || !userData.user) {
    return jsonResponse({ error: 'Sesión inválida' }, 401)
  }

  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  const { data: perfil, error: perfilError } = await adminClient
    .from('perfiles')
    .select('rol_activo, activo')
    .eq('id', userData.user.id)
    .maybeSingle()
  if (perfilError) {
    return jsonResponse({ error: perfilError.message }, 500)
  }
  if (!perfil || perfil.rol_activo !== 'admin' || !perfil.activo) {
    return jsonResponse({ error: 'No autorizado — solo administradores activos pueden restablecer contraseñas' }, 403)
  }

  let body: { userId?: unknown; password?: unknown }
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ error: 'Body inválido' }, 400)
  }

  const userId = typeof body.userId === 'string' ? body.userId.trim() : ''
  const password = typeof body.password === 'string' ? body.password : ''

  if (!userId) return jsonResponse({ error: 'Falta el id del usuario' }, 400)
  if (password.length < 6) return jsonResponse({ error: 'La contraseña debe tener al menos 6 caracteres' }, 400)

  const { error: updateError } = await adminClient.auth.admin.updateUserById(userId, { password })
  if (updateError) {
    return jsonResponse({ error: updateError.message }, 400)
  }

  const { error: flagError } = await adminClient
    .from('perfiles')
    .update({ debe_cambiar_password: true })
    .eq('id', userId)
  if (flagError) {
    return jsonResponse({ error: flagError.message }, 500)
  }

  return jsonResponse({ ok: true }, 200)
})
