import { useState, type FormEvent } from 'react'
import { createFileRoute, redirect, useNavigate, useRouter } from '@tanstack/react-router'
import { Eye, EyeOff } from 'lucide-react'
import { Card } from '../../components/layout/Card'
import { signIn, rutaPostAuth } from '../../lib/auth'
import { fetchPerfilActual } from '../../data/perfiles'
import { db } from '../../lib/db'
import logoMark from '../../assets/logo-mark.png'

export const Route = createFileRoute('/login/')({
  beforeLoad: ({ context }) => {
    if (context.auth?.perfil.activo && context.auth.perfil.roles.length > 0) {
      throw redirect({ to: rutaPostAuth(context.auth.perfil) })
    }
  },
  component: LoginPage,
})

function LoginPage() {
  const router = useRouter()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
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

      if (!perfil || perfil.roles.length === 0 || !perfil.activo) {
        await db.auth.signOut()
        throw new Error(
          !perfil || perfil.roles.length === 0
            ? 'Tu cuenta todavía no tiene un rol asignado. Pídele al administrador que te lo asigne en Personal › Usuarios del sistema.'
            : 'Tu cuenta está inactiva. Contacta al administrador.',
        )
      }

      await router.invalidate()
      await navigate({ to: rutaPostAuth(perfil) })
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
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                className="w-full rounded-lg border border-neutral-300 px-3 py-2.5 pr-10 text-sm outline-none transition-colors focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-neutral-400 transition-colors hover:text-neutral-700"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </label>

          {error ? <p className="rounded-lg bg-danger-50 px-3 py-2.5 text-sm text-danger-700">{error}</p> : null}

          <button
            type="submit"
            disabled={loading}
            className="mt-1 rounded-lg bg-primary-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-700 disabled:opacity-50"
          >
            {loading ? 'Entrando…' : 'Entrar'}
          </button>

          <p className="text-center text-xs text-neutral-400">
            ¿Olvidaste tu contraseña? Pídele a un administrador que te la restablezca.
          </p>
        </form>
      </Card>
    </div>
  )
}
