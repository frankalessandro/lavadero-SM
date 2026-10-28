import { useRef, useState, type FormEvent } from 'react'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { Car, Pencil, Plus } from 'lucide-react'
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
import { Modal, ModalSeccion } from '../../../../components/layout/Modal'
import { Button } from '../../../../components/layout/Button'
import { CustomSelect } from '../../../../components/layout/CustomSelect'
import { ConfirmModal } from '../../../../components/layout/ConfirmModal'
import { PageHeader } from '../../../../components/layout/PageHeader'
import { toast } from '../../../../lib/toast'

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
      <PageHeader
        title="Tipos de vehículo"
        description={<>Base para la matriz de precios de combos — cada combo se cobra distinto según el tipo.</>}
        actions={
          <>
          <button
            type="button"
            onClick={openCreate}
            className="flex shrink-0 items-center gap-2 rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-medium text-white shadow-nav-active transition-colors hover:bg-primary-700"
          >
            <Plus size={16} />
            Nuevo tipo
          </button>
          </>
        }
      />

      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[32rem] text-sm">
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
          successMessage={confirmando.activo ? 'Tipo de vehículo inactivado' : 'Tipo de vehículo activado'}
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
  const enVueloRef = useRef(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (enVueloRef.current) return
    const parsed = tipoVehiculoInputSchema.safeParse({ nombre, categoria })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Datos inválidos')
      return
    }
    setError(null)
    enVueloRef.current = true
    setSaving(true)
    try {
      if (tipo) {
        await updateTipoVehiculo(tipo.id, parsed.data)
      } else {
        await createTipoVehiculo(parsed.data)
      }
      onSaved()
      toast.exito(tipo ? 'Tipo de vehículo actualizado' : 'Tipo de vehículo creado')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar')
      toast.desdeError(err, 'No se pudo guardar')
    } finally {
      enVueloRef.current = false
      setSaving(false)
    }
  }

  return (
    <Modal
      title={tipo ? 'Editar tipo de vehículo' : 'Nuevo tipo de vehículo'}
      subtitle="Base para la matriz de precios de combos."
      icon={Car}
      onClose={onClose}
      onSubmit={handleSubmit}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" loading={saving}>
            Guardar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <ModalSeccion columnas={2}>
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
          </label>
        </ModalSeccion>
        <p className="rounded-xl bg-neutral-50 px-3 py-2.5 text-xs text-neutral-500">
          La categoría decide qué catálogo de combos aplica a este tipo en recepción: el de autos y camionetas es
          distinto al de motos (Plan de Alcance §5).
        </p>

        {error ? <p className="rounded-lg bg-danger-50 px-3 py-2.5 text-sm text-danger-700">{error}</p> : null}
      </div>
    </Modal>
  )
}
