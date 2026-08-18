import { useState, type FormEvent } from 'react'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { Plus, Receipt, Settings2, X } from 'lucide-react'
import {
  createCategoriaGasto,
  createGasto,
  fetchCategoriasGasto,
  fetchGastos,
  setCategoriaGastoActivo,
  type GastoConCategoria,
} from '../../../data/gastos'
import { categoriaGastoInputSchema, gastoInputSchema, type CategoriaGasto } from '../../../schemas/gasto'
import { Card } from '../../../components/layout/Card'
import { StatCard } from '../../../components/layout/StatCard'
import { CustomSelect } from '../../../components/layout/CustomSelect'
import { ConfirmModal } from '../../../components/layout/ConfirmModal'
import { CurrencyInput } from '../../../components/layout/CurrencyInput'

function inicioDelMesISO(): string {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
}

function finDelMesISO(): string {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10)
}

function hoyISO(): string {
  return new Date().toISOString().slice(0, 10)
}

const formatoMoneda = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
})

const ORIGEN_OPTIONS = [
  { value: 'caja', label: 'Caja' },
  { value: 'otro', label: 'Otro' },
] as const

async function loadGastosPage() {
  const [categorias, gastos] = await Promise.all([
    fetchCategoriasGasto(),
    fetchGastos(inicioDelMesISO(), finDelMesISO()),
  ])
  return { categorias, gastos }
}

export const Route = createFileRoute('/admin/gastos/')({
  loader: loadGastosPage,
  component: GastosPage,
})

function GastosPage() {
  const initial = Route.useLoaderData()
  const router = useRouter()
  const [categorias, setCategorias] = useState(initial.categorias)
  const [gastos, setGastos] = useState(initial.gastos)
  const [categoriasModalOpen, setCategoriasModalOpen] = useState(false)

  async function refresh() {
    const [nuevasCategorias, nuevosGastos] = await Promise.all([
      fetchCategoriasGasto(),
      fetchGastos(inicioDelMesISO(), finDelMesISO()),
    ])
    setCategorias(nuevasCategorias)
    setGastos(nuevosGastos)
    router.invalidate()
  }

  const totalMes = gastos.reduce((acc, gasto) => acc + gasto.monto, 0)
  const categoriasActivas = categorias.filter((c) => c.activo)

  return (
    <div className="flex flex-col gap-6 text-left">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-neutral-900">Gastos</h2>
          <p className="text-sm text-neutral-500">Registro de gastos operativos y su categorización.</p>
        </div>
        <button
          type="button"
          onClick={() => setCategoriasModalOpen(true)}
          className="flex items-center gap-2 rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
        >
          <Settings2 size={16} />
          Gestionar categorías
        </button>
      </div>

      <StatCard
        label="Total del mes"
        value={formatoMoneda.format(totalMes)}
        hint={`${gastos.length} gasto${gastos.length === 1 ? '' : 's'} registrado${gastos.length === 1 ? '' : 's'}`}
        icon={Receipt}
      />

      <GastoForm categorias={categoriasActivas} onSaved={refresh} />

      <Card className="p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-left text-xs font-medium uppercase tracking-wide text-neutral-500">
              <th className="px-5 py-3">Fecha</th>
              <th className="px-5 py-3">Categoría</th>
              <th className="px-5 py-3">Descripción</th>
              <th className="px-5 py-3">Monto</th>
              <th className="px-5 py-3">Responsable</th>
              <th className="px-5 py-3">Origen</th>
            </tr>
          </thead>
          <tbody>
            {gastos.map((gasto) => (
              <GastoRow key={gasto.id} gasto={gasto} />
            ))}
            {gastos.length === 0 ? (
              <tr>
                <td className="px-5 py-6 text-center text-neutral-400" colSpan={6}>
                  No hay gastos registrados este mes.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </Card>

      {categoriasModalOpen ? (
        <CategoriasModal
          categorias={categorias}
          onClose={() => setCategoriasModalOpen(false)}
          onChanged={refresh}
        />
      ) : null}
    </div>
  )
}

function GastoRow({ gasto }: { gasto: GastoConCategoria }) {
  return (
    <tr className="border-b border-neutral-100 transition-colors last:border-0 hover:bg-primary-50/40">
      <td className="px-5 py-3 text-neutral-700">{gasto.fecha}</td>
      <td className="px-5 py-3 text-neutral-700">{gasto.categoriaNombre}</td>
      <td className="px-5 py-3 font-medium text-neutral-900">{gasto.descripcion}</td>
      <td className="px-5 py-3 text-neutral-700">{formatoMoneda.format(gasto.monto)}</td>
      <td className="px-5 py-3 text-neutral-700">{gasto.responsable}</td>
      <td className="px-5 py-3">
        <span
          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
            gasto.origen === 'caja' ? 'bg-primary-50 text-primary-700' : 'bg-neutral-100 text-neutral-600'
          }`}
        >
          {gasto.origen === 'caja' ? 'Caja' : 'Otro'}
        </span>
      </td>
    </tr>
  )
}

function GastoForm({ categorias, onSaved }: { categorias: CategoriaGasto[]; onSaved: () => Promise<void> }) {
  const [fecha, setFecha] = useState(hoyISO())
  const [categoriaId, setCategoriaId] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [monto, setMonto] = useState('')
  const [responsable, setResponsable] = useState('')
  const [origen, setOrigen] = useState<'caja' | 'otro'>('caja')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  function reset() {
    setFecha(hoyISO())
    setCategoriaId('')
    setDescripcion('')
    setMonto('')
    setResponsable('')
    setOrigen('caja')
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const parsed = gastoInputSchema.safeParse({
      fecha,
      categoriaId,
      descripcion,
      monto: Number(monto),
      responsable,
      origen,
    })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Datos inválidos')
      return
    }
    setError(null)
    setSaving(true)
    try {
      await createGasto(parsed.data)
      reset()
      await onSaved()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <h3 className="mb-4 text-sm font-semibold text-neutral-900">Registrar gasto</h3>
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-neutral-700">Fecha</span>
            <input
              type="date"
              value={fecha}
              onChange={(event) => setFecha(event.target.value)}
              className="rounded-lg border border-neutral-300 px-3 py-2.5 text-sm outline-none transition-colors focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
            />
          </label>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-neutral-700">Categoría</span>
            <CustomSelect
              size="sm"
              value={categoriaId}
              onChange={setCategoriaId}
              options={categorias.map((c) => ({ value: c.id, label: c.nombre }))}
              placeholder="Selecciona una categoría"
              emptyLabel="No hay categorías activas"
            />
          </label>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-neutral-700">Monto</span>
            <CurrencyInput size="sm" prefix="$" value={monto} onChange={setMonto} />
          </label>
        </div>

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-neutral-700">Descripción</span>
          <input
            value={descripcion}
            onChange={(event) => setDescripcion(event.target.value)}
            placeholder="p. ej. Compra de jabón y cera"
            className="rounded-lg border border-neutral-300 px-3 py-2.5 text-sm outline-none transition-colors focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
          />
        </label>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-neutral-700">Responsable</span>
            <input
              value={responsable}
              onChange={(event) => setResponsable(event.target.value)}
              placeholder="Nombre de quien registra"
              className="rounded-lg border border-neutral-300 px-3 py-2.5 text-sm outline-none transition-colors focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
            />
          </label>

          <div className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-neutral-700">Origen</span>
            <div className="flex rounded-lg border border-neutral-300 p-1">
              {ORIGEN_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setOrigen(option.value)}
                  className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                    origen === option.value
                      ? 'bg-primary-600 text-white shadow-nav-active'
                      : 'text-neutral-600 hover:bg-neutral-50'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {error ? <p className="text-xs text-danger-600">{error}</p> : null}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white shadow-nav-active transition-colors hover:bg-primary-700 disabled:opacity-60"
          >
            <Plus size={16} />
            {saving ? 'Guardando…' : 'Registrar gasto'}
          </button>
        </div>
      </form>
    </Card>
  )
}

function CategoriasModal({
  categorias,
  onClose,
  onChanged,
}: {
  categorias: CategoriaGasto[]
  onClose: () => void
  onChanged: () => Promise<void>
}) {
  const [nombre, setNombre] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [confirmando, setConfirmando] = useState<CategoriaGasto | null>(null)

  async function handleCrear(event: FormEvent) {
    event.preventDefault()
    const parsed = categoriaGastoInputSchema.safeParse({ nombre })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Datos inválidos')
      return
    }
    setError(null)
    setSaving(true)
    try {
      await createCategoriaGasto(parsed.data)
      setNombre('')
      await onChanged()
    } finally {
      setSaving(false)
    }
  }

  async function handleToggle(categoria: CategoriaGasto) {
    await setCategoriaGastoActivo(categoria.id, !categoria.activo)
    await onChanged()
  }

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-neutral-900/40 p-4 backdrop-blur-[2px]">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-card-hover sm:p-7">
        <div className="mb-5 flex items-center justify-between">
          <h3 className="text-base font-semibold text-neutral-900">Categorías de gasto</h3>
          <button
            type="button"
            onClick={onClose}
            className="flex size-8 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-neutral-100"
          >
            <X size={18} />
          </button>
        </div>

        <ul className="mb-4 flex max-h-64 flex-col gap-1 overflow-y-auto">
          {categorias.map((categoria) => (
            <li
              key={categoria.id}
              className="flex items-center justify-between gap-2 rounded-lg px-2 py-2 text-sm hover:bg-neutral-50"
            >
              <div className="flex items-center gap-2">
                <span className="font-medium text-neutral-900">{categoria.nombre}</span>
                <span
                  className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                    categoria.activo ? 'bg-success-50 text-success-700' : 'bg-neutral-100 text-neutral-500'
                  }`}
                >
                  {categoria.activo ? 'Activo' : 'Inactivo'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setConfirmando(categoria)}
                className="rounded-lg px-3 py-1.5 text-xs font-medium text-neutral-600 transition-colors hover:bg-primary-100 hover:text-primary-700"
              >
                {categoria.activo ? 'Inactivar' : 'Activar'}
              </button>
            </li>
          ))}
        </ul>

        <form onSubmit={handleCrear} className="flex flex-col gap-3 border-t border-neutral-100 pt-4">
          <label className="flex flex-col gap-1.5 text-left text-sm">
            <span className="font-medium text-neutral-700">Nueva categoría</span>
            <input
              value={nombre}
              onChange={(event) => setNombre(event.target.value)}
              placeholder="p. ej. Publicidad"
              className="rounded-lg border border-neutral-300 px-3 py-2.5 text-sm outline-none transition-colors focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
            />
          </label>
          {error ? <p className="text-xs text-danger-600">{error}</p> : null}
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white shadow-nav-active transition-colors hover:bg-primary-700 disabled:opacity-60"
            >
              {saving ? 'Guardando…' : 'Crear categoría'}
            </button>
          </div>
        </form>
      </div>

      {confirmando ? (
        <ConfirmModal
          title={confirmando.activo ? 'Inactivar categoría' : 'Activar categoría'}
          message={
            confirmando.activo
              ? `¿Inactivar "${confirmando.nombre}"? Ya no aparecerá disponible para nuevos gastos.`
              : `¿Activar "${confirmando.nombre}"? Volverá a estar disponible para nuevos gastos.`
          }
          confirmLabel={confirmando.activo ? 'Inactivar' : 'Activar'}
          variant={confirmando.activo ? 'danger' : 'primary'}
          onConfirm={async () => {
            await handleToggle(confirmando)
            setConfirmando(null)
          }}
          onCancel={() => setConfirmando(null)}
        />
      ) : null}
    </div>
  )
}
