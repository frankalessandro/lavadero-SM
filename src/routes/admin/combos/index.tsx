import { useMemo, useState, type FormEvent } from 'react'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { Pencil, Plus, X, Tag } from 'lucide-react'
import { fetchCombos, createCombo, updateCombo, setComboActivo } from '../../../data/combos'
import { fetchPrecios, upsertPrecio, findPrecio } from '../../../data/precios'
import { fetchTiposVehiculo } from '../../../data/tiposVehiculo'
import { comboInputSchema, type Combo } from '../../../schemas/combo'
import type { CategoriaVehiculo, TipoVehiculo } from '../../../schemas/tipoVehiculo'
import type { Precio } from '../../../schemas/precio'
import { Card } from '../../../components/layout/Card'
import { CustomSelect } from '../../../components/layout/CustomSelect'

const CATEGORIA_LABEL: Record<CategoriaVehiculo, string> = {
  auto: 'Automóviles y camionetas',
  moto: 'Motocicletas',
}

const COP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })

async function loadCombosPage() {
  const [combos, tipos, precios] = await Promise.all([fetchCombos(), fetchTiposVehiculo(), fetchPrecios()])
  return { combos, tipos, precios }
}

export const Route = createFileRoute('/admin/combos/')({
  loader: loadCombosPage,
  component: CombosPage,
})

function CombosPage() {
  const initial = Route.useLoaderData()
  const router = useRouter()
  const [combos, setCombos] = useState(initial.combos)
  const [tipos] = useState(initial.tipos)
  const [precios, setPrecios] = useState(initial.precios)
  const [editing, setEditing] = useState<Combo | null>(null)
  const [formOpen, setFormOpen] = useState(false)

  async function refresh() {
    const [nuevosCombos, nuevosPrecios] = await Promise.all([fetchCombos(), fetchPrecios()])
    setCombos(nuevosCombos)
    setPrecios(nuevosPrecios)
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

  function preciosDeCombo(comboId: string) {
    const tiposDeCategoria = (categoria: CategoriaVehiculo) => tipos.filter((t) => t.categoria === categoria)
    const combo = combos.find((c) => c.id === comboId)
    if (!combo) return []
    return tiposDeCategoria(combo.categoria)
      .map((t) => findPrecio(precios, comboId, t.id))
      .filter((p): p is Precio => !!p)
  }

  return (
    <div className="flex flex-col gap-6 text-left">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-neutral-900">Combos</h2>
          <p className="text-sm text-neutral-500">
            Catálogo de combos de lavado, con su precio por tipo de vehículo — todo en un solo paso.
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
                </td>
                <td className="px-5 py-3">
                  <div className="flex flex-wrap gap-1">
                    {preciosDeCombo(combo.id).length === 0 ? (
                      <span className="text-xs text-neutral-400">Sin precios</span>
                    ) : (
                      preciosDeCombo(combo.id).map((p) => (
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
                      onClick={() => handleToggleActivo(combo)}
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
          precios={precios}
          onClose={() => setFormOpen(false)}
          onSaved={async () => {
            setFormOpen(false)
            await refresh()
          }}
        />
      ) : null}
    </div>
  )
}

function ComboForm({
  combo,
  tipos,
  precios,
  onClose,
  onSaved,
}: {
  combo: Combo | null
  tipos: TipoVehiculo[]
  precios: Precio[]
  onClose: () => void
  onSaved: () => void
}) {
  const [nombre, setNombre] = useState(combo?.nombre ?? '')
  const [descripcion, setDescripcion] = useState(combo?.descripcion ?? '')
  const [categoria, setCategoria] = useState<CategoriaVehiculo>(combo?.categoria ?? 'auto')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const tiposDeCategoria = useMemo(
    () => tipos.filter((t) => t.categoria === categoria && t.activo),
    [tipos, categoria],
  )

  const [preciosPorTipo, setPreciosPorTipo] = useState<Record<string, string>>(() => {
    const inicial: Record<string, string> = {}
    if (combo) {
      for (const tipo of tipos) {
        const existente = findPrecio(precios, combo.id, tipo.id)
        if (existente) inicial[tipo.id] = String(existente.precio)
      }
    }
    return inicial
  })

  function updatePrecio(tipoId: string, value: string) {
    setPreciosPorTipo((prev) => ({ ...prev, [tipoId]: value }))
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const parsed = comboInputSchema.safeParse({
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
      const guardado = combo ? await updateCombo(combo.id, parsed.data) : await createCombo(parsed.data)

      // Un solo paso: el combo y sus precios por tipo se guardan juntos.
      const escrituras = tiposDeCategoria
        .map((tipo) => {
          const valor = preciosPorTipo[tipo.id]?.trim()
          if (!valor) return null
          const precio = Number(valor)
          if (!Number.isFinite(precio) || precio <= 0) return null
          return upsertPrecio(guardado.id, tipo.id, Math.round(precio))
        })
        .filter((p): p is Promise<Precio> => !!p)
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
              {combo ? 'Editar combo' : 'Nuevo combo'}
            </h3>
            <p className="text-xs text-neutral-500">Nombre, descripción y precio por tipo de vehículo, todo aquí.</p>
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
                placeholder="p. ej. Combo 1 — Lavado y aspirado"
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
              Descripción <span className="font-normal text-neutral-400">(qué incluye)</span>
            </span>
            <textarea
              value={descripcion}
              onChange={(event) => setDescripcion(event.target.value)}
              rows={3}
              placeholder="p. ej. Lavado exterior, aspirado de cabina y baúl, secado a mano."
              className="resize-none rounded-lg border border-neutral-300 px-3 py-2.5 text-sm outline-none transition-colors focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
            />
          </label>

          <div className="flex flex-col gap-2 rounded-lg border border-neutral-200 p-4">
            <span className="flex items-center gap-1.5 text-sm font-medium text-neutral-700">
              <Tag size={14} className="text-primary-500" />
              Precios — {CATEGORIA_LABEL[categoria]}
            </span>
            <p className="text-xs text-neutral-400">
              Déjalo vacío si todavía no tienes el precio para ese tipo — puedes completarlo después
              desde Lista de precios.
            </p>
            <div className="mt-1 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {tiposDeCategoria.map((tipo) => (
                <label key={tipo.id} className="flex flex-col gap-1.5 text-sm">
                  <span className="font-medium text-neutral-700">{tipo.nombre}</span>
                  <div className="flex items-center gap-2 rounded-lg border border-neutral-300 px-3 py-2.5 transition-colors focus-within:border-primary-500 focus-within:ring-1 focus-within:ring-primary-500">
                    <span className="text-neutral-400">$</span>
                    <input
                      type="number"
                      min={0}
                      step={500}
                      inputMode="numeric"
                      value={preciosPorTipo[tipo.id] ?? ''}
                      onChange={(event) => updatePrecio(tipo.id, event.target.value)}
                      placeholder="0"
                      className="w-full bg-transparent text-sm outline-none"
                    />
                  </div>
                </label>
              ))}
              {tiposDeCategoria.length === 0 ? (
                <p className="text-xs text-warning-700">
                  No hay tipos de vehículo activos en esta categoría todavía.
                </p>
              ) : null}
            </div>
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
              {saving ? 'Guardando…' : 'Guardar combo y precios'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
