import { useState, type FormEvent } from 'react'
import { createFileRoute, redirect, useNavigate, useRouter } from '@tanstack/react-router'
import { Card } from '../../components/layout/Card'
import { signIn, ROL_HOME } from '../../lib/auth'
import { fetchPerfilActual } from '../../data/perfiles'
import { db } from '../../lib/db'
import logoMark from '../../assets/logo-mark.png'

export const Route = createFileRoute('/login/')({
  beforeLoad: ({ context }) => {
    if (context.auth?.perfil.rol && context.auth.perfil.activo) {
      throw redirect({ to: ROL_HOME[context.auth.perfil.rol] })
    }
  },
  component: LoginPage,
})

function LoginPage() {
  const router = useRouter()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await signIn(email, password)

      const { data } = await db.auth.getSession()
      const perfil = data.session ? await fetchPerfilActual(data.session.user.id) : null

      if (!perfil || !perfil.rol || !perfil.activo) {
        await db.auth.signOut()
        throw new Error(
          !perfil || !perfil.rol
            ? 'Tu cuenta todavía no tiene un rol asignado. Pídele al administrador que te lo asigne en /admin/usuarios.'
            : 'Tu cuenta está inactiva. Contacta al administrador.',
        )
      }

      await router.invalidate()
      await navigate({ to: ROL_HOME[perfil.rol] })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo iniciar sesión.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-neutral-50 px-4">
      <Card className="w-full max-w-sm p-6 sm:p-7">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <img src={logoMark} alt="Carwash SM" className="size-16 shrink-0 object-contain" />
          <h1 className="text-lg font-semibold text-neutral-900">Iniciar sesión</h1>
          <p className="text-sm text-neutral-500">Carwash SM — acceso por rol</p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-neutral-700">Correo</span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              className="rounded-lg border border-neutral-300 px-3 py-2.5 text-sm outline-none transition-colors focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-neutral-700">Contraseña</span>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              className="rounded-lg border border-neutral-300 px-3 py-2.5 text-sm outline-none transition-colors focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
            />
          </label>

          {error ? <p className="rounded-lg bg-danger-50 px-3 py-2.5 text-sm text-danger-700">{error}</p> : null}

          <button
            type="submit"
            disabled={loading}
            className="mt-1 rounded-lg bg-primary-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-700 disabled:opacity-50"
          >
            {loading ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
      </Card>
    </div>
  )
}
