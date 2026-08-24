import { useState, type FormEvent } from 'react'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { Pencil, Plus, X } from 'lucide-react'
import {
  fetchTiposVehiculo,
  createTipoVehiculo,
  updateTipoVehiculo,
  setTipoVehiculoActivo,
} from '../../../../data/tiposVehiculo'
import {
  tipoVehiculoInputSchema,
  type CategoriaVehiculo,
  type TipoVehiculo,
} from '../../../../schemas/tipoVehiculo'
import { Card } from '../../../../components/layout/Card'
import { CustomSelect } from '../../../../components/layout/CustomSelect'
import { ConfirmModal } from '../../../../components/layout/ConfirmModal'

const CATEGORIA_LABEL: Record<CategoriaVehiculo, string> = {
  auto: 'Automóviles y camionetas',
  moto: 'Motocicletas',
}

export const Route = createFileRoute('/admin/catalogo/tipos-vehiculo/')({
  loader: fetchTiposVehiculo,
  component: TiposVehiculoPage,
})

function TiposVehiculoPage() {
  const initial = Route.useLoaderData()
  const router = useRouter()
  const [tipos, setTipos] = useState(initial)
  const [editing, setEditing] = useState<TipoVehiculo | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [confirmando, setConfirmando] = useState<TipoVehiculo | null>(null)

  async function refresh() {
    setTipos(await fetchTiposVehiculo())
    router.invalidate()
  }

  async function handleToggleActivo(tipo: TipoVehiculo) {
    await setTipoVehiculoActivo(tipo.id, !tipo.activo)
    await refresh()
  }

  function openCreate() {
    setEditing(null)
    setFormOpen(true)
  }

  function openEdit(tipo: TipoVehiculo) {
    setEditing(tipo)
    setFormOpen(true)
  }

  return (
    <div className="flex flex-col gap-6 text-left">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-neutral-900">Tipos de vehículo</h2>
          <p className="text-sm text-neutral-500">
            Base para la matriz de precios de combos — cada combo se cobra distinto según el tipo.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white shadow-nav-active transition-colors hover:bg-primary-700"
        >
          <Plus size={16} />
          Nuevo tipo
        </button>
      </div>

      <Card className="p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-left text-xs font-medium uppercase tracking-wide text-neutral-500">
              <th className="px-5 py-3">Nombre</th>
              <th className="px-5 py-3">Categoría</th>
              <th className="px-5 py-3">Estado</th>
              <th className="px-5 py-3 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {tipos.map((tipo) => (
              <tr key={tipo.id} className="border-b border-neutral-100 transition-colors last:border-0 hover:bg-primary-50/40">
                <td className="px-5 py-3 font-medium text-neutral-900">{tipo.nombre}</td>
                <td className="px-5 py-3">
                  <span className="inline-flex rounded-full bg-primary-50 px-2.5 py-1 text-xs font-medium text-primary-700">
                    {CATEGORIA_LABEL[tipo.categoria]}
                  </span>
                </td>
                <td className="px-5 py-3">
                  <span
                    className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                      tipo.activo ? 'bg-success-50 text-success-700' : 'bg-neutral-100 text-neutral-500'
                    }`}
                  >
                    {tipo.activo ? 'Activo' : 'Inactivo'}
                  </span>
                </td>
                <td className="px-5 py-3">
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => openEdit(tipo)}
                      className="flex size-8 items-center justify-center rounded-lg text-neutral-500 transition-colors hover:bg-primary-100 hover:text-primary-700"
                      aria-label={`Editar ${tipo.nombre}`}
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmando(tipo)}
                      className="rounded-lg px-3 py-1.5 text-xs font-medium text-neutral-600 transition-colors hover:bg-primary-100 hover:text-primary-700"
                    >
                      {tipo.activo ? 'Inactivar' : 'Activar'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {tipos.length === 0 ? (
              <tr>
                <td className="px-5 py-6 text-center text-neutral-400" colSpan={4}>
                  No hay tipos de vehículo registrados.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </Card>

      {formOpen ? (
        <TipoVehiculoForm
          tipo={editing}
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
              ? `Ya no aparecerá disponible en recepción.`
              : `Volverá a estar disponible en recepción.`
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

function TipoVehiculoForm({
  tipo,
  onClose,
  onSaved,
}: {
  tipo: TipoVehiculo | null
  onClose: () => void
  onSaved: () => void
}) {
  const [nombre, setNombre] = useState(tipo?.nombre ?? '')
  const [categoria, setCategoria] = useState<CategoriaVehiculo>(tipo?.categoria ?? 'auto')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const parsed = tipoVehiculoInputSchema.safeParse({ nombre, categoria })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Datos inválidos')
      return
    }
    setError(null)
    setSaving(true)
    try {
      if (tipo) {
        await updateTipoVehiculo(tipo.id, parsed.data)
      } else {
        await createTipoVehiculo(parsed.data)
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
              {tipo ? 'Editar tipo de vehículo' : 'Nuevo tipo de vehículo'}
            </h3>
            <p className="text-xs text-neutral-500">Base para la matriz de precios de combos.</p>
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
              placeholder="p. ej. Camioneta"
              className="rounded-lg border border-neutral-300 px-3 py-2.5 text-sm outline-none transition-colors focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
            />
          </label>

          <label className="flex flex-col gap-1.5 text-left text-sm">
            <span className="font-medium text-neutral-700">Categoría de combos</span>
            <CustomSelect
              size="sm"
              value={categoria}
              onChange={(value) => setCategoria(value as CategoriaVehiculo)}
              placeholder="Selecciona…"
              options={[
                { value: 'auto', label: CATEGORIA_LABEL.auto },
                { value: 'moto', label: CATEGORIA_LABEL.moto },
              ]}
            />
            <span className="text-xs text-neutral-400">
              Determina qué catálogo de combos aplica a este tipo en recepción — el catálogo de
              autos/camionetas es distinto al de motos (Plan de Alcance §5).
            </span>
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
