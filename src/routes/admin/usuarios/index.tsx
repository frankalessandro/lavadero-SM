import { useState, type FormEvent } from 'react'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { Pencil, X } from 'lucide-react'
import { fetchPerfiles, updatePerfil } from '../../../data/perfiles'
import { perfilInputSchema, type Perfil, type Rol } from '../../../schemas/perfil'
import { Card } from '../../../components/layout/Card'
import { CustomSelect } from '../../../components/layout/CustomSelect'

const ROL_LABEL: Record<Rol, string> = {
  admin: 'Administrador',
  jefe_zona: 'Jefe de zona',
  vigilante: 'Vigilante',
}

export const Route = createFileRoute('/admin/usuarios/')({
  loader: fetchPerfiles,
  component: UsuariosPage,
})

function UsuariosPage() {
  const initial = Route.useLoaderData()
  const router = useRouter()
  const [perfiles, setPerfiles] = useState(initial)
  const [editing, setEditing] = useState<Perfil | null>(null)

  async function refresh() {
    setPerfiles(await fetchPerfiles())
    router.invalidate()
  }

  return (
    <div className="flex flex-col gap-6 text-left">
      <div>
        <h2 className="text-base font-semibold text-neutral-900">Usuarios</h2>
        <p className="text-sm text-neutral-500">
          Las cuentas se crean en Supabase Studio (email + contraseña) — acá solo se les asigna
          nombre, rol y si están activas. Sin rol asignado, la cuenta no puede iniciar sesión.
        </p>
      </div>

      <Card className="p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-left text-xs font-medium uppercase tracking-wide text-neutral-500">
              <th className="px-5 py-3">Nombre</th>
              <th className="px-5 py-3">Rol</th>
              <th className="px-5 py-3">Estado</th>
              <th className="px-5 py-3 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {perfiles.map((perfil) => (
              <tr key={perfil.id} className="border-b border-neutral-100 transition-colors last:border-0 hover:bg-primary-50/40">
                <td className="px-5 py-3 font-medium text-neutral-900">{perfil.nombre ?? '—'}</td>
                <td className="px-5 py-3">
                  {perfil.rol ? (
                    <span className="inline-flex rounded-full bg-primary-50 px-2.5 py-1 text-xs font-medium text-primary-700">
                      {ROL_LABEL[perfil.rol]}
                    </span>
                  ) : (
                    <span className="inline-flex rounded-full bg-warning-50 px-2.5 py-1 text-xs font-medium text-warning-700">
                      Pendiente
                    </span>
                  )}
                </td>
                <td className="px-5 py-3">
                  <span
                    className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                      perfil.activo ? 'bg-success-50 text-success-700' : 'bg-neutral-100 text-neutral-500'
                    }`}
                  >
                    {perfil.activo ? 'Activo' : 'Inactivo'}
                  </span>
                </td>
                <td className="px-5 py-3">
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setEditing(perfil)}
                      className="flex size-8 items-center justify-center rounded-lg text-neutral-500 transition-colors hover:bg-primary-100 hover:text-primary-700"
                      aria-label={`Editar ${perfil.nombre ?? 'usuario'}`}
                    >
                      <Pencil size={15} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {perfiles.length === 0 ? (
              <tr>
                <td className="px-5 py-6 text-center text-neutral-400" colSpan={4}>
                  No hay usuarios todavía — créalos en Supabase Studio → Authentication → Users.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </Card>

      {editing ? (
        <PerfilForm
          perfil={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null)
            await refresh()
          }}
        />
      ) : null}
    </div>
  )
}

function PerfilForm({
  perfil,
  onClose,
  onSaved,
}: {
  perfil: Perfil
  onClose: () => void
  onSaved: () => void
}) {
  const [nombre, setNombre] = useState(perfil.nombre ?? '')
  const [rol, setRol] = useState<Rol | ''>(perfil.rol ?? '')
  const [activo, setActivo] = useState(perfil.activo)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const parsed = perfilInputSchema.safeParse({ nombre, rol: rol || undefined, activo })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Datos inválidos')
      return
    }
    setError(null)
    setSaving(true)
    try {
      await updatePerfil(perfil.id, parsed.data)
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-neutral-900/40 p-4 backdrop-blur-[2px]">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-card-hover sm:p-7">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-neutral-900">Editar usuario</h3>
            <p className="text-xs text-neutral-500">Asigna nombre, rol y si la cuenta está activa.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex size-8 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-neutral-100"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <label className="flex flex-col gap-1.5 text-left text-sm">
            <span className="font-medium text-neutral-700">Nombre</span>
            <input
              autoFocus
              value={nombre}
              onChange={(event) => setNombre(event.target.value)}
              placeholder="Nombre completo"
              className="rounded-lg border border-neutral-300 px-3 py-2.5 text-sm outline-none transition-colors focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
            />
          </label>

          <label className="flex flex-col gap-1.5 text-left text-sm">
            <span className="font-medium text-neutral-700">Rol</span>
            <CustomSelect
              size="sm"
              value={rol}
              onChange={(value) => setRol(value as Rol)}
              placeholder="Selecciona un rol…"
              options={[
                { value: 'admin', label: ROL_LABEL.admin },
                { value: 'jefe_zona', label: ROL_LABEL.jefe_zona },
                { value: 'vigilante', label: ROL_LABEL.vigilante },
              ]}
            />
            <span className="text-xs text-neutral-400">
              Sin rol asignado, la cuenta no puede entrar a ninguna pantalla del sistema.
            </span>
          </label>

          <label className="flex items-center gap-2 text-sm text-neutral-700">
            <input
              type="checkbox"
              checked={activo}
              onChange={(event) => setActivo(event.target.checked)}
              className="size-4 rounded border-neutral-300 text-primary-600 focus:ring-primary-500"
            />
            Cuenta activa
          </label>

          {error ? <p className="text-xs text-danger-600">{error}</p> : null}

          <div className="mt-1 flex justify-end gap-2 border-t border-neutral-100 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm font-medium text-neutral-600 transition-colors hover:bg-neutral-100"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white shadow-nav-active transition-colors hover:bg-primary-700 disabled:opacity-60"
            >
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
