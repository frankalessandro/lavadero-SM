import { useMemo, useState, type FormEvent } from 'react'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { Plus, X, Pencil, AlertTriangle, Boxes, PackageSearch, Coins, ShoppingCart, Droplet, ShoppingBag } from 'lucide-react'
import {
  fetchProductos,
  createProducto,
  updateProducto,
  setProductoActivo,
} from '../../../../data/productos'
import {
  fetchMovimientos,
  createMovimiento,
  fetchStockProductos,
  type StockProducto,
} from '../../../../data/movimientosInventario'
import { fetchVentasEnRango } from '../../../../data/ventas'
import { productoInputSchema, type Producto } from '../../../../schemas/producto'
import {
  movimientoInventarioInputSchema,
  type TipoMovimientoInventario,
} from '../../../../schemas/movimientoInventario'
import { Card } from '../../../../components/layout/Card'
import { StatCard } from '../../../../components/layout/StatCard'
import { CustomSelect } from '../../../../components/layout/CustomSelect'
import { ConfirmModal } from '../../../../components/layout/ConfirmModal'
import { CurrencyInput } from '../../../../components/layout/CurrencyInput'
import { BarChart } from '../../../../components/layout/BarChart'
import { METODO_PAGO_LABEL } from '../../../../lib/metodoPago'
import {
  nivelStock,
  ordenarPorNivelStock,
  NIVEL_LABEL,
  NIVEL_BADGE_CLASS,
  NIVEL_CHART_COLOR,
  STOCK_BAJO_MAX,
  STOCK_MEDIO_MAX,
} from '../../../../lib/nivelStock'

function hace30DiasISO(): string {
  const fecha = new Date()
  fecha.setDate(fecha.getDate() - 30)
  return fecha.toISOString()
}

async function loadInventario() {
  const [productos, stock, movimientos, ventas] = await Promise.all([
    fetchProductos(),
    fetchStockProductos(),
    fetchMovimientos(),
    fetchVentasEnRango(hace30DiasISO(), new Date().toISOString()),
  ])
  return { productos, stock, movimientos: movimientos.slice(0, 15), ventas }
}

export const Route = createFileRoute('/admin/dinero/inventario/')({
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
  const [ventas, setVentas] = useState(data.ventas)
  const [editing, setEditing] = useState<Producto | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [movimientoFormOpen, setMovimientoFormOpen] = useState(false)
  const [confirmando, setConfirmando] = useState<Producto | null>(null)

  async function refresh() {
    const [nuevosProductos, nuevoStock, nuevosMovimientos, nuevasVentas] = await Promise.all([
      fetchProductos(),
      fetchStockProductos(),
      fetchMovimientos(),
      fetchVentasEnRango(hace30DiasISO(), new Date().toISOString()),
    ])
    setProductos(nuevosProductos)
    setStock(nuevoStock)
    setMovimientos(nuevosMovimientos.slice(0, 15))
    setVentas(nuevasVentas)
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
  const stockDeProducto = (p: Producto) => stockPorProducto.get(p.id)?.stock ?? 0
  const porNivel = {
    bajo: productosActivos.filter((p) => nivelStock(stockDeProducto(p)) === 'bajo'),
    medio: productosActivos.filter((p) => nivelStock(stockDeProducto(p)) === 'medio'),
    bueno: productosActivos.filter((p) => nivelStock(stockDeProducto(p)) === 'bueno'),
  }
  const valorizacionTotal = stock.reduce((total, s) => total + s.valorizacion, 0)
  // Mismo criterio que /jefe-zona/inventario: sin precio_venta = insumo de uso interno (jabón,
  // cera), con precio_venta = producto de nevera para vender. Incluye inactivos (igual que la
  // tabla única de antes) para no perder visibilidad de productos recién inactivados. Ordenados
  // con lo urgente (nivel bajo) arriba.
  const productosInsumos = ordenarPorNivelStock(
    productos.filter((p) => p.precioVenta == null),
    stockDeProducto,
  )
  const productosVendibles = ordenarPorNivelStock(
    productos.filter((p) => p.precioVenta != null),
    stockDeProducto,
  )

  return (
    <div className="flex flex-col gap-6 text-left">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-neutral-900">Inventario</h2>
          <p className="text-sm text-neutral-500">Insumos de lavado y productos de nevera, movimientos manuales y valorización.</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setMovimientoFormOpen(true)}
            className="flex items-center gap-2 rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
          >
            <PackageSearch size={16} />
            Registrar movimiento
          </button>
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
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard label="Productos activos" value={String(productosActivos.length)} icon={Boxes} />
        <StatCard label="Valorización total" value={COP.format(valorizacionTotal)} hint="Costo promedio de entradas" icon={Coins} />
      </div>

      <div className="grid grid-cols-3 gap-3">
        {(
          [
            { nivel: 'bajo' as const, hint: `≤ ${STOCK_BAJO_MAX} unidades` },
            { nivel: 'medio' as const, hint: `≤ ${STOCK_MEDIO_MAX} unidades` },
            { nivel: 'bueno' as const, hint: `> ${STOCK_MEDIO_MAX} unidades` },
          ] as const
        ).map(({ nivel, hint }) => (
          <div key={nivel} className={`rounded-2xl border border-neutral-200 p-4 shadow-card ${NIVEL_BADGE_CLASS[nivel]}`}>
            <p className="text-xs font-medium opacity-80">{NIVEL_LABEL[nivel]}</p>
            <p className="text-xl font-semibold">{porNivel[nivel].length}</p>
            <p className="text-xs opacity-70" title={porNivel[nivel].map((p) => p.nombre).join(', ') || undefined}>
              {hint}
            </p>
          </div>
        ))}
      </div>

      {productosActivos.length > 2 ? (
        <Card className="text-left">
          <h3 className="mb-3 text-sm font-semibold text-neutral-900">Stock actual por producto</h3>
          <BarChart
            labels={productosActivos.map((p) => p.nombre)}
            data={productosActivos.map((p) => stockPorProducto.get(p.id)?.stock ?? 0)}
            colors={productosActivos.map((p) => NIVEL_CHART_COLOR[nivelStock(stockPorProducto.get(p.id)?.stock ?? 0)])}
            height={Math.max(120, productosActivos.length * 36)}
          />
        </Card>
      ) : null}

      <StockTable
        titulo="Insumos de lavado"
        subtitulo="Uso interno — no se venden"
        icono={Droplet}
        accento="border-t-primary-500"
        badgeClass="bg-primary-50 text-primary-700"
        productos={productosInsumos}
        stockPorProducto={stockPorProducto}
        onEditar={(p) => {
          setEditing(p)
          setFormOpen(true)
        }}
        onToggleActivo={setConfirmando}
        vacio="No hay insumos registrados. Usa «Nuevo producto» sin precio de venta."
      />

      <StockTable
        titulo="Productos para vender"
        subtitulo="Nevera / mostrador"
        icono={ShoppingBag}
        accento="border-t-warning-500"
        badgeClass="bg-warning-50 text-warning-700"
        productos={productosVendibles}
        stockPorProducto={stockPorProducto}
        mostrarPrecio
        onEditar={(p) => {
          setEditing(p)
          setFormOpen(true)
        }}
        onToggleActivo={setConfirmando}
        vacio="No hay productos de nevera registrados. Usa «Nuevo producto» con precio de venta."
      />

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

      <Card className="p-0">
        <div className="flex items-center justify-between border-b border-neutral-100 px-5 py-4">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-neutral-900">
            <ShoppingCart size={15} className="text-primary-500" />
            Ventas recientes (últimos 30 días)
          </h3>
          <p className="text-xs text-neutral-500">
            Total: <span className="font-semibold text-neutral-900">{COP.format(ventas.filter((v) => v.estado === 'activa').reduce((t, v) => t + v.total, 0))}</span>
          </p>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-left text-xs font-medium uppercase tracking-wide text-neutral-500">
              <th className="px-5 py-3">Fecha</th>
              <th className="px-5 py-3">Producto</th>
              <th className="px-5 py-3">Cantidad</th>
              <th className="px-5 py-3">Total</th>
              <th className="px-5 py-3">Método</th>
              <th className="px-5 py-3">Vendido por</th>
              <th className="px-5 py-3">Estado</th>
            </tr>
          </thead>
          <tbody>
            {ventas.slice(0, 15).map((venta) => (
              <tr key={venta.id} className={`border-b border-neutral-100 transition-colors last:border-0 hover:bg-primary-50/40 ${venta.estado === 'anulada' ? 'opacity-60' : ''}`}>
                <td className="px-5 py-3 text-neutral-500">{new Date(venta.creadoEn).toLocaleString('es-CO')}</td>
                <td className="px-5 py-3 font-medium text-neutral-900">{productoNombre(venta.productoId)}</td>
                <td className="px-5 py-3 text-neutral-700">{venta.cantidad}</td>
                <td className="px-5 py-3 text-neutral-700">{COP.format(venta.total)}</td>
                <td className="px-5 py-3 text-neutral-600">{METODO_PAGO_LABEL[venta.metodoPago]}</td>
                <td className="px-5 py-3 text-neutral-600">{venta.vendidoPor}</td>
                <td className="px-5 py-3">
                  <span
                    className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                      venta.estado === 'anulada' ? 'bg-danger-50 text-danger-700' : 'bg-success-50 text-success-700'
                    }`}
                    title={venta.estado === 'anulada' ? (venta.motivoAnulacion ?? undefined) : undefined}
                  >
                    {venta.estado === 'anulada' ? 'Anulada' : 'Activa'}
                  </span>
                </td>
              </tr>
            ))}
            {ventas.length === 0 ? (
              <tr>
                <td className="px-5 py-6 text-center text-neutral-400" colSpan={7}>
                  Todavía no se han registrado ventas.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </Card>

      {movimientoFormOpen ? (
        <MovimientoForm
          productos={productosActivos}
          onClose={() => setMovimientoFormOpen(false)}
          onSaved={async () => {
            setMovimientoFormOpen(false)
            await refresh()
          }}
        />
      ) : null}

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

function StockTable({
  titulo,
  subtitulo,
  icono: Icono,
  accento,
  badgeClass,
  productos,
  stockPorProducto,
  mostrarPrecio = false,
  onEditar,
  onToggleActivo,
  vacio,
}: {
  titulo: string
  subtitulo: string
  icono: typeof Boxes
  accento: string
  badgeClass: string
  productos: Producto[]
  stockPorProducto: Map<string, StockProducto>
  mostrarPrecio?: boolean
  onEditar: (producto: Producto) => void
  onToggleActivo: (producto: Producto) => void
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
            <th className="px-5 py-3">Costo prom.</th>
            <th className="px-5 py-3">Valorización</th>
            {mostrarPrecio ? <th className="px-5 py-3">Precio venta</th> : null}
            {mostrarPrecio ? <th className="px-5 py-3">Ganancia</th> : null}
            <th className="px-5 py-3">Estado</th>
            <th className="px-5 py-3 text-right">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {productos.map((producto) => {
            const s = stockPorProducto.get(producto.id)
            const stockActual = s?.stock ?? 0
            const nivel = nivelStock(stockActual)
            const bajoMin = nivel === 'bajo'
            return (
              <tr key={producto.id} className="border-b border-neutral-100 transition-colors last:border-0 hover:bg-primary-50/40">
                <td className="px-5 py-3">
                  <p className="font-medium text-neutral-900">{producto.nombre}</p>
                  <p className="text-xs text-neutral-400">{producto.unidadMedida}</p>
                </td>
                <td className="px-5 py-3">
                  <span className={`font-medium ${bajoMin ? 'text-danger-600' : 'text-neutral-900'}`}>{stockActual}</span>
                </td>
                <td className="px-5 py-3 text-neutral-500">{producto.stockMinimo}</td>
                <td className="px-5 py-3 text-neutral-700">{COP.format(Math.round(s?.costoPromedio ?? 0))}</td>
                <td className="px-5 py-3 text-neutral-700">{COP.format(s?.valorizacion ?? 0)}</td>
                {mostrarPrecio ? (
                  <td className="px-5 py-3 text-neutral-700">
                    {producto.precioVenta != null ? COP.format(producto.precioVenta) : '—'}
                  </td>
                ) : null}
                {mostrarPrecio ? (
                  <td className="px-5 py-3">
                    {(() => {
                      const costoRef = producto.costo ?? (s?.costoPromedio ? Math.round(s.costoPromedio) : null)
                      if (producto.precioVenta == null || costoRef == null) return <span className="text-neutral-400">—</span>
                      const ganancia = producto.precioVenta - costoRef
                      return (
                        <span className={`font-medium ${ganancia >= 0 ? 'text-success-700' : 'text-danger-600'}`}>
                          {COP.format(ganancia)}
                        </span>
                      )
                    })()}
                  </td>
                ) : null}
                <td className="px-5 py-3">
                  {producto.activo ? (
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${NIVEL_BADGE_CLASS[nivel]}`}
                    >
                      {bajoMin ? <AlertTriangle size={11} /> : null} {NIVEL_LABEL[nivel]}
                    </span>
                  ) : (
                    <span className="inline-flex rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-medium text-neutral-500">
                      Inactivo
                    </span>
                  )}
                </td>
                <td className="px-5 py-3">
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => onEditar(producto)}
                      className="flex size-8 items-center justify-center rounded-lg text-neutral-500 transition-colors hover:bg-primary-100 hover:text-primary-700"
                      aria-label={`Editar ${producto.nombre}`}
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={() => onToggleActivo(producto)}
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
              <td className="px-5 py-6 text-center text-neutral-400" colSpan={mostrarPrecio ? 9 : 7}>
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
  onClose,
  onSaved,
}: {
  productos: Producto[]
  onClose: () => void
  onSaved: () => Promise<void>
}) {
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
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-neutral-900/40 p-4 backdrop-blur-[2px]">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-card-hover sm:p-7">
        <div className="mb-5 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-base font-semibold text-neutral-900">
            <PackageSearch size={16} className="text-primary-500" />
            Registrar movimiento
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
      </div>
    </div>
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
  const [precioVenta, setPrecioVenta] = useState(producto?.precioVenta != null ? String(producto.precioVenta) : '')
  const [costo, setCosto] = useState(producto?.costo != null ? String(producto.costo) : '')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const parsed = productoInputSchema.safeParse({
      nombre,
      unidadMedida,
      stockMinimo: Number(stockMinimo) || 0,
      precioVenta: precioVenta ? Number(precioVenta) : undefined,
      costo: costo ? Number(costo) : undefined,
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

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-left text-sm">
              <span className="font-medium text-neutral-700">
                Costo <span className="font-normal text-neutral-400">(compra)</span>
              </span>
              <CurrencyInput size="sm" prefix="$" value={costo} onChange={setCosto} />
            </label>
            <label className="flex flex-col gap-1.5 text-left text-sm">
              <span className="font-medium text-neutral-700">
                Precio de venta <span className="font-normal text-neutral-400">(opcional)</span>
              </span>
              <CurrencyInput size="sm" prefix="$" value={precioVenta} onChange={setPrecioVenta} />
            </label>
          </div>
          <p className="-mt-2 text-xs text-neutral-400">
            Sin precio de venta el producto no se puede vender en /jefe-zona. El costo es el precio de compra de
            referencia — se usa para el margen y para el costo de mercancía vendida mientras no haya una entrada de
            inventario con costo.
            {costo && precioVenta ? (
              <span className="ml-1 font-medium text-success-700">
                Ganancia: {COP.format(Number(precioVenta) - Number(costo))}
              </span>
            ) : null}
          </p>

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
