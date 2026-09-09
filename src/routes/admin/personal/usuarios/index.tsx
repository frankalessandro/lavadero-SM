import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { Pencil, X, Plus, UserPlus, KeyRound, Copy, Check, Loader2 } from 'lucide-react'
import {
  fetchPerfiles,
  fetchEmailUsuario,
  updatePerfil,
  createUsuario,
  resetPassword,
  type UsuarioCreado,
} from '../../../../data/perfiles'
import {
  perfilInputSchema,
  crearUsuarioInputSchema,
  ROL_LABEL,
  ROLES,
  type Perfil,
  type Rol,
} from '../../../../schemas/perfil'
import { USE_LOCAL_DB } from '../../../../lib/db'
import { Card } from '../../../../components/layout/Card'
import { ThTexto, ThSelect } from '../../../../components/layout/TableHeadFilter'
import { coincide } from '../../../../lib/tableFilters'
import { toast } from '../../../../lib/toast'

const ESTADO_OPTIONS = [
  { value: 'activo', label: 'Activo' },
  { value: 'inactivo', label: 'Inactivo' },
]

export const Route = createFileRoute('/admin/personal/usuarios/')({
  loader: async () => {
    return { perfiles: await fetchPerfiles() }
  },
  component: UsuariosPage,
})

function UsuariosPage() {
  const initial = Route.useLoaderData()
  const router = useRouter()
  const [perfiles, setPerfiles] = useState(initial.perfiles)
  const [editing, setEditing] = useState<Perfil | null>(null)
  const [creando, setCreando] = useState(false)
  const [reseteando, setReseteando] = useState<Perfil | null>(null)
  const [viendo, setViendo] = useState<Perfil | null>(null)

  const [filtroNombre, setFiltroNombre] = useState('')
  const [filtroRol, setFiltroRol] = useState('')
  const [filtroEstado, setFiltroEstado] = useState('')

  async function refresh() {
    setPerfiles(await fetchPerfiles())
    router.invalidate()
  }

  const visibles = useMemo(
    () =>
      perfiles.filter((p) => {
        if (!coincide(p.nombre, filtroNombre)) return false
        if (filtroRol && !p.roles.includes(filtroRol as Rol)) return false
        if (filtroEstado === 'activo' && !p.activo) return false
        if (filtroEstado === 'inactivo' && p.activo) return false
        return true
      }),
    [perfiles, filtroNombre, filtroRol, filtroEstado],
  )


  return (
    <div className="flex flex-col gap-6 text-left">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-neutral-900">Usuarios del sistema</h2>
          <p className="text-sm text-neutral-500">
            {USE_LOCAL_DB
              ? 'Las cuentas reales (login) solo existen en Supabase — este sandbox local no tiene Auth.'
              : 'Una cuenta por persona, con uno o varios roles. El usuario es nombreapellido@carwashsm.com y la contraseña es desechable: la persona la cambia en su primer ingreso.'}
          </p>
        </div>
        {USE_LOCAL_DB ? null : (
          <button
            type="button"
            onClick={() => setCreando(true)}
            className="flex shrink-0 items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white shadow-nav-active transition-colors hover:bg-primary-700"
          >
            <Plus size={16} />
            Nuevo usuario
          </button>
        )}
      </div>

      <Card className="p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-left text-xs font-medium uppercase tracking-wide text-neutral-500">
              <ThTexto label="Nombre" value={filtroNombre} onChange={setFiltroNombre} placeholder="Buscar…" />
              <ThSelect
                label="Roles"
                value={filtroRol}
                onChange={setFiltroRol}
                options={ROLES.map((r) => ({ value: r.id, label: r.label }))}
              />
              <ThSelect label="Estado" value={filtroEstado} onChange={setFiltroEstado} options={ESTADO_OPTIONS} />
              <th className="px-5 py-3 text-right align-top">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {visibles.map((perfil) => (
              <tr
                key={perfil.id}
                onClick={() => setViendo(perfil)}
                className="cursor-pointer border-b border-neutral-100 transition-colors last:border-0 hover:bg-primary-50/40"
              >
                <td className="px-5 py-3 font-medium text-neutral-900">{perfil.nombre ?? '—'}</td>
                <td className="px-5 py-3">
                  {perfil.roles.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {perfil.roles.map((rol) => (
                        <span
                          key={rol}
                          className="inline-flex rounded-full bg-primary-50 px-2.5 py-1 text-xs font-medium text-primary-700"
                        >
                          {ROL_LABEL[rol]}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="inline-flex rounded-full bg-warning-50 px-2.5 py-1 text-xs font-medium text-warning-700">
                      Pendiente
                    </span>
                  )}
                </td>
                <td className="px-5 py-3">
                  <div className="flex flex-wrap gap-1">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                        perfil.activo ? 'bg-success-50 text-success-700' : 'bg-neutral-100 text-neutral-500'
                      }`}
                    >
                      {perfil.activo ? 'Activo' : 'Inactivo'}
                    </span>
                    {perfil.debeCambiarPassword ? (
                      <span className="inline-flex rounded-full bg-warning-50 px-2.5 py-1 text-xs font-medium text-warning-700">
                        Debe cambiar contraseña
                      </span>
                    ) : null}
                  </div>
                </td>
                <td className="px-5 py-3" onClick={(event) => event.stopPropagation()}>
                  <div className="flex justify-end gap-2">
                    {USE_LOCAL_DB ? null : (
                      <button
                        type="button"
                        onClick={() => setReseteando(perfil)}
                        className="flex size-8 items-center justify-center rounded-lg text-neutral-500 transition-colors hover:bg-primary-100 hover:text-primary-700"
                        aria-label={`Restablecer contraseña de ${perfil.nombre ?? 'usuario'}`}
                        title="Restablecer contraseña"
                      >
                        <KeyRound size={15} />
                      </button>
                    )}
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
            {visibles.length === 0 ? (
              <tr>
                <td className="px-5 py-6 text-center text-neutral-400" colSpan={4}>
                  {perfiles.length === 0 ? 'No hay usuarios todavía.' : 'Ningún usuario coincide con el filtro.'}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </Card>

      <RolesReferencia />

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

      {creando ? (
        <CrearUsuarioForm
          onClose={() => setCreando(false)}
          onSaved={refresh}
        />
      ) : null}

      {reseteando ? (
        <ResetPasswordModal
          perfil={reseteando}
          onClose={() => setReseteando(null)}
          onDone={refresh}
        />
      ) : null}

      {viendo ? <UsuarioDetalleModal perfil={viendo} onClose={() => setViendo(null)} /> : null}
    </div>
  )
}

// Correo + info de la cuenta, sin la contraseña — esa nunca se guarda ni se vuelve a mostrar
// (solo aparece una vez, al crear la cuenta o al restablecerla). El correo se pide bajo demanda
// al abrir el modal (no viaja con `fetchPerfiles()`, ver `fetchEmailUsuario`).
function UsuarioDetalleModal({ perfil, onClose }: { perfil: Perfil; onClose: () => void }) {
  const [email, setEmail] = useState<string | null | 'cargando' | 'error'>('cargando')

  useEffect(() => {
    let vivo = true
    fetchEmailUsuario(perfil.id)
      .then((valor) => {
        if (vivo) setEmail(valor)
      })
      .catch(() => {
        if (vivo) setEmail('error')
      })
    return () => {
      vivo = false
    }
  }, [perfil.id])

  return (
    <ModalShell title={perfil.nombre ?? 'Usuario'} subtitle="Detalle de la cuenta." onClose={onClose}>
      <div className="flex flex-col gap-3">
        {email === 'cargando' ? (
          <div className="flex items-center justify-between gap-3 rounded-lg bg-neutral-50 px-3 py-2">
            <div className="min-w-0">
              <p className="text-xs text-neutral-500">Correo</p>
              <p className="text-sm text-neutral-400">Cargando…</p>
            </div>
            <Loader2 size={15} className="shrink-0 animate-spin text-neutral-400" />
          </div>
        ) : email === 'error' ? (
          <p className="rounded-lg bg-danger-50 px-3 py-2 text-xs text-danger-700">No se pudo cargar el correo.</p>
        ) : (
          <CredencialFila label="Correo" valor={email ?? '—'} />
        )}

        <div className="flex flex-col gap-1.5 rounded-lg bg-neutral-50 px-3 py-2 text-left text-sm">
          <span className="text-xs text-neutral-500">Roles</span>
          {perfil.roles.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {perfil.roles.map((rol) => (
                <span
                  key={rol}
                  className="inline-flex rounded-full bg-primary-50 px-2.5 py-1 text-xs font-medium text-primary-700"
                >
                  {ROL_LABEL[rol]}
                </span>
              ))}
            </div>
          ) : (
            <span className="text-sm text-neutral-400">Sin roles asignados</span>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5">
          <span
            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
              perfil.activo ? 'bg-success-50 text-success-700' : 'bg-neutral-100 text-neutral-500'
            }`}
          >
            {perfil.activo ? 'Activo' : 'Inactivo'}
          </span>
          {perfil.debeCambiarPassword ? (
            <span className="inline-flex rounded-full bg-warning-50 px-2.5 py-1 text-xs font-medium text-warning-700">
              Debe cambiar contraseña
            </span>
          ) : null}
        </div>

        <p className="text-xs text-neutral-400">
          Cuenta creada el {new Date(perfil.creadoEn).toLocaleDateString('es-CO', { dateStyle: 'long' })}.
        </p>

        <div className="mt-1 flex justify-end border-t border-neutral-100 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white shadow-nav-active transition-colors hover:bg-primary-700"
          >
            Cerrar
          </button>
        </div>
      </div>
    </ModalShell>
  )
}

// Referencia estática — los 3 roles vienen de src/lib/roles.ts, espejados por el `check` de
// `perfiles` y por las ~78 políticas RLS. No son cuentas ni son editables desde acá (agregar
// un rol es un cambio de código + migración). "Gerencia" se guarda como el rol `admin`.
function RolesReferencia() {
  return (
    <Card className="p-0">
      <div className="border-b border-neutral-200 px-5 py-4">
        <h3 className="text-base font-semibold text-neutral-900">Roles del sistema</h3>
        <p className="text-sm text-neutral-500">
          Fijos: son 3 y no se editan. Un rol no es una cuenta — se asigna a los usuarios de arriba.
        </p>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-neutral-200 text-left text-xs font-medium uppercase tracking-wide text-neutral-500">
            <th className="px-5 py-3">Rol</th>
            <th className="px-5 py-3">Qué ve y puede</th>
          </tr>
        </thead>
        <tbody>
          {ROLES.map((rol) => (
            <tr key={rol.id} className="border-b border-neutral-100 last:border-0">
              <td className="px-5 py-3 align-top">
                <span className="inline-flex rounded-full bg-primary-50 px-2.5 py-1 text-xs font-medium text-primary-700">
                  {rol.label}
                </span>
              </td>
              <td className="px-5 py-3 text-neutral-600">{rol.acceso}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  )
}

function RolesCheckboxes({ value, onChange }: { value: Rol[]; onChange: (roles: Rol[]) => void }) {
  function toggle(rol: Rol) {
    onChange(value.includes(rol) ? value.filter((r) => r !== rol) : [...value, rol])
  }
  return (
    <div className="flex flex-col gap-2">
      {ROLES.map(({ id }) => (
        <label key={id} className="flex items-center gap-2 text-sm text-neutral-700">
          <input
            type="checkbox"
            checked={value.includes(id)}
            onChange={() => toggle(id)}
            className="size-4 rounded border-neutral-300 text-primary-600 focus:ring-primary-500"
          />
          {ROL_LABEL[id]}
        </label>
      ))}
    </div>
  )
}

function CredencialFila({ label, valor }: { label: string; valor: string }) {
  const [copiado, setCopiado] = useState(false)
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-neutral-50 px-3 py-2">
      <div className="min-w-0">
        <p className="text-xs text-neutral-500">{label}</p>
        <p className="truncate font-mono text-sm text-neutral-900">{valor}</p>
      </div>
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard?.writeText(valor)
          setCopiado(true)
          setTimeout(() => setCopiado(false), 1500)
        }}
        className="flex size-8 shrink-0 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-neutral-200 hover:text-neutral-700"
        aria-label={`Copiar ${label}`}
      >
        {copiado ? <Check size={15} className="text-success-600" /> : <Copy size={15} />}
      </button>
    </div>
  )
}

function ModalShell({ title, subtitle, icon, onClose, children }: {
  title: string
  subtitle?: string
  icon?: ReactNode
  onClose: () => void
  children: ReactNode
}) {
  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-neutral-900/40 p-4 backdrop-blur-[2px]">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-card-hover sm:p-7">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h3 className="flex items-center gap-2 text-base font-semibold text-neutral-900">
              {icon}
              {title}
            </h3>
            {subtitle ? <p className="text-xs text-neutral-500">{subtitle}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex size-8 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-neutral-100"
          >
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

function CrearUsuarioForm({
  onClose,
  onSaved,
}: {
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  const [nombre, setNombre] = useState('')
  const [apellido, setApellido] = useState('')
  const [roles, setRoles] = useState<Rol[]>([])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [creado, setCreado] = useState<UsuarioCreado | null>(null)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const parsed = crearUsuarioInputSchema.safeParse({
      nombre,
      apellido,
      roles,
    })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Datos inválidos')
      return
    }
    setError(null)
    setSaving(true)
    try {
      setCreado(await createUsuario(parsed.data))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear el usuario')
      toast.desdeError(err, 'No se pudo crear el usuario')
    } finally {
      setSaving(false)
    }
  }

  if (creado) {
    return (
      <ModalShell
        title="Usuario creado"
        subtitle="Estas credenciales no se vuelven a mostrar — pásalas a la persona ahora."
        icon={<UserPlus size={17} className="text-primary-500" />}
        onClose={() => void onSaved().then(onClose)}
      >
        <div className="flex flex-col gap-3">
          <CredencialFila label="Usuario" valor={creado.email} />
          <CredencialFila label="Contraseña temporal" valor={creado.password} />
          <p className="text-xs text-neutral-500">
            La persona deberá cambiar esta contraseña en su primer ingreso.
          </p>
          <div className="mt-1 flex justify-end border-t border-neutral-100 pt-4">
            <button
              type="button"
              onClick={() => void onSaved().then(onClose)}
              className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white shadow-nav-active transition-colors hover:bg-primary-700"
            >
              Listo
            </button>
          </div>
        </div>
      </ModalShell>
    )
  }

  return (
    <ModalShell
      title="Nuevo usuario"
      subtitle="El usuario y la contraseña temporal se generan solos."
      icon={<UserPlus size={17} className="text-primary-500" />}
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-left text-sm">
            <span className="font-medium text-neutral-700">Nombre</span>
            <input
              autoFocus
              value={nombre}
              onChange={(event) => setNombre(event.target.value)}
              className="rounded-lg border border-neutral-300 px-3 py-2.5 text-sm outline-none transition-colors focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-left text-sm">
            <span className="font-medium text-neutral-700">Apellido</span>
            <input
              value={apellido}
              onChange={(event) => setApellido(event.target.value)}
              className="rounded-lg border border-neutral-300 px-3 py-2.5 text-sm outline-none transition-colors focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
            />
          </label>
        </div>

        {nombre.trim() && apellido.trim() ? (
          <p className="-mt-2 text-xs text-neutral-400">
            Usuario: <span className="font-mono text-neutral-600">{`${soloAlfanum(nombre)}${soloAlfanum(apellido)}@carwashsm.com`}</span>
          </p>
        ) : null}

        <div className="flex flex-col gap-1.5 text-left text-sm">
          <span className="font-medium text-neutral-700">Roles</span>
          <RolesCheckboxes value={roles} onChange={setRoles} />
        </div>

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
            {saving ? 'Creando…' : 'Crear usuario'}
          </button>
        </div>
      </form>
    </ModalShell>
  )
}

function soloAlfanum(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
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
  const [roles, setRoles] = useState<Rol[]>(perfil.roles)
  const [activo, setActivo] = useState(perfil.activo)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const parsed = perfilInputSchema.safeParse({
      nombre,
      roles,
      activo,
    })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Datos inválidos')
      return
    }
    setError(null)
    setSaving(true)
    try {
      await updatePerfil(perfil.id, parsed.data)
      onSaved()
      toast.exito('Usuario actualizado')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar')
      toast.desdeError(err, 'No se pudo guardar')
      setSaving(false)
    }
  }

  return (
    <ModalShell title="Editar usuario" subtitle="Nombre, roles y estado de la cuenta." onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <label className="flex flex-col gap-1.5 text-left text-sm">
          <span className="font-medium text-neutral-700">Nombre</span>
          <input
            autoFocus
            value={nombre}
            onChange={(event) => setNombre(event.target.value)}
            placeholder="Nombre y apellido"
            className="rounded-lg border border-neutral-300 px-3 py-2.5 text-sm outline-none transition-colors focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
          />
        </label>

        <div className="flex flex-col gap-1.5 text-left text-sm">
          <span className="font-medium text-neutral-700">Roles</span>
          <RolesCheckboxes value={roles} onChange={setRoles} />
          <span className="text-xs text-neutral-400">
            Sin roles, la cuenta no puede entrar. Con más de uno, la persona elige el módulo tras iniciar sesión.
          </span>
        </div>

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
    </ModalShell>
  )
}

function ResetPasswordModal({
  perfil,
  onClose,
  onDone,
}: {
  perfil: Perfil
  onClose: () => void
  onDone: () => Promise<void>
}) {
  const [password, setPassword] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [working, setWorking] = useState(false)

  async function confirmar() {
    setWorking(true)
    setError(null)
    try {
      const { password: nueva } = await resetPassword(perfil.id)
      setPassword(nueva)
      await onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo restablecer la contraseña')
      toast.desdeError(err, 'No se pudo restablecer la contraseña')
    } finally {
      setWorking(false)
    }
  }

  return (
    <ModalShell
      title={password ? 'Contraseña restablecida' : '¿Restablecer contraseña?'}
      subtitle={
        password
          ? 'No se vuelve a mostrar — pásala a la persona ahora.'
          : `Se generará una contraseña temporal nueva para ${perfil.nombre ?? 'esta cuenta'}. La actual dejará de funcionar.`
      }
      icon={<KeyRound size={17} className="text-primary-500" />}
      onClose={onClose}
    >
      <div className="flex flex-col gap-3">
        {password ? (
          <>
            <CredencialFila label={`Contraseña temporal de ${perfil.nombre ?? 'la cuenta'}`} valor={password} />
            <p className="text-xs text-neutral-500">Deberá cambiarla en su siguiente ingreso.</p>
          </>
        ) : null}

        {error ? <p className="text-xs text-danger-600">{error}</p> : null}

        <div className="mt-1 flex justify-end gap-2 border-t border-neutral-100 pt-4">
          {password ? (
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white shadow-nav-active transition-colors hover:bg-primary-700"
            >
              Listo
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg px-4 py-2 text-sm font-medium text-neutral-600 transition-colors hover:bg-neutral-100"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void confirmar()}
                disabled={working}
                className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white shadow-nav-active transition-colors hover:bg-primary-700 disabled:opacity-60"
              >
                {working ? 'Generando…' : 'Restablecer'}
              </button>
            </>
          )}
        </div>
      </div>
    </ModalShell>
  )
}
