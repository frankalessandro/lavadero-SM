import { useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { Package, Droplet, AlertTriangle, PackageSearch, ShoppingBag, X } from 'lucide-react'
import { fetchTurnoAbierto } from '../../../data/turnos'
import { fetchProductosOperativo } from '../../../data/productos'
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
import { nivelStock, ordenarPorNivelStock, NIVEL_LABEL, NIVEL_BADGE_CLASS, STOCK_BAJO_MAX, STOCK_MEDIO_MAX } from '../../../lib/nivelStock'

// Hoja inferior en móvil, centrada en desktop — mismo patrón que src/routes/vigilante/index.tsx,
// es la convención del repo para formularios modales nuevos en pantallas operativas mobile-first.
function ModalSheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center bg-neutral-900/40 backdrop-blur-[2px] sm:items-center sm:p-4">
      <div className="custom-scroll max-h-[90vh] w-full max-w-sm overflow-y-auto rounded-t-2xl bg-white p-5 shadow-card-hover sm:rounded-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-neutral-900">{title}</h3>
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

async function loadStock() {
  const [turno, productos, stock, movimientos] = await Promise.all([
    fetchTurnoAbierto('jefe_zona'),
    fetchProductosOperativo(),
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
  const [movimientoFormOpen, setMovimientoFormOpen] = useState(false)

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
  const insumos = ordenarPorNivelStock(
    productosActivos.filter((p) => p.precioVenta == null),
    (p) => stockPorProducto.get(p.id) ?? 0,
  )
  const vendibles = ordenarPorNivelStock(
    productosActivos.filter((p) => p.precioVenta != null),
    (p) => stockPorProducto.get(p.id) ?? 0,
  )
  const porNivel = {
    bajo: productosActivos.filter((p) => nivelStock(stockPorProducto.get(p.id) ?? 0) === 'bajo'),
    medio: productosActivos.filter((p) => nivelStock(stockPorProducto.get(p.id) ?? 0) === 'medio'),
    bueno: productosActivos.filter((p) => nivelStock(stockPorProducto.get(p.id) ?? 0) === 'bueno'),
  }

  return (
    <div className="flex flex-col gap-6 text-left">
      <div className="flex items-start justify-between gap-3 px-1">
        <p className="text-sm text-neutral-500">
          Insumos de lavado (jabón, cera, etc.) y productos de nevera para vender — mismo catálogo, registra acá
          el consumo o reposición del día a día. Costos y valorización solo los ve Admin.
        </p>
        <button
          type="button"
          onClick={() => setMovimientoFormOpen(true)}
          className="flex shrink-0 items-center gap-2 rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-medium text-white shadow-nav-active transition-colors hover:bg-primary-700"
        >
          <PackageSearch size={16} />
          Movimiento
        </button>
      </div>

      <StatCard label="Productos activos" value={String(productosActivos.length)} icon={Package} />

      <div className="grid grid-cols-3 gap-3">
        {(
          [
            { nivel: 'bajo' as const, hint: `≤ ${STOCK_BAJO_MAX} unid.` },
            { nivel: 'medio' as const, hint: `≤ ${STOCK_MEDIO_MAX} unid.` },
            { nivel: 'bueno' as const, hint: `> ${STOCK_MEDIO_MAX} unid.` },
          ] as const
        ).map(({ nivel, hint }) => (
          <div key={nivel} className={`rounded-2xl border border-neutral-200 p-3 shadow-card ${NIVEL_BADGE_CLASS[nivel]}`}>
            <p className="text-xs font-medium opacity-80">{NIVEL_LABEL[nivel]}</p>
            <p className="text-xl font-semibold">{porNivel[nivel].length}</p>
            <p className="text-[11px] opacity-70">{hint}</p>
          </div>
        ))}
      </div>

      {movimientoFormOpen ? (
        <ModalSheet title="Registrar movimiento" onClose={() => setMovimientoFormOpen(false)}>
          <MovimientoForm
            productos={productosActivos}
            responsableSugerido={turno?.responsableActual ?? ''}
            onSaved={async () => {
              setMovimientoFormOpen(false)
              await refresh()
            }}
          />
        </ModalSheet>
      ) : null}

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
            const nivel = nivelStock(stockActual)
            const bajoMin = nivel === 'bajo'
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
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${NIVEL_BADGE_CLASS[nivel]}`}
                  >
                    {bajoMin ? <AlertTriangle size={11} /> : null} {NIVEL_LABEL[nivel]}
                  </span>
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
  )
}
