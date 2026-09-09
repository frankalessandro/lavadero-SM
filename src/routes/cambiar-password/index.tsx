import { useState, type FormEvent } from 'react'
import { createFileRoute, redirect } from '@tanstack/react-router'
import { Eye, EyeOff } from 'lucide-react'
import { Card } from '../../components/layout/Card'
import { db, USE_LOCAL_DB } from '../../lib/db'
import { signOut } from '../../lib/auth'
import { marcarPasswordCambiada } from '../../data/perfiles'
import logoMark from '../../assets/logo-mark.png'
import { toast } from '../../lib/toast'

export const Route = createFileRoute('/cambiar-password/')({
  beforeLoad: ({ context }) => {
    if (!context.auth) throw redirect({ to: '/login' })
  },
  component: CambiarPasswordPage,
})

function CambiarPasswordPage() {
  const { auth } = Route.useRouteContext()
  const [password, setPassword] = useState('')
  const [confirmar, setConfirmar] = useState('')
  // Un solo campo visible a la vez: activar el ojo de uno oculta el otro.
  const [visible, setVisible] = useState<'nueva' | 'confirmar' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const obligatorio = auth?.perfil.debeCambiarPassword ?? false

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.')
      return
    }
    if (password !== confirmar) {
      setError('Las contraseñas no coinciden.')
      return
    }
    if (USE_LOCAL_DB) {
      setError('No disponible en modo local (sin Auth).')
      return
    }
    setLoading(true)
    try {
      const { error: updateError } = await db.auth.updateUser({ password })
      if (updateError) throw new Error(updateError.message)
      await marcarPasswordCambiada()
      // Recarga limpia: "/" re-rutea según el perfil ya actualizado (selector de módulo o panel).
      window.location.assign('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cambiar la contraseña.')
      toast.desdeError(err, 'No se pudo cambiar la contraseña.')
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-neutral-50 px-4">
      <Card className="w-full max-w-sm p-6 sm:p-7">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <img src={logoMark} alt="Carwash SM" className="size-16 shrink-0 object-contain" />
          <h1 className="text-lg font-semibold text-neutral-900">Cambia tu contraseña</h1>
          <p className="text-sm text-neutral-500">
            {obligatorio
              ? 'Estás usando una contraseña temporal. Define una propia para continuar.'
              : 'Define una contraseña nueva para tu cuenta.'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-neutral-700">Nueva contraseña</span>
            <div className="relative">
              <input
                type={visible === 'nueva' ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                className="w-full rounded-lg border border-neutral-300 px-3 py-2.5 pr-10 text-sm outline-none transition-colors focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
              />
              <button
                type="button"
                onClick={() => setVisible((v) => (v === 'nueva' ? null : 'nueva'))}
                aria-label={visible === 'nueva' ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-neutral-400 transition-colors hover:text-neutral-700"
              >
                {visible === 'nueva' ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-neutral-700">Confirmar contraseña</span>
            <div className="relative">
              <input
                type={visible === 'confirmar' ? 'text' : 'password'}
                required
                value={confirmar}
                onChange={(e) => setConfirmar(e.target.value)}
                autoComplete="new-password"
                className="w-full rounded-lg border border-neutral-300 px-3 py-2.5 pr-10 text-sm outline-none transition-colors focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
              />
              <button
                type="button"
                onClick={() => setVisible((v) => (v === 'confirmar' ? null : 'confirmar'))}
                aria-label={visible === 'confirmar' ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-neutral-400 transition-colors hover:text-neutral-700"
              >
                {visible === 'confirmar' ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </label>

          {error ? <p className="rounded-lg bg-danger-50 px-3 py-2.5 text-sm text-danger-700">{error}</p> : null}

          <button
            type="submit"
            disabled={loading}
            className="mt-1 rounded-lg bg-primary-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-700 disabled:opacity-50"
          >
            {loading ? 'Guardando…' : 'Guardar contraseña'}
          </button>

          <button
            type="button"
            onClick={() => void signOut().then(() => window.location.assign('/login'))}
            className="text-center text-xs text-neutral-400 transition-colors hover:text-neutral-600"
          >
            Cerrar sesión
          </button>
        </form>
      </Card>
    </div>
  )
}
