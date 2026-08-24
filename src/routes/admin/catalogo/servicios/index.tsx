import { useMemo, useState, type FormEvent } from 'react'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { Pencil, Plus, X, Tag, Package, Sparkles } from 'lucide-react'
import { fetchServicios, createServicio, updateServicio, setServicioActivo } from '../../../../data/servicios'
import { fetchPreciosServicioCombo, upsertPrecioServicioCombo } from '../../../../data/preciosServicioCombo'
import { fetchPreciosServicioIndividual, upsertPrecioServicioIndividual } from '../../../../data/preciosServicioIndividual'
import { fetchTiposVehiculo } from '../../../../data/tiposVehiculo'
import { servicioInputSchema, type Servicio } from '../../../../schemas/servicio'
import type { CategoriaVehiculo, TipoVehiculo } from '../../../../schemas/tipoVehiculo'
import type { PrecioServicio } from '../../../../schemas/precioServicio'
import { Card } from '../../../../components/layout/Card'
import { CustomSelect } from '../../../../components/layout/CustomSelect'
import { ConfirmModal } from '../../../../components/layout/ConfirmModal'
import { CurrencyInput } from '../../../../components/layout/CurrencyInput'

const CATEGORIA_LABEL: Record<CategoriaVehiculo, string> = {
  auto: 'Automóviles y camionetas',
  moto: 'Motocicletas',
}

const COP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })

async function loadServiciosPage() {
  const [servicios, tipos, preciosCombo, preciosIndividual] = await Promise.all([
    fetchServicios(),
    fetchTiposVehiculo(),
    fetchPreciosServicioCombo(),
    fetchPreciosServicioIndividual(),
  ])
  return { servicios, tipos, preciosCombo, preciosIndividual }
}

export const Route = createFileRoute('/admin/catalogo/servicios/')({
  loader: loadServiciosPage,
  component: ServiciosPage,
})

function ServiciosPage() {
  const initial = Route.useLoaderData()
  const router = useRouter()
  const [servicios, setServicios] = useState(initial.servicios)
  const [tipos] = useState(initial.tipos)
  const [preciosCombo, setPreciosCombo] = useState(initial.preciosCombo)
  const [preciosIndividual, setPreciosIndividual] = useState(initial.preciosIndividual)
  const [editing, setEditing] = useState<Servicio | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [confirmando, setConfirmando] = useState<Servicio | null>(null)

  async function refresh() {
    const [nuevosServicios, nuevosCombo, nuevosIndividual] = await Promise.all([
      fetchServicios(),
      fetchPreciosServicioCombo(),
      fetchPreciosServicioIndividual(),
    ])
    setServicios(nuevosServicios)
    setPreciosCombo(nuevosCombo)
    setPreciosIndividual(nuevosIndividual)
    router.invalidate()
  }

  async function handleToggleActivo(servicio: Servicio) {
    await setServicioActivo(servicio.id, !servicio.activo)
    await refresh()
  }

  function openCreate() {
    setEditing(null)
    setFormOpen(true)
  }

  function openEdit(servicio: Servicio) {
    setEditing(servicio)
    setFormOpen(true)
  }

  function preciosDeServicio(precios: PrecioServicio[], servicioId: string, categoria: CategoriaVehiculo) {
    return tipos
      .filter((t) => t.categoria === categoria)
      .map((t) => precios.find((p) => p.servicioId === servicioId && p.tipoVehiculoId === t.id))
      .filter((p): p is PrecioServicio => !!p)
  }

  return (
    <div className="flex flex-col gap-6 text-left">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-neutral-900">Servicios</h2>
          <p className="text-sm text-neutral-500">
            Catálogo de servicios individuales (aspirado, brillado, lavado de motor…) — los combos se
            arman eligiendo servicios de aquí. Cada servicio tiene dos precios: el de combo (lo que aporta
            al total cuando va empaquetado) y el individual (cuando se vende solo o suelto encima de un
            combo, normalmente más caro).
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white shadow-nav-active transition-colors hover:bg-primary-700"
        >
          <Plus size={16} />
          Nuevo servicio
        </button>
      </div>

      <Card className="p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-left text-xs font-medium uppercase tracking-wide text-neutral-500">
              <th className="px-5 py-3">Servicio</th>
              <th className="px-5 py-3">Categoría</th>
              <th className="px-5 py-3">Precio de combo</th>
              <th className="px-5 py-3">Precio individual</th>
              <th className="px-5 py-3">Estado</th>
              <th className="px-5 py-3 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {servicios.map((servicio) => (
              <tr key={servicio.id} className="border-b border-neutral-100 transition-colors last:border-0 hover:bg-primary-50/40">
                <td className="px-5 py-3">
                  <p className="font-medium text-neutral-900">{servicio.nombre}</p>
                  {servicio.descripcion ? (
                    <p className="mt-0.5 max-w-xs truncate text-xs text-neutral-500">{servicio.descripcion}</p>
                  ) : null}
                </td>
                <td className="px-5 py-3">
                  <span className="inline-flex rounded-full bg-primary-50 px-2.5 py-1 text-xs font-medium text-primary-700">
                    {CATEGORIA_LABEL[servicio.categoria]}
                  </span>
                </td>
                <td className="px-5 py-3">
                  <div className="flex flex-wrap gap-1">
                    {preciosDeServicio(preciosCombo, servicio.id, servicio.categoria).length === 0 ? (
                      <span className="text-xs text-neutral-400">Sin precios</span>
                    ) : (
                      preciosDeServicio(preciosCombo, servicio.id, servicio.categoria).map((p) => (
                        <span
                          key={p.id}
                          className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-600"
                        >
                          <Tag size={10} />
                          {tipos.find((t) => t.id === p.tipoVehiculoId)?.nombre}: {COP.format(p.precio)}
                        </span>
                      ))
                    )}
                  </div>
                </td>
                <td className="px-5 py-3">
                  <div className="flex flex-wrap gap-1">
                    {preciosDeServicio(preciosIndividual, servicio.id, servicio.categoria).length === 0 ? (
                      <span className="text-xs text-neutral-400">Sin precios</span>
                    ) : (
                      preciosDeServicio(preciosIndividual, servicio.id, servicio.categoria).map((p) => (
                        <span
                          key={p.id}
                          className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-600"
                        >
                          <Tag size={10} />
                          {tipos.find((t) => t.id === p.tipoVehiculoId)?.nombre}: {COP.format(p.precio)}
                        </span>
                      ))
                    )}
                  </div>
                </td>
                <td className="px-5 py-3">
                  <span
                    className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                      servicio.activo ? 'bg-success-50 text-success-700' : 'bg-neutral-100 text-neutral-500'
                    }`}
                  >
                    {servicio.activo ? 'Activo' : 'Inactivo'}
                  </span>
                </td>
                <td className="px-5 py-3">
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => openEdit(servicio)}
                      className="flex size-8 items-center justify-center rounded-lg text-neutral-500 transition-colors hover:bg-primary-100 hover:text-primary-700"
                      aria-label={`Editar ${servicio.nombre}`}
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmando(servicio)}
                      className="rounded-lg px-3 py-1.5 text-xs font-medium text-neutral-600 transition-colors hover:bg-primary-100 hover:text-primary-700"
                    >
                      {servicio.activo ? 'Inactivar' : 'Activar'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {servicios.length === 0 ? (
              <tr>
                <td className="px-5 py-6 text-center text-neutral-400" colSpan={6}>
                  No hay servicios registrados.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </Card>

      {formOpen ? (
        <ServicioForm
          servicio={editing}
          tipos={tipos}
          preciosCombo={preciosCombo}
          preciosIndividual={preciosIndividual}
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
              ? 'Ya no se podrá elegir en combos nuevos ni como servicio individual en recepción — los combos que ya lo incluyen no se ven afectados.'
              : 'Volverá a estar disponible para combos y servicios individuales.'
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

function ServicioForm({
  servicio,
  tipos,
  preciosCombo,
  preciosIndividual,
  onClose,
  onSaved,
}: {
  servicio: Servicio | null
  tipos: TipoVehiculo[]
  preciosCombo: PrecioServicio[]
  preciosIndividual: PrecioServicio[]
  onClose: () => void
  onSaved: () => void
}) {
  const [nombre, setNombre] = useState(servicio?.nombre ?? '')
  const [descripcion, setDescripcion] = useState(servicio?.descripcion ?? '')
  const [categoria, setCategoria] = useState<CategoriaVehiculo>(servicio?.categoria ?? 'auto')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const tiposDeCategoria = useMemo(
    () => tipos.filter((t) => t.categoria === categoria && t.activo),
    [tipos, categoria],
  )

  function preciosIniciales(precios: PrecioServicio[]): Record<string, string> {
    const inicial: Record<string, string> = {}
    if (servicio) {
      for (const tipo of tipos) {
        const existente = precios.find((p) => p.servicioId === servicio.id && p.tipoVehiculoId === tipo.id)
        if (existente) inicial[tipo.id] = String(existente.precio)
      }
    }
    return inicial
  }

  const [precioComboPorTipo, setPrecioComboPorTipo] = useState<Record<string, string>>(() =>
    preciosIniciales(preciosCombo),
  )
  const [precioIndividualPorTipo, setPrecioIndividualPorTipo] = useState<Record<string, string>>(() =>
    preciosIniciales(preciosIndividual),
  )

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const parsed = servicioInputSchema.safeParse({
      nombre,
      categoria,
      descripcion: descripcion || undefined,
    })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Datos inválidos')
      return
    }
    setError(null)
    setSaving(true)
    try {
      const guardado = servicio ? await updateServicio(servicio.id, parsed.data) : await createServicio(parsed.data)

      const escrituras: Promise<PrecioServicio>[] = []
      for (const tipo of tiposDeCategoria) {
        const valorCombo = precioComboPorTipo[tipo.id]?.trim()
        if (valorCombo) {
          const precio = Number(valorCombo)
          if (Number.isFinite(precio) && precio > 0) {
            escrituras.push(upsertPrecioServicioCombo(guardado.id, tipo.id, Math.round(precio)))
          }
        }
        const valorIndividual = precioIndividualPorTipo[tipo.id]?.trim()
        if (valorIndividual) {
          const precio = Number(valorIndividual)
          if (Number.isFinite(precio) && precio > 0) {
            escrituras.push(upsertPrecioServicioIndividual(guardado.id, tipo.id, Math.round(precio)))
          }
        }
      }
      await Promise.all(escrituras)

      onSaved()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-neutral-900/40 p-4 backdrop-blur-[2px]">
      <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-6 shadow-card-hover sm:p-7">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-neutral-900">
              {servicio ? 'Editar servicio' : 'Nuevo servicio'}
            </h3>
            <p className="text-xs text-neutral-500">Nombre, descripción y los dos precios por tipo de vehículo.</p>
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
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-[2fr_1fr]">
            <label className="flex flex-col gap-1.5 text-left text-sm">
              <span className="font-medium text-neutral-700">Nombre</span>
              <input
                autoFocus
                value={nombre}
                onChange={(event) => setNombre(event.target.value)}
                placeholder="p. ej. Brillado"
                className="rounded-lg border border-neutral-300 px-3 py-2.5 text-sm outline-none transition-colors focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
              />
            </label>

            <label className="flex flex-col gap-1.5 text-left text-sm">
              <span className="font-medium text-neutral-700">Categoría</span>
              <CustomSelect
                size="sm"
                value={categoria}
                onChange={(value) => setCategoria(value as CategoriaVehiculo)}
                placeholder="Selecciona…"
                options={[
                  { value: 'auto', label: 'Autos/camionetas' },
                  { value: 'moto', label: 'Motos' },
                ]}
              />
            </label>
          </div>

          <label className="flex flex-col gap-1.5 text-left text-sm">
            <span className="font-medium text-neutral-700">
              Descripción <span className="font-normal text-neutral-400">(opcional)</span>
            </span>
            <textarea
              value={descripcion}
              onChange={(event) => setDescripcion(event.target.value)}
              rows={2}
              placeholder="p. ej. Brillado de carrocería con cera líquida."
              className="resize-none rounded-lg border border-neutral-300 px-3 py-2.5 text-sm outline-none transition-colors focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
            />
          </label>

          <div className="flex flex-col gap-2 rounded-lg border border-neutral-200 p-4">
            <span className="flex items-center gap-1.5 text-sm font-medium text-neutral-700">
              <Package size={14} className="text-primary-500" />
              Precio de combo — {CATEGORIA_LABEL[categoria]}
            </span>
            <p className="text-xs text-neutral-400">
              Lo que aporta este servicio al total cuando va empaquetado dentro de un combo.
            </p>
            <div className="mt-1 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {tiposDeCategoria.map((tipo) => (
                <label key={tipo.id} className="flex flex-col gap-1.5 text-sm">
                  <span className="font-medium text-neutral-700">{tipo.nombre}</span>
                  <CurrencyInput
                    size="sm"
                    value={precioComboPorTipo[tipo.id] ?? ''}
                    onChange={(value) => setPrecioComboPorTipo((prev) => ({ ...prev, [tipo.id]: value }))}
                  />
                </label>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2 rounded-lg border border-neutral-200 p-4">
            <span className="flex items-center gap-1.5 text-sm font-medium text-neutral-700">
              <Sparkles size={14} className="text-primary-500" />
              Precio individual — {CATEGORIA_LABEL[categoria]}
            </span>
            <p className="text-xs text-neutral-400">
              Cuando el cliente pide este servicio solo (sin combo) o suelto encima de un combo —
              normalmente más caro que el precio de combo.
            </p>
            <div className="mt-1 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {tiposDeCategoria.map((tipo) => (
                <label key={tipo.id} className="flex flex-col gap-1.5 text-sm">
                  <span className="font-medium text-neutral-700">{tipo.nombre}</span>
                  <CurrencyInput
                    size="sm"
                    value={precioIndividualPorTipo[tipo.id] ?? ''}
                    onChange={(value) => setPrecioIndividualPorTipo((prev) => ({ ...prev, [tipo.id]: value }))}
                  />
                </label>
              ))}
            </div>
          </div>

          {tiposDeCategoria.length === 0 ? (
            <p className="text-xs text-warning-700">No hay tipos de vehículo activos en esta categoría todavía.</p>
          ) : null}

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
              {saving ? 'Guardando…' : 'Guardar servicio y precios'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
