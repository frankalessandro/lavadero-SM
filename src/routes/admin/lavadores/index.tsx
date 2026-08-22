import { useState, type FormEvent } from 'react'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { Pencil, Plus, X } from 'lucide-react'
import {
  fetchLavadores,
  createLavador,
  updateLavador,
  setLavadorActivo,
} from '../../../data/lavadores'
import { lavadorInputSchema, type Lavador } from '../../../schemas/lavador'
import { Card } from '../../../components/layout/Card'
import { ConfirmModal } from '../../../components/layout/ConfirmModal'

export const Route = createFileRoute('/admin/lavadores/')({
  loader: fetchLavadores,
  component: LavadoresPage,
})

function LavadoresPage() {
  const initial = Route.useLoaderData()
  const router = useRouter()
  const [lavadores, setLavadores] = useState(initial)
  const [editing, setEditing] = useState<Lavador | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [confirmando, setConfirmando] = useState<Lavador | null>(null)

  async function refresh() {
    setLavadores(await fetchLavadores())
    router.invalidate()
  }

  async function handleToggleActivo(lavador: Lavador) {
    await setLavadorActivo(lavador.id, !lavador.activo)
    await refresh()
  }

  function openCreate() {
    setEditing(null)
    setFormOpen(true)
  }

  function openEdit(lavador: Lavador) {
    setEditing(lavador)
    setFormOpen(true)
  }

  return (
    <div className="flex flex-col gap-6 text-left">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-neutral-900">Lavadores</h2>
          <p className="text-sm text-neutral-500">
            Los lavadores nunca se eliminan (regla de negocio 5) — se inactivan para preservar el
            histórico.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white shadow-nav-active transition-colors hover:bg-primary-700"
        >
          <Plus size={16} />
          Nuevo lavador
        </button>
      </div>

      <Card className="p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-left text-xs font-medium uppercase tracking-wide text-neutral-500">
              <th className="px-5 py-3">Nombre</th>
              <th className="px-5 py-3">Contacto</th>
              <th className="px-5 py-3">Ingreso</th>
              <th className="px-5 py-3">Estado</th>
              <th className="px-5 py-3 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {lavadores.map((lavador) => (
              <tr
                key={lavador.id}
                className="border-b border-neutral-100 transition-colors last:border-0 hover:bg-primary-50/40"
              >
                <td className="px-5 py-3 font-medium text-neutral-900">{lavador.nombre}</td>
                <td className="px-5 py-3 text-neutral-600">{lavador.telefono || '—'}</td>
                <td className="px-5 py-3 text-neutral-600">
                  {new Date(lavador.fechaIngreso).toLocaleDateString('es-CO')}
                </td>
                <td className="px-5 py-3">
                  <span
                    className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                      lavador.activo ? 'bg-success-50 text-success-700' : 'bg-neutral-100 text-neutral-500'
                    }`}
                  >
                    {lavador.activo ? 'Activo' : 'Inactivo'}
                  </span>
                </td>
                <td className="px-5 py-3">
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => openEdit(lavador)}
                      className="flex size-8 items-center justify-center rounded-lg text-neutral-500 transition-colors hover:bg-primary-100 hover:text-primary-700"
                      aria-label={`Editar ${lavador.nombre}`}
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmando(lavador)}
                      className="rounded-lg px-3 py-1.5 text-xs font-medium text-neutral-600 transition-colors hover:bg-primary-100 hover:text-primary-700"
                    >
                      {lavador.activo ? 'Inactivar' : 'Activar'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {lavadores.length === 0 ? (
              <tr>
                <td className="px-5 py-6 text-center text-neutral-400" colSpan={5}>
                  No hay lavadores registrados.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </Card>

      {formOpen ? (
        <LavadorForm
          lavador={editing}
          onClose={() => setFormOpen(false)}
          onSaved={async () => {
            setFormOpen(false)
            await refresh()
          }}
        />
      ) : null}

      {confirmando ? (
        <ConfirmModal
          title={confirmando.activo ? `¿Inactivar ${confirmando.nombre}?` : `¿Activar ${confirmando.nombre}?`}
          message={
            confirmando.activo
              ? `Ya no aparecerá disponible en recepción ni en la cola de rotación.`
              : `Volverá a estar disponible en recepción y en la cola de rotación.`
          }
          confirmLabel={confirmando.activo ? 'Inactivar' : 'Activar'}
          variant={confirmando.activo ? 'danger' : 'primary'}
          onConfirm={async () => {
            await handleToggleActivo(confirmando)
            setConfirmando(null)
          }}
          onCancel={() => setConfirmando(null)}
        />
      ) : null}
    </div>
  )
}

function LavadorForm({
  lavador,
  onClose,
  onSaved,
}: {
  lavador: Lavador | null
  onClose: () => void
  onSaved: () => void
}) {
  const [nombre, setNombre] = useState(lavador?.nombre ?? '')
  const [telefono, setTelefono] = useState(lavador?.telefono ?? '')
  const [fechaIngreso, setFechaIngreso] = useState(
    lavador?.fechaIngreso ?? new Date().toISOString().slice(0, 10),
  )
  const [fechaCumpleanos, setFechaCumpleanos] = useState(lavador?.fechaCumpleanos ?? '')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const parsed = lavadorInputSchema.safeParse({
      nombre,
      telefono: telefono || undefined,
      fechaIngreso,
      fechaCumpleanos: fechaCumpleanos || undefined,
    })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Datos inválidos')
      return
    }
    setError(null)
    setSaving(true)
    try {
      if (lavador) {
        await updateLavador(lavador.id, parsed.data)
      } else {
        await createLavador(parsed.data)
      }
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
            <h3 className="text-base font-semibold text-neutral-900">
              {lavador ? 'Editar lavador' : 'Nuevo lavador'}
            </h3>
            <p className="text-xs text-neutral-500">Perfil básico — sin usuario del sistema (Plan §3).</p>
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
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-left text-sm">
              <span className="font-medium text-neutral-700">Nombre</span>
              <input
                autoFocus
                value={nombre}
                onChange={(event) => setNombre(event.target.value)}
                placeholder="p. ej. Andrés Ruiz"
                className="rounded-lg border border-neutral-300 px-3 py-2.5 text-sm outline-none transition-colors focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
              />
            </label>

            <label className="flex flex-col gap-1.5 text-left text-sm">
              <span className="font-medium text-neutral-700">
                Teléfono <span className="font-normal text-neutral-400">(opcional)</span>
              </span>
              <input
                value={telefono}
                onChange={(event) => setTelefono(event.target.value)}
                placeholder="300 123 4567"
                className="rounded-lg border border-neutral-300 px-3 py-2.5 text-sm outline-none transition-colors focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
              />
            </label>
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-left text-sm">
              <span className="font-medium text-neutral-700">Fecha de ingreso</span>
              <input
                type="date"
                value={fechaIngreso}
                onChange={(event) => setFechaIngreso(event.target.value)}
                className="rounded-lg border border-neutral-300 px-3 py-2.5 text-sm outline-none transition-colors focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
              />
            </label>

            <label className="flex flex-col gap-1.5 text-left text-sm">
              <span className="font-medium text-neutral-700">
                Cumpleaños <span className="font-normal text-neutral-400">(opcional)</span>
              </span>
              <input
                type="date"
                value={fechaCumpleanos}
                onChange={(event) => setFechaCumpleanos(event.target.value)}
                className="rounded-lg border border-neutral-300 px-3 py-2.5 text-sm outline-none transition-colors focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
              />
            </label>
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
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
