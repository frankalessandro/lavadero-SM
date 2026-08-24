import { useMemo, useState, type FormEvent } from 'react'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { Pencil, Plus, X, Tag } from 'lucide-react'
import { fetchCombos, createCombo, updateCombo, setComboActivo, precioComboCalculado } from '../../../../data/combos'
import { fetchComboServicios, setComboServicios, type ComboServicio } from '../../../../data/comboServicios'
import { fetchServicios } from '../../../../data/servicios'
import { fetchPreciosServicioCombo } from '../../../../data/preciosServicioCombo'
import { fetchPreciosComboFijo, upsertPrecioComboFijo } from '../../../../data/preciosComboFijo'
import { fetchTiposVehiculo } from '../../../../data/tiposVehiculo'
import { comboInputSchema, type Combo } from '../../../../schemas/combo'
import type { CategoriaVehiculo, TipoVehiculo } from '../../../../schemas/tipoVehiculo'
import type { Servicio } from '../../../../schemas/servicio'
import type { PrecioServicio } from '../../../../schemas/precioServicio'
import type { PrecioCombo } from '../../../../schemas/precioCombo'
import { Card } from '../../../../components/layout/Card'
import { CustomSelect } from '../../../../components/layout/CustomSelect'
import { ConfirmModal } from '../../../../components/layout/ConfirmModal'
import { CurrencyInput } from '../../../../components/layout/CurrencyInput'

const CATEGORIA_LABEL: Record<CategoriaVehiculo, string> = {
  auto: 'Automóviles y camionetas',
  moto: 'Motocicletas',
}

const COP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })

async function loadCombosPage() {
  const [combos, tipos, servicios, preciosServicioCombo, preciosComboFijo, comboServicios] = await Promise.all([
    fetchCombos(),
    fetchTiposVehiculo(),
    fetchServicios(),
    fetchPreciosServicioCombo(),
    fetchPreciosComboFijo(),
    fetchComboServicios(),
  ])
  return { combos, tipos, servicios, preciosServicioCombo, preciosComboFijo, comboServicios }
}

export const Route = createFileRoute('/admin/catalogo/combos/')({
  loader: loadCombosPage,
  component: CombosPage,
})

function CombosPage() {
  const initial = Route.useLoaderData()
  const router = useRouter()
  const [combos, setCombos] = useState(initial.combos)
  const [tipos] = useState(initial.tipos)
  const [servicios] = useState(initial.servicios)
  const [preciosServicioCombo, setPreciosServicioCombo] = useState(initial.preciosServicioCombo)
  const [preciosComboFijo, setPreciosComboFijo] = useState(initial.preciosComboFijo)
  const [comboServicios, setComboServiciosState] = useState(initial.comboServicios)
  const [editing, setEditing] = useState<Combo | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [confirmando, setConfirmando] = useState<Combo | null>(null)

  async function refresh() {
    const [nuevosCombos, nuevosPreciosCombo, nuevosPreciosFijo, nuevaRelacion] = await Promise.all([
      fetchCombos(),
      fetchPreciosServicioCombo(),
      fetchPreciosComboFijo(),
      fetchComboServicios(),
    ])
    setCombos(nuevosCombos)
    setPreciosServicioCombo(nuevosPreciosCombo)
    setPreciosComboFijo(nuevosPreciosFijo)
    setComboServiciosState(nuevaRelacion)
    router.invalidate()
  }

  async function handleToggleActivo(combo: Combo) {
    await setComboActivo(combo.id, !combo.activo)
    await refresh()
  }

  function openCreate() {
    setEditing(null)
    setFormOpen(true)
  }

  function openEdit(combo: Combo) {
    setEditing(combo)
    setFormOpen(true)
  }

  function preciosDeCombo(combo: Combo) {
    return tipos
      .filter((t) => t.categoria === combo.categoria)
      .map((tipo) => ({
        tipo,
        precio: precioComboCalculado(combo, tipo.id, comboServicios, preciosServicioCombo, preciosComboFijo),
      }))
      .filter((p): p is { tipo: TipoVehiculo; precio: number } => p.precio !== undefined)
  }

  return (
    <div className="flex flex-col gap-6 text-left">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-neutral-900">Combos</h2>
          <p className="text-sm text-neutral-500">
            Catálogo de combos — el precio se calcula sumando los servicios que incluyen, o se fija a mano
            para combos que funcionan distinto (ej. motos).
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white shadow-nav-active transition-colors hover:bg-primary-700"
        >
          <Plus size={16} />
          Nuevo combo
        </button>
      </div>

      <Card className="p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-left text-xs font-medium uppercase tracking-wide text-neutral-500">
              <th className="px-5 py-3">Combo</th>
              <th className="px-5 py-3">Categoría</th>
              <th className="px-5 py-3">Precios</th>
              <th className="px-5 py-3">Estado</th>
              <th className="px-5 py-3 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {combos.map((combo) => (
              <tr key={combo.id} className="border-b border-neutral-100 transition-colors last:border-0 hover:bg-primary-50/40">
                <td className="px-5 py-3">
                  <p className="font-medium text-neutral-900">{combo.nombre}</p>
                  {combo.descripcion ? (
                    <p className="mt-0.5 max-w-xs truncate text-xs text-neutral-500">{combo.descripcion}</p>
                  ) : null}
                </td>
                <td className="px-5 py-3">
                  <span className="inline-flex rounded-full bg-primary-50 px-2.5 py-1 text-xs font-medium text-primary-700">
                    {CATEGORIA_LABEL[combo.categoria]}
                  </span>
                  {combo.precioFijo ? (
                    <span className="ml-1.5 inline-flex rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-medium text-neutral-600">
                      Precio fijo
                    </span>
                  ) : null}
                </td>
                <td className="px-5 py-3">
                  <div className="flex flex-wrap gap-1">
                    {preciosDeCombo(combo).length === 0 ? (
                      <span className="text-xs text-neutral-400">
                        {combo.precioFijo ? 'Sin precios' : 'Sin servicios asignados'}
                      </span>
                    ) : (
                      preciosDeCombo(combo).map(({ tipo, precio }) => (
                        <span
                          key={tipo.id}
                          className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-600"
                        >
                          <Tag size={10} />
                          {tipo.nombre}: {COP.format(precio)}
                        </span>
                      ))
                    )}
                  </div>
                </td>
                <td className="px-5 py-3">
                  <span
                    className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                      combo.activo ? 'bg-success-50 text-success-700' : 'bg-neutral-100 text-neutral-500'
                    }`}
                  >
                    {combo.activo ? 'Activo' : 'Inactivo'}
                  </span>
                </td>
                <td className="px-5 py-3">
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => openEdit(combo)}
                      className="flex size-8 items-center justify-center rounded-lg text-neutral-500 transition-colors hover:bg-primary-100 hover:text-primary-700"
                      aria-label={`Editar ${combo.nombre}`}
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmando(combo)}
                      className="rounded-lg px-3 py-1.5 text-xs font-medium text-neutral-600 transition-colors hover:bg-primary-100 hover:text-primary-700"
                    >
                      {combo.activo ? 'Inactivar' : 'Activar'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {combos.length === 0 ? (
              <tr>
                <td className="px-5 py-6 text-center text-neutral-400" colSpan={5}>
                  No hay combos registrados.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </Card>

      {formOpen ? (
        <ComboForm
          combo={editing}
          tipos={tipos}
          servicios={servicios}
          preciosServicioCombo={preciosServicioCombo}
          preciosComboFijo={preciosComboFijo}
          comboServicios={comboServicios}
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

function ComboForm({
  combo,
  tipos,
  servicios,
  preciosServicioCombo,
  preciosComboFijo,
  comboServicios,
  onClose,
  onSaved,
}: {
  combo: Combo | null
  tipos: TipoVehiculo[]
  servicios: Servicio[]
  preciosServicioCombo: PrecioServicio[]
  preciosComboFijo: PrecioCombo[]
  comboServicios: ComboServicio[]
  onClose: () => void
  onSaved: () => void
}) {
  const [nombre, setNombre] = useState(combo?.nombre ?? '')
  const [descripcion, setDescripcion] = useState(combo?.descripcion ?? '')
  const [categoria, setCategoria] = useState<CategoriaVehiculo>(combo?.categoria ?? 'auto')
  const [precioFijo, setPrecioFijo] = useState(combo?.precioFijo ?? false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [serviciosSeleccionados, setServiciosSeleccionados] = useState<string[]>(() =>
    combo ? comboServicios.filter((cs) => cs.comboId === combo.id).map((cs) => cs.servicioId) : [],
  )

  const [precioFijoPorTipo, setPrecioFijoPorTipo] = useState<Record<string, string>>(() => {
    const inicial: Record<string, string> = {}
    if (combo) {
      for (const tipo of tipos) {
        const existente = preciosComboFijo.find((p) => p.comboId === combo.id && p.tipoVehiculoId === tipo.id)
        if (existente) inicial[tipo.id] = String(existente.precio)
      }
    }
    return inicial
  })

  const serviciosDeCategoria = useMemo(
    () => servicios.filter((s) => s.categoria === categoria && s.activo),
    [servicios, categoria],
  )

  const tiposDeCategoria = useMemo(
    () => tipos.filter((t) => t.categoria === categoria && t.activo),
    [tipos, categoria],
  )

  function toggleServicio(servicioId: string) {
    setServiciosSeleccionados((prev) =>
      prev.includes(servicioId) ? prev.filter((id) => id !== servicioId) : [...prev, servicioId],
    )
  }

  function precioPreview(tipoId: string): number | undefined {
    let total = 0
    for (const servicioId of serviciosSeleccionados) {
      const precio = preciosServicioCombo.find((p) => p.servicioId === servicioId && p.tipoVehiculoId === tipoId)
      if (!precio) return undefined
      total += precio.precio
    }
    return total
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const parsed = comboInputSchema.safeParse({
      nombre,
      categoria,
      descripcion: descripcion || undefined,
      precioFijo,
    })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Datos inválidos')
      return
    }
    setError(null)
    setSaving(true)
    try {
      const guardado = combo ? await updateCombo(combo.id, parsed.data) : await createCombo(parsed.data)

      if (precioFijo) {
        const escrituras = tiposDeCategoria
          .map((tipo) => {
            const valor = precioFijoPorTipo[tipo.id]?.trim()
            if (!valor) return null
            const precio = Number(valor)
            if (!Number.isFinite(precio) || precio <= 0) return null
            return upsertPrecioComboFijo(guardado.id, tipo.id, Math.round(precio))
          })
          .filter((p): p is Promise<PrecioCombo> => !!p)
        await Promise.all(escrituras)
      } else {
        await setComboServicios(guardado.id, serviciosSeleccionados)
      }

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
              {combo ? 'Editar combo' : 'Nuevo combo'}
            </h3>
            <p className="text-xs text-neutral-500">Nombre, categoría y cómo se calcula su precio.</p>
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
                placeholder="p. ej. Combo 1"
                className="rounded-lg border border-neutral-300 px-3 py-2.5 text-sm outline-none transition-colors focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
              />
            </label>

            <label className="flex flex-col gap-1.5 text-left text-sm">
              <span className="font-medium text-neutral-700">Categoría</span>
              <CustomSelect
                size="sm"
                value={categoria}
                onChange={(value) => {
                  setCategoria(value as CategoriaVehiculo)
                  setServiciosSeleccionados([])
                }}
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
              Descripción <span className="font-normal text-neutral-400">(opcional, texto libre)</span>
            </span>
            <textarea
              value={descripcion}
              onChange={(event) => setDescripcion(event.target.value)}
              rows={2}
              placeholder="p. ej. Nuestro combo más completo."
              className="resize-none rounded-lg border border-neutral-300 px-3 py-2.5 text-sm outline-none transition-colors focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
            />
          </label>

          <div className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-neutral-700">¿Cómo se calcula el precio?</span>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  { value: false, label: 'Suma de servicios' },
                  { value: true, label: 'Precio fijo' },
                ] as const
              ).map(({ value, label }) => (
                <button
                  key={String(value)}
                  type="button"
                  onClick={() => setPrecioFijo(value)}
                  className={`rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors ${
                    precioFijo === value
                      ? 'border-primary-600 bg-primary-50 text-primary-700'
                      : 'border-neutral-200 text-neutral-600 hover:bg-neutral-50'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="text-xs text-neutral-400">
              {precioFijo
                ? 'El precio se escribe a mano por tipo de vehículo — para combos que funcionan distinto (ej. motos), sin armarse a partir de servicios.'
                : 'El precio se calcula solo, sumando los servicios que elijas abajo.'}
            </p>
          </div>

          {precioFijo ? (
            <div className="flex flex-col gap-2 rounded-lg border border-neutral-200 p-4">
              <span className="flex items-center gap-1.5 text-sm font-medium text-neutral-700">
                <Tag size={14} className="text-primary-500" />
                Precio — {CATEGORIA_LABEL[categoria]}
              </span>
              <div className="mt-1 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {tiposDeCategoria.map((tipo) => (
                  <label key={tipo.id} className="flex flex-col gap-1.5 text-sm">
                    <span className="font-medium text-neutral-700">{tipo.nombre}</span>
                    <CurrencyInput
                      size="sm"
                      value={precioFijoPorTipo[tipo.id] ?? ''}
                      onChange={(value) => setPrecioFijoPorTipo((prev) => ({ ...prev, [tipo.id]: value }))}
                    />
                  </label>
                ))}
                {tiposDeCategoria.length === 0 ? (
                  <p className="text-xs text-warning-700">
                    No hay tipos de vehículo activos en esta categoría todavía.
                  </p>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2 rounded-lg border border-neutral-200 p-4">
              <span className="flex items-center gap-1.5 text-sm font-medium text-neutral-700">
                <Tag size={14} className="text-primary-500" />
                Servicios que incluye — {CATEGORIA_LABEL[categoria]}
              </span>
              <p className="text-xs text-neutral-400">Elige los servicios de este combo. El precio se suma solo.</p>
              <div className="mt-1 flex flex-col gap-1.5">
                {serviciosDeCategoria.map((servicio) => (
                  <label
                    key={servicio.id}
                    className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-neutral-50"
                  >
                    <input
                      type="checkbox"
                      checked={serviciosSeleccionados.includes(servicio.id)}
                      onChange={() => toggleServicio(servicio.id)}
                      className="size-4 rounded border-neutral-300 text-primary-600 focus:ring-primary-500"
                    />
                    <span className="text-neutral-700">{servicio.nombre}</span>
                  </label>
                ))}
                {serviciosDeCategoria.length === 0 ? (
                  <p className="text-xs text-warning-700">
                    No hay servicios activos en esta categoría todavía — créalos primero en Servicios.
                  </p>
                ) : null}
              </div>

              {serviciosSeleccionados.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1.5 border-t border-neutral-100 pt-3">
                  {tiposDeCategoria.map((tipo) => {
                    const precio = precioPreview(tipo.id)
                    return (
                      <span
                        key={tipo.id}
                        className="inline-flex items-center gap-1 rounded-full bg-primary-50 px-2.5 py-1 text-xs font-medium text-primary-700"
                      >
                        {tipo.nombre}: {precio !== undefined ? COP.format(precio) : 'falta precio de algún servicio'}
                      </span>
                    )
                  })}
                </div>
              ) : null}
            </div>
          )}

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
              {saving ? 'Guardando…' : 'Guardar combo'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
