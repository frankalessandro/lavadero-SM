import { useMemo, useState, type FormEvent } from 'react'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { Plus, X, Pencil, AlertTriangle, Boxes, PackageSearch, Coins } from 'lucide-react'
import {
  fetchProductos,
  createProducto,
  updateProducto,
  setProductoActivo,
} from '../../../data/productos'
import {
  fetchMovimientos,
  createMovimiento,
  fetchStockProductos,
  type StockProducto,
} from '../../../data/movimientosInventario'
import { productoInputSchema, type Producto } from '../../../schemas/producto'
import {
  movimientoInventarioInputSchema,
  type TipoMovimientoInventario,
} from '../../../schemas/movimientoInventario'
import { Card } from '../../../components/layout/Card'
import { StatCard } from '../../../components/layout/StatCard'
import { CustomSelect } from '../../../components/layout/CustomSelect'
import { ConfirmModal } from '../../../components/layout/ConfirmModal'
import { CurrencyInput } from '../../../components/layout/CurrencyInput'
import { BarChart } from '../../../components/layout/BarChart'
import { CHART_COLORS } from '../../../lib/chartTheme'

async function loadInventario() {
  const [productos, stock, movimientos] = await Promise.all([
    fetchProductos(),
    fetchStockProductos(),
    fetchMovimientos(),
  ])
  return { productos, stock, movimientos: movimientos.slice(0, 15) }
}

export const Route = createFileRoute('/admin/inventario/')({
  loader: loadInventario,
  component: InventarioPage,
})

const COP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })

const TIPO_LABEL: Record<TipoMovimientoInventario, string> = {
  entrada: 'Entrada',
  salida: 'Salida',
  ajuste: 'Ajuste',
}

const TIPO_CLASS: Record<TipoMovimientoInventario, string> = {
  entrada: 'bg-success-50 text-success-700',
  salida: 'bg-warning-50 text-warning-700',
  ajuste: 'bg-primary-50 text-primary-700',
}

function InventarioPage() {
  const data = Route.useLoaderData()
  const router = useRouter()
  const [productos, setProductos] = useState(data.productos)
  const [stock, setStock] = useState(data.stock)
  const [movimientos, setMovimientos] = useState(data.movimientos)
  const [editing, setEditing] = useState<Producto | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [confirmando, setConfirmando] = useState<Producto | null>(null)

  async function refresh() {
    const [nuevosProductos, nuevoStock, nuevosMovimientos] = await Promise.all([
      fetchProductos(),
      fetchStockProductos(),
      fetchMovimientos(),
    ])
    setProductos(nuevosProductos)
    setStock(nuevoStock)
    setMovimientos(nuevosMovimientos.slice(0, 15))
    router.invalidate()
  }

  async function handleToggleActivo(producto: Producto) {
    await setProductoActivo(producto.id, !producto.activo)
    await refresh()
  }

  const stockPorProducto = useMemo(() => {
    const mapa = new Map<string, StockProducto>()
    for (const s of stock) mapa.set(s.productoId, s)
    return mapa
  }, [stock])

  const productoNombre = (id: string) => productos.find((p) => p.id === id)?.nombre ?? '—'

  const productosActivos = productos.filter((p) => p.activo)
  const bajoMinimo = productosActivos.filter((p) => (stockPorProducto.get(p.id)?.stock ?? 0) < p.stockMinimo)
  const valorizacionTotal = stock.reduce((total, s) => total + s.valorizacion, 0)

  return (
    <div className="flex flex-col gap-6 text-left">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-neutral-900">Inventario</h2>
          <p className="text-sm text-neutral-500">Productos e insumos, movimientos manuales y valorización.</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setEditing(null)
            setFormOpen(true)
          }}
          className="flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white shadow-nav-active transition-colors hover:bg-primary-700"
        >
          <Plus size={16} />
          Nuevo producto
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Productos activos" value={String(productosActivos.length)} icon={Boxes} />
        <StatCard
          label="Bajo stock mínimo"
          value={String(bajoMinimo.length)}
          hint={bajoMinimo.length > 0 ? bajoMinimo.map((p) => p.nombre).join(', ') : undefined}
          icon={AlertTriangle}
        />
        <StatCard label="Valorización total" value={COP.format(valorizacionTotal)} hint="Costo promedio de entradas" icon={Coins} />
      </div>

      <MovimientoForm productos={productosActivos} onSaved={refresh} />

      {productosActivos.length > 2 ? (
        <Card className="text-left">
          <h3 className="mb-3 text-sm font-semibold text-neutral-900">Stock actual por producto</h3>
          <BarChart
            labels={productosActivos.map((p) => p.nombre)}
            data={productosActivos.map((p) => stockPorProducto.get(p.id)?.stock ?? 0)}
            colors={productosActivos.map((p) =>
              (stockPorProducto.get(p.id)?.stock ?? 0) < p.stockMinimo ? CHART_COLORS.danger : CHART_COLORS.primary,
            )}
            height={Math.max(120, productosActivos.length * 36)}
          />
        </Card>
      ) : null}

      <Card className="p-0">
        <div className="border-b border-neutral-100 px-5 py-4">
          <h3 className="text-sm font-semibold text-neutral-900">Stock actual</h3>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-left text-xs font-medium uppercase tracking-wide text-neutral-500">
              <th className="px-5 py-3">Producto</th>
              <th className="px-5 py-3">Stock</th>
              <th className="px-5 py-3">Mínimo</th>
              <th className="px-5 py-3">Costo prom.</th>
              <th className="px-5 py-3">Valorización</th>
              <th className="px-5 py-3">Estado</th>
              <th className="px-5 py-3 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {productos.map((producto) => {
              const s = stockPorProducto.get(producto.id)
              const stockActual = s?.stock ?? 0
              const bajoMin = stockActual < producto.stockMinimo
              return (
                <tr key={producto.id} className="border-b border-neutral-100 transition-colors last:border-0 hover:bg-primary-50/40">
                  <td className="px-5 py-3">
                    <p className="font-medium text-neutral-900">{producto.nombre}</p>
                    <p className="text-xs text-neutral-400">{producto.unidadMedida}</p>
                  </td>
                  <td className="px-5 py-3">
                    <span className={`font-medium ${bajoMin ? 'text-danger-600' : 'text-neutral-900'}`}>
                      {stockActual}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-neutral-500">{producto.stockMinimo}</td>
                  <td className="px-5 py-3 text-neutral-700">{COP.format(Math.round(s?.costoPromedio ?? 0))}</td>
                  <td className="px-5 py-3 text-neutral-700">{COP.format(s?.valorizacion ?? 0)}</td>
                  <td className="px-5 py-3">
                    {bajoMin ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-danger-50 px-2.5 py-1 text-xs font-medium text-danger-700">
                        <AlertTriangle size={11} /> Stock bajo
                      </span>
                    ) : (
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                          producto.activo ? 'bg-success-50 text-success-700' : 'bg-neutral-100 text-neutral-500'
                        }`}
                      >
                        {producto.activo ? 'Activo' : 'Inactivo'}
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEditing(producto)
                          setFormOpen(true)
                        }}
                        className="flex size-8 items-center justify-center rounded-lg text-neutral-500 transition-colors hover:bg-primary-100 hover:text-primary-700"
                        aria-label={`Editar ${producto.nombre}`}
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmando(producto)}
                        className="rounded-lg px-3 py-1.5 text-xs font-medium text-neutral-600 transition-colors hover:bg-primary-100 hover:text-primary-700"
                      >
                        {producto.activo ? 'Inactivar' : 'Activar'}
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
            {productos.length === 0 ? (
              <tr>
                <td className="px-5 py-6 text-center text-neutral-400" colSpan={7}>
                  No hay productos registrados.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </Card>

      <Card className="p-0">
        <div className="border-b border-neutral-100 px-5 py-4">
          <h3 className="text-sm font-semibold text-neutral-900">Movimientos recientes</h3>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-left text-xs font-medium uppercase tracking-wide text-neutral-500">
              <th className="px-5 py-3">Fecha</th>
              <th className="px-5 py-3">Producto</th>
              <th className="px-5 py-3">Tipo</th>
              <th className="px-5 py-3">Cantidad</th>
              <th className="px-5 py-3">Motivo / Proveedor</th>
              <th className="px-5 py-3">Responsable</th>
            </tr>
          </thead>
          <tbody>
            {movimientos.map((m) => (
              <tr key={m.id} className="border-b border-neutral-100 transition-colors last:border-0 hover:bg-primary-50/40">
                <td className="px-5 py-3 text-neutral-500">{new Date(m.creadoEn).toLocaleString('es-CO')}</td>
                <td className="px-5 py-3 font-medium text-neutral-900">{productoNombre(m.productoId)}</td>
                <td className="px-5 py-3">
                  <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${TIPO_CLASS[m.tipo]}`}>
                    {TIPO_LABEL[m.tipo]}
                  </span>
                </td>
                <td className={`px-5 py-3 font-medium ${m.cantidad < 0 ? 'text-danger-600' : 'text-success-700'}`}>
                  {m.cantidad > 0 ? `+${m.cantidad}` : m.cantidad}
                </td>
                <td className="px-5 py-3 text-neutral-600">{m.motivo ?? m.proveedor ?? '—'}</td>
                <td className="px-5 py-3 text-neutral-600">{m.responsable}</td>
              </tr>
            ))}
            {movimientos.length === 0 ? (
              <tr>
                <td className="px-5 py-6 text-center text-neutral-400" colSpan={6}>
                  Todavía no hay movimientos registrados.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </Card>

      {formOpen ? (
        <ProductoForm
          producto={editing}
          onClose={() => setFormOpen(false)}
          onSaved={async () => {
            setFormOpen(false)
            await refresh()
          }}
        />
      ) : null}

      {confirmando ? (
        <ConfirmModal
          title={confirmando.activo ? 'Inactivar producto' : 'Activar producto'}
          message={
            confirmando.activo
              ? `¿Inactivar "${confirmando.nombre}"? Ya no aparecerá disponible para nuevos movimientos.`
              : `¿Activar "${confirmando.nombre}"? Volverá a estar disponible para nuevos movimientos.`
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

function MovimientoForm({ productos, onSaved }: { productos: Producto[]; onSaved: () => Promise<void> }) {
  const [productoId, setProductoId] = useState('')
  const [tipo, setTipo] = useState<TipoMovimientoInventario>('entrada')
  const [direccionAjuste, setDireccionAjuste] = useState<'aumento' | 'disminucion'>('aumento')
  const [cantidad, setCantidad] = useState('')
  const [costoUnitario, setCostoUnitario] = useState('')
  const [proveedor, setProveedor] = useState('')
  const [motivo, setMotivo] = useState('')
  const [responsable, setResponsable] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  function reset() {
    setProductoId('')
    setCantidad('')
    setCostoUnitario('')
    setProveedor('')
    setMotivo('')
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const magnitud = Math.abs(Number(cantidad))
    const cantidadConSigno =
      tipo === 'entrada' ? magnitud : tipo === 'salida' ? -magnitud : direccionAjuste === 'aumento' ? magnitud : -magnitud

    const parsed = movimientoInventarioInputSchema.safeParse({
      productoId,
      tipo,
      cantidad: cantidadConSigno,
      costoUnitario: tipo === 'entrada' && costoUnitario ? Number(costoUnitario) : undefined,
      proveedor: tipo === 'entrada' ? proveedor || undefined : undefined,
      motivo: motivo || undefined,
      responsable,
    })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Revisa los datos del formulario')
      return
    }
    setError(null)
    setSaving(true)
    try {
      await createMovimiento(parsed.data)
      reset()
      await onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar el movimiento')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-neutral-900">
        <PackageSearch size={16} className="text-primary-500" />
        Registrar movimiento
      </h3>
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-neutral-700">Producto</span>
            <CustomSelect
              size="sm"
              value={productoId}
              onChange={setProductoId}
              placeholder="Selecciona…"
              emptyLabel="No hay productos activos"
              options={productos.map((p) => ({ value: p.id, label: `${p.nombre} (${p.unidadMedida})` }))}
            />
          </label>

          <div className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-neutral-700">Tipo</span>
            <div className="flex rounded-lg border border-neutral-300 p-1">
              {(['entrada', 'salida', 'ajuste'] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setTipo(value)}
                  className={`flex-1 rounded-md px-2 py-2 text-sm font-medium transition-colors ${
                    tipo === value ? 'bg-primary-600 text-white shadow-nav-active' : 'text-neutral-600 hover:bg-neutral-50'
                  }`}
                >
                  {TIPO_LABEL[value]}
                </button>
              ))}
            </div>
          </div>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-neutral-700">Cantidad</span>
            <input
              type="number"
              min={1}
              value={cantidad}
              onChange={(e) => setCantidad(e.target.value)}
              placeholder="0"
              className="rounded-lg border border-neutral-300 px-3 py-2.5 text-sm outline-none transition-colors focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
            />
          </label>
        </div>

        {tipo === 'ajuste' ? (
          <div className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-neutral-700">Dirección del ajuste</span>
            <div className="grid grid-cols-2 gap-2">
              {(['aumento', 'disminucion'] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setDireccionAjuste(value)}
                  className={`rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors ${
                    direccionAjuste === value
                      ? 'border-primary-600 bg-primary-50 text-primary-700'
                      : 'border-neutral-200 text-neutral-600 hover:bg-neutral-50'
                  }`}
                >
                  {value === 'aumento' ? 'Aumenta stock' : 'Disminuye stock'}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {tipo === 'entrada' ? (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-neutral-700">
                Costo unitario <span className="font-normal text-neutral-400">(opcional)</span>
              </span>
              <CurrencyInput size="sm" prefix="$" value={costoUnitario} onChange={setCostoUnitario} />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-neutral-700">
                Proveedor <span className="font-normal text-neutral-400">(opcional)</span>
              </span>
              <input
                value={proveedor}
                onChange={(e) => setProveedor(e.target.value)}
                placeholder="Nombre del proveedor"
                className="rounded-lg border border-neutral-300 px-3 py-2.5 text-sm outline-none transition-colors focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
              />
            </label>
          </div>
        ) : null}

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-neutral-700">
            Motivo {tipo === 'ajuste' ? <span className="text-danger-600">*</span> : <span className="font-normal text-neutral-400">(opcional)</span>}
          </span>
          <input
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder={tipo === 'ajuste' ? 'Obligatorio — ej. conteo físico, daño, vencimiento' : 'Opcional'}
            className="rounded-lg border border-neutral-300 px-3 py-2.5 text-sm outline-none transition-colors focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
          />
        </label>

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-neutral-700">Responsable</span>
          <input
            value={responsable}
            onChange={(e) => setResponsable(e.target.value)}
            placeholder="Nombre de quien registra"
            className="rounded-lg border border-neutral-300 px-3 py-2.5 text-sm outline-none transition-colors focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
          />
        </label>

        {error ? <p className="text-xs text-danger-600">{error}</p> : null}

        <div className="flex justify-end border-t border-neutral-100 pt-4">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white shadow-nav-active transition-colors hover:bg-primary-700 disabled:opacity-60"
          >
            {saving ? 'Guardando…' : 'Registrar movimiento'}
          </button>
        </div>
      </form>
    </Card>
  )
}

function ProductoForm({
  producto,
  onClose,
  onSaved,
}: {
  producto: Producto | null
  onClose: () => void
  onSaved: () => void
}) {
  const [nombre, setNombre] = useState(producto?.nombre ?? '')
  const [unidadMedida, setUnidadMedida] = useState(producto?.unidadMedida ?? '')
  const [stockMinimo, setStockMinimo] = useState(String(producto?.stockMinimo ?? 0))
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const parsed = productoInputSchema.safeParse({
      nombre,
      unidadMedida,
      stockMinimo: Number(stockMinimo) || 0,
    })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Datos inválidos')
      return
    }
    setError(null)
    setSaving(true)
    try {
      if (producto) {
        await updateProducto(producto.id, parsed.data)
      } else {
        await createProducto(parsed.data)
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
          <h3 className="text-base font-semibold text-neutral-900">
            {producto ? 'Editar producto' : 'Nuevo producto'}
          </h3>
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
              placeholder="p. ej. Jabón para carrocería"
              className="rounded-lg border border-neutral-300 px-3 py-2.5 text-sm outline-none transition-colors focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
            />
          </label>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-left text-sm">
              <span className="font-medium text-neutral-700">Unidad de medida</span>
              <input
                value={unidadMedida}
                onChange={(event) => setUnidadMedida(event.target.value)}
                placeholder="p. ej. galón, unidad, kg"
                className="rounded-lg border border-neutral-300 px-3 py-2.5 text-sm outline-none transition-colors focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-left text-sm">
              <span className="font-medium text-neutral-700">Stock mínimo</span>
              <input
                type="number"
                min={0}
                value={stockMinimo}
                onChange={(event) => setStockMinimo(event.target.value)}
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
