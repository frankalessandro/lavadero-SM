import { useMemo, useState, type FormEvent } from 'react'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { Package, Droplet, AlertTriangle, PackageSearch, ShoppingBag } from 'lucide-react'
import { fetchTurnoAbierto } from '../../../data/turnos'
import { fetchProductos } from '../../../data/productos'
import {
  fetchStockProductosOperativo,
  fetchMovimientosOperativo,
  createMovimientoOperativo,
} from '../../../data/movimientosInventario'
import { movimientoInventarioInputSchema, type TipoMovimientoInventario } from '../../../schemas/movimientoInventario'
import type { Producto } from '../../../schemas/producto'
import { Card } from '../../../components/layout/Card'
import { StatCard } from '../../../components/layout/StatCard'
import { CustomSelect } from '../../../components/layout/CustomSelect'

async function loadStock() {
  const [turno, productos, stock, movimientos] = await Promise.all([
    fetchTurnoAbierto('jefe_zona'),
    fetchProductos(),
    fetchStockProductosOperativo(),
    fetchMovimientosOperativo(),
  ])
  return { turno, productos, stock, movimientos: movimientos.slice(0, 10) }
}

export const Route = createFileRoute('/jefe-zona/inventario/')({
  loader: loadStock,
  component: StockPage,
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

function StockPage() {
  const data = Route.useLoaderData()
  const router = useRouter()
  const [turno, setTurno] = useState(data.turno)
  const [productos] = useState<Producto[]>(data.productos)
  const [stock, setStock] = useState(data.stock)
  const [movimientos, setMovimientos] = useState(data.movimientos)

  async function refresh() {
    const nuevo = await loadStock()
    setTurno(nuevo.turno)
    setStock(nuevo.stock)
    setMovimientos(nuevo.movimientos)
    router.invalidate()
  }

  const stockPorProducto = useMemo(() => {
    const mapa = new Map<string, number>()
    for (const s of stock) mapa.set(s.productoId, s.stock)
    return mapa
  }, [stock])

  const productoNombre = (id: string) => productos.find((p) => p.id === id)?.nombre ?? '—'

  const productosActivos = productos.filter((p) => p.activo)
  // Un producto sin precio de venta es un insumo de uso interno (jabón, cera, etc. — nunca se le
  // cobra al cliente); con precio de venta es lo que hay en la nevera para vender. Mismo criterio
  // que ya usa /jefe-zona/ventas para decidir qué aparece como vendible — no se agregó una
  // columna de categoría aparte porque este campo ya distingue exactamente eso.
  const insumos = productosActivos.filter((p) => p.precioVenta == null)
  const vendibles = productosActivos.filter((p) => p.precioVenta != null)
  const bajoMinimo = productosActivos.filter((p) => (stockPorProducto.get(p.id) ?? 0) < p.stockMinimo)

  return (
    <div className="flex flex-col gap-6 text-left">
      <p className="px-1 text-sm text-neutral-500">
        Insumos de lavado (jabón, cera, etc.) y productos de nevera para vender — mismo catálogo, registra acá
        el consumo o reposición del día a día. Costos y valorización solo los ve Admin.
      </p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard label="Productos activos" value={String(productosActivos.length)} icon={Package} />
        <StatCard
          label="Bajo stock mínimo"
          value={String(bajoMinimo.length)}
          hint={bajoMinimo.length > 0 ? bajoMinimo.map((p) => p.nombre).join(', ') : undefined}
          icon={AlertTriangle}
        />
      </div>

      <MovimientoForm
        productos={productosActivos}
        responsableSugerido={turno?.responsableActual ?? ''}
        onSaved={refresh}
      />

      <StockTable
        titulo="Insumos de lavado"
        subtitulo="Uso interno — no se venden"
        icono={Droplet}
        accento="border-t-primary-500"
        badgeClass="bg-primary-50 text-primary-700"
        productos={insumos}
        stockPorProducto={stockPorProducto}
        vacio="No hay insumos registrados en Admin › Dinero › Inventario y ventas."
      />

      <StockTable
        titulo="Productos para vender"
        subtitulo="Nevera / mostrador"
        icono={ShoppingBag}
        accento="border-t-warning-500"
        badgeClass="bg-warning-50 text-warning-700"
        productos={vendibles}
        stockPorProducto={stockPorProducto}
        mostrarPrecio
        vacio="No hay productos de nevera registrados en Admin › Dinero › Inventario y ventas."
      />

      <Card className="p-0">
        <div className="border-b border-neutral-100 px-5 py-4">
          <h3 className="text-sm font-semibold text-neutral-900">Movimientos recientes</h3>
        </div>
        <div className="flex flex-col">
          {movimientos.map((m) => (
            <div key={m.id} className="flex items-center justify-between gap-3 border-b border-neutral-100 px-5 py-3 last:border-0">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-neutral-900">{productoNombre(m.productoId)}</p>
                <p className="mt-0.5 truncate text-xs text-neutral-500">
                  {m.motivo ?? '—'} · {m.responsable} · {new Date(m.creadoEn).toLocaleString('es-CO')}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className={`text-sm font-medium ${m.cantidad < 0 ? 'text-danger-600' : 'text-success-700'}`}>
                  {m.cantidad > 0 ? `+${m.cantidad}` : m.cantidad}
                </span>
                <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${TIPO_CLASS[m.tipo]}`}>
                  {TIPO_LABEL[m.tipo]}
                </span>
              </div>
            </div>
          ))}
          {movimientos.length === 0 ? (
            <p className="px-5 py-6 text-center text-sm text-neutral-400">Todavía no hay movimientos registrados.</p>
          ) : null}
        </div>
      </Card>
    </div>
  )
}

function StockTable({
  titulo,
  subtitulo,
  icono: Icono,
  accento,
  badgeClass,
  productos,
  stockPorProducto,
  mostrarPrecio = false,
  vacio,
}: {
  titulo: string
  subtitulo: string
  icono: typeof Package
  accento: string
  badgeClass: string
  productos: Producto[]
  stockPorProducto: Map<string, number>
  mostrarPrecio?: boolean
  vacio: string
}) {
  return (
    <Card className={`overflow-hidden border-t-4 p-0 ${accento}`}>
      <div className="flex items-center gap-3 border-b border-neutral-100 px-5 py-4">
        <span className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${badgeClass}`}>
          <Icono size={16} />
        </span>
        <div>
          <h3 className="text-sm font-semibold text-neutral-900">{titulo}</h3>
          <p className="text-xs text-neutral-500">{subtitulo}</p>
        </div>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-neutral-200 text-left text-xs font-medium uppercase tracking-wide text-neutral-500">
            <th className="px-5 py-3">Producto</th>
            <th className="px-5 py-3">Stock</th>
            <th className="px-5 py-3">Mínimo</th>
            {mostrarPrecio ? <th className="px-5 py-3">Precio</th> : null}
            <th className="px-5 py-3">Estado</th>
          </tr>
        </thead>
        <tbody>
          {productos.map((producto) => {
            const stockActual = stockPorProducto.get(producto.id) ?? 0
            const bajoMin = stockActual < producto.stockMinimo
            return (
              <tr key={producto.id} className="border-b border-neutral-100 last:border-0">
                <td className="px-5 py-3">
                  <p className="font-medium text-neutral-900">{producto.nombre}</p>
                  <p className="text-xs text-neutral-400">{producto.unidadMedida}</p>
                </td>
                <td className={`px-5 py-3 font-medium ${bajoMin ? 'text-danger-600' : 'text-neutral-900'}`}>{stockActual}</td>
                <td className="px-5 py-3 text-neutral-500">{producto.stockMinimo}</td>
                {mostrarPrecio ? (
                  <td className="px-5 py-3 text-neutral-700">
                    {producto.precioVenta != null ? COP.format(producto.precioVenta) : '—'}
                  </td>
                ) : null}
                <td className="px-5 py-3">
                  {bajoMin ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-danger-50 px-2.5 py-1 text-xs font-medium text-danger-700">
                      <AlertTriangle size={11} /> Stock bajo
                    </span>
                  ) : (
                    <span className="text-xs text-neutral-400">—</span>
                  )}
                </td>
              </tr>
            )
          })}
          {productos.length === 0 ? (
            <tr>
              <td className="px-5 py-6 text-center text-neutral-400" colSpan={mostrarPrecio ? 5 : 4}>
                {vacio}
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </Card>
  )
}

function MovimientoForm({
  productos,
  responsableSugerido,
  onSaved,
}: {
  productos: Producto[]
  responsableSugerido: string
  onSaved: () => Promise<void>
}) {
  const [productoId, setProductoId] = useState('')
  const [tipo, setTipo] = useState<TipoMovimientoInventario>('salida')
  const [direccionAjuste, setDireccionAjuste] = useState<'aumento' | 'disminucion'>('aumento')
  const [cantidad, setCantidad] = useState('')
  const [motivo, setMotivo] = useState('')
  const [responsable, setResponsable] = useState(responsableSugerido)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  function reset() {
    setProductoId('')
    setCantidad('')
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
      await createMovimientoOperativo(parsed.data)
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
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-neutral-700">Producto</span>
          <CustomSelect
            value={productoId}
            onChange={setProductoId}
            placeholder="Selecciona…"
            emptyLabel="No hay productos activos"
            options={productos.map((p) => ({ value: p.id, label: `${p.nombre} (${p.unidadMedida})` }))}
          />
        </label>

        <div className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-neutral-700">Tipo</span>
          <div className="grid grid-cols-3 gap-2">
            {(['entrada', 'salida', 'ajuste'] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setTipo(value)}
                className={`rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors ${
                  tipo === value
                    ? 'border-primary-600 bg-primary-50 text-primary-700'
                    : 'border-neutral-200 text-neutral-600 hover:bg-neutral-50'
                }`}
              >
                {TIPO_LABEL[value]}
              </button>
            ))}
          </div>
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

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-neutral-700">Cantidad</span>
          <input
            type="number"
            min={1}
            value={cantidad}
            onChange={(e) => setCantidad(e.target.value)}
            placeholder="0"
            className="rounded-lg border border-neutral-300 px-3 py-3 text-base outline-none transition-colors focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
          />
        </label>

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-neutral-700">
            Motivo {tipo === 'ajuste' ? <span className="text-danger-600">*</span> : <span className="font-normal text-neutral-400">(opcional)</span>}
          </span>
          <input
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder={
              tipo === 'ajuste'
                ? 'Obligatorio — ej. conteo físico, daño, vencimiento'
                : tipo === 'salida'
                  ? 'Ej. consumo del día, se usó en lavado'
                  : 'Ej. reposición de nevera'
            }
            className="rounded-lg border border-neutral-300 px-3 py-3 text-base outline-none transition-colors focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
          />
        </label>

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-neutral-700">Responsable</span>
          <input
            value={responsable}
            onChange={(e) => setResponsable(e.target.value)}
            placeholder="Nombre de quien registra"
            className="rounded-lg border border-neutral-300 px-3 py-3 text-base outline-none transition-colors focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
          />
        </label>

        <p className="text-xs text-neutral-400">
          Este registro no incluye costo ni proveedor — esos datos solo los administra Admin al recibir mercancía
          nueva.
        </p>

        {error ? <p className="text-xs text-danger-600">{error}</p> : null}

        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-primary-600 py-3 text-sm font-semibold text-white shadow-nav-active transition-colors hover:bg-primary-700 disabled:opacity-60"
        >
          {saving ? 'Guardando…' : 'Registrar movimiento'}
        </button>
      </form>
    </Card>
  )
}
