import { useMemo, useState, type FormEvent } from 'react'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { ShoppingCart, Receipt, Package, AlertTriangle, X } from 'lucide-react'
import { fetchTurnoAbierto } from '../../../data/turnos'
import { fetchProductos } from '../../../data/productos'
import { fetchStockProductosOperativo } from '../../../data/movimientosInventario'
import { createVenta, anularVenta, fetchVentasHoy } from '../../../data/ventas'
import { ventaInputSchema, anularVentaInputSchema, type Venta } from '../../../schemas/venta'
import type { Producto } from '../../../schemas/producto'
import type { MetodoPago } from '../../../schemas/orden'
import { Card } from '../../../components/layout/Card'
import { StatCard } from '../../../components/layout/StatCard'
import { CustomSelect } from '../../../components/layout/CustomSelect'
import { AbrirTurnoPrompt } from '../../../components/layout/TurnoResponsableBanner'
import { VentaReciboModal, type VentaReciboData } from '../../../components/layout/VentaReciboModal'

async function loadVentas() {
  const [turno, productos, stock, ventasHoy] = await Promise.all([
    fetchTurnoAbierto('jefe_zona'),
    fetchProductos(),
    fetchStockProductosOperativo(),
    fetchVentasHoy(),
  ])
  return { turno, productos, stock, ventasHoy }
}

export const Route = createFileRoute('/jefe-zona/inventario/')({
  loader: loadVentas,
  component: VentasInventarioPage,
})

const COP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })

function VentasInventarioPage() {
  const data = Route.useLoaderData()
  const router = useRouter()
  const [turno, setTurno] = useState(data.turno)
  const [productos] = useState<Producto[]>(data.productos)
  const [stock, setStock] = useState(data.stock)
  const [ventasHoy, setVentasHoy] = useState<Venta[]>(data.ventasHoy)
  const [recibo, setRecibo] = useState<VentaReciboData | null>(null)
  const [anulando, setAnulando] = useState<Venta | null>(null)

  async function refresh() {
    const nuevo = await loadVentas()
    setTurno(nuevo.turno)
    setStock(nuevo.stock)
    setVentasHoy(nuevo.ventasHoy)
    router.invalidate()
  }

  const stockPorProducto = useMemo(() => {
    const mapa = new Map<string, number>()
    for (const s of stock) mapa.set(s.productoId, s.stock)
    return mapa
  }, [stock])

  const productosActivos = productos.filter((p) => p.activo)
  const productosVendibles = productosActivos.filter((p) => p.precioVenta != null)
  const productoNombre = (id: string) => productos.find((p) => p.id === id)?.nombre ?? '—'

  const ventasActivas = ventasHoy.filter((v) => v.estado === 'activa')
  const totalVendidoHoy = ventasActivas.reduce((total, v) => total + v.total, 0)

  return (
    <div className="flex flex-col gap-6 text-left">
      <div>
        <h2 className="text-base font-semibold text-neutral-900">Inventario — Ventas</h2>
        <p className="text-sm text-neutral-500">
          Venta de productos (agua, cerveza, etc.) al mostrador — descuenta el stock automáticamente y suma al
          arqueo de caja, aparte de lo cobrado por lavados.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard label="Ventas de hoy" value={String(ventasActivas.length)} icon={ShoppingCart} />
        <StatCard label="Total vendido hoy" value={COP.format(totalVendidoHoy)} hint="Efectivo + transferencia" icon={Receipt} />
      </div>

      {turno ? (
        <VentaForm
          productosVendibles={productosVendibles}
          stockPorProducto={stockPorProducto}
          responsableSugerido={turno.responsableActual}
          onVendida={async (venta, productoNombreVendido) => {
            setRecibo({
              consecutivo: venta.consecutivo,
              productoNombre: productoNombreVendido,
              cantidad: venta.cantidad,
              precioUnitario: venta.precioUnitario,
              total: venta.total,
              metodoPago: venta.metodoPago,
              referenciaPago: venta.referenciaPago,
              vendidoPor: venta.vendidoPor,
              fecha: venta.creadoEn,
            })
            await refresh()
          }}
        />
      ) : (
        <AbrirTurnoPrompt onAbierto={refresh} />
      )}

      <div>
        <h3 className="mb-2 px-1 text-sm font-semibold text-neutral-900">Ventas de hoy ({ventasHoy.length})</h3>
        <div className="flex flex-col gap-2">
          {ventasHoy.map((venta) => (
            <Card key={venta.id} className={`flex items-center justify-between gap-3 p-4 ${venta.estado === 'anulada' ? 'opacity-60' : ''}`}>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-semibold text-neutral-900">VTA-{venta.consecutivo}</span>
                  <span className="text-xs text-neutral-400">×{venta.cantidad}</span>
                </div>
                <p className="mt-0.5 truncate text-xs text-neutral-500">
                  {productoNombre(venta.productoId)} · {venta.metodoPago === 'efectivo' ? 'Efectivo' : 'Transferencia'} ·{' '}
                  {venta.vendidoPor}
                </p>
                {venta.estado === 'anulada' ? (
                  <p className="mt-0.5 text-xs text-danger-600">Anulada — {venta.motivoAnulacion}</p>
                ) : null}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1.5">
                <span className="text-sm font-semibold text-neutral-900">{COP.format(venta.total)}</span>
                {venta.estado === 'activa' ? (
                  <button
                    type="button"
                    onClick={() => setAnulando(venta)}
                    className="text-xs font-medium text-danger-600 transition-colors hover:text-danger-700"
                  >
                    Anular
                  </button>
                ) : (
                  <span className="inline-flex rounded-full bg-danger-50 px-2 py-0.5 text-xs font-medium text-danger-700">Anulada</span>
                )}
              </div>
            </Card>
          ))}
          {ventasHoy.length === 0 ? (
            <Card className="py-10 text-center text-sm text-neutral-400">Todavía no se han registrado ventas hoy.</Card>
          ) : null}
        </div>
      </div>

      <Card className="p-0">
        <div className="border-b border-neutral-100 px-5 py-4">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-neutral-900">
            <Package size={15} className="text-primary-500" />
            Stock actual
          </h3>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-left text-xs font-medium uppercase tracking-wide text-neutral-500">
              <th className="px-5 py-3">Producto</th>
              <th className="px-5 py-3">Stock</th>
              <th className="px-5 py-3">Mínimo</th>
              <th className="px-5 py-3">Estado</th>
            </tr>
          </thead>
          <tbody>
            {productosActivos.map((producto) => {
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
            {productosActivos.length === 0 ? (
              <tr>
                <td className="px-5 py-6 text-center text-neutral-400" colSpan={4}>
                  No hay productos activos registrados en Admin › Dinero › Inventario y ventas.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </Card>

      {recibo ? <VentaReciboModal venta={recibo} onClose={() => setRecibo(null)} /> : null}

      {anulando ? (
        <AnularVentaModal
          venta={anulando}
          productoNombre={productoNombre(anulando.productoId)}
          onClose={() => setAnulando(null)}
          onAnulada={async () => {
            setAnulando(null)
            await refresh()
          }}
        />
      ) : null}
    </div>
  )
}

function VentaForm({
  productosVendibles,
  stockPorProducto,
  responsableSugerido,
  onVendida,
}: {
  productosVendibles: Producto[]
  stockPorProducto: Map<string, number>
  responsableSugerido: string
  onVendida: (venta: Venta, productoNombre: string) => Promise<void>
}) {
  const [productoId, setProductoId] = useState('')
  const [cantidad, setCantidad] = useState('1')
  const [metodoPago, setMetodoPago] = useState<MetodoPago>('efectivo')
  const [referenciaPago, setReferenciaPago] = useState('')
  const [vendidoPor, setVendidoPor] = useState(responsableSugerido)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  function reset() {
    setProductoId('')
    setCantidad('1')
    setMetodoPago('efectivo')
    setReferenciaPago('')
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const parsed = ventaInputSchema.safeParse({
      productoId,
      cantidad: Number(cantidad),
      metodoPago,
      referenciaPago: metodoPago === 'transferencia' ? referenciaPago || undefined : undefined,
      vendidoPor,
    })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Revisa los datos del formulario')
      return
    }
    setError(null)
    setSaving(true)
    try {
      const producto = productosVendibles.find((p) => p.id === productoId)
      const venta = await createVenta(parsed.data)
      reset()
      await onVendida(venta, producto?.nombre ?? '—')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar la venta')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-neutral-900">
        <ShoppingCart size={16} className="text-primary-500" />
        Registrar venta
      </h3>
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-neutral-700">Producto</span>
          <CustomSelect
            value={productoId}
            onChange={setProductoId}
            placeholder="Selecciona…"
            emptyLabel="No hay productos con precio de venta definido"
            options={productosVendibles.map((p) => ({
              value: p.id,
              label: `${p.nombre} — ${COP.format(p.precioVenta ?? 0)}`,
              description: `Stock: ${stockPorProducto.get(p.id) ?? 0} ${p.unidadMedida}`,
            }))}
          />
        </label>

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-neutral-700">Cantidad</span>
          <input
            type="number"
            min={1}
            value={cantidad}
            onChange={(e) => setCantidad(e.target.value)}
            className="rounded-lg border border-neutral-300 px-3 py-3 text-base outline-none transition-colors focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
          />
        </label>

        <div className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-neutral-700">Método de pago</span>
          <div className="grid grid-cols-2 gap-2">
            {(['efectivo', 'transferencia'] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setMetodoPago(value)}
                className={`rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors ${
                  metodoPago === value
                    ? 'border-primary-600 bg-primary-50 text-primary-700'
                    : 'border-neutral-200 text-neutral-600 hover:bg-neutral-50'
                }`}
              >
                {value === 'efectivo' ? 'Efectivo' : 'Transferencia'}
              </button>
            ))}
          </div>
        </div>

        {metodoPago === 'transferencia' ? (
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-neutral-700">Referencia</span>
            <input
              value={referenciaPago}
              onChange={(e) => setReferenciaPago(e.target.value)}
              placeholder="Número de comprobante"
              className="rounded-lg border border-neutral-300 px-3 py-3 text-base outline-none transition-colors focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
            />
          </label>
        ) : null}

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-neutral-700">Vendido por</span>
          <input
            value={vendidoPor}
            onChange={(e) => setVendidoPor(e.target.value)}
            placeholder="Nombre de quien vende"
            className="rounded-lg border border-neutral-300 px-3 py-3 text-base outline-none transition-colors focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
          />
        </label>

        {error ? <p className="text-xs text-danger-600">{error}</p> : null}

        <button
          type="submit"
          disabled={saving}
          className="flex items-center justify-center gap-2 rounded-lg bg-primary-600 py-3 text-sm font-semibold text-white shadow-nav-active transition-colors hover:bg-primary-700 disabled:opacity-60"
        >
          {saving ? 'Registrando…' : 'Cobrar venta'}
        </button>
      </form>
    </Card>
  )
}

function AnularVentaModal({
  venta,
  productoNombre,
  onClose,
  onAnulada,
}: {
  venta: Venta
  productoNombre: string
  onClose: () => void
  onAnulada: () => Promise<void>
}) {
  const [motivo, setMotivo] = useState('')
  const [anuladaPor, setAnuladaPor] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const parsed = anularVentaInputSchema.safeParse({ motivo, anuladaPor })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Datos inválidos')
      return
    }
    setError(null)
    setSaving(true)
    try {
      await anularVenta(venta.id, parsed.data)
      await onAnulada()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo anular la venta')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-neutral-900/40 p-4 backdrop-blur-[2px]">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-card-hover sm:p-7">
        <div className="mb-5 flex items-center justify-between">
          <h3 className="text-base font-semibold text-neutral-900">
            Anular venta VTA-{venta.consecutivo} · {productoNombre}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="flex size-8 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-neutral-100"
          >
            <X size={18} />
          </button>
        </div>

        <p className="mb-5 text-xs text-neutral-500">
          Esta acción no se puede deshacer. El stock se repone automáticamente y la venta queda visible en
          reportes con el motivo y quién la anuló (control antifraude).
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <label className="flex flex-col gap-1.5 text-left text-sm">
            <span className="font-medium text-neutral-700">Motivo de anulación</span>
            <textarea
              autoFocus
              value={motivo}
              onChange={(event) => setMotivo(event.target.value)}
              placeholder="p. ej. Producto equivocado por error de digitación"
              rows={3}
              className="resize-none rounded-lg border border-neutral-300 px-3 py-2.5 text-sm outline-none transition-colors focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
            />
          </label>

          <label className="flex flex-col gap-1.5 text-left text-sm">
            <span className="font-medium text-neutral-700">Quién anula</span>
            <input
              value={anuladaPor}
              onChange={(event) => setAnuladaPor(event.target.value)}
              placeholder="Nombre de quien anula"
              className="rounded-lg border border-neutral-300 px-3 py-2.5 text-sm outline-none transition-colors focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
            />
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
              className="rounded-lg bg-danger-600 px-4 py-2 text-sm font-medium text-white shadow-nav-active transition-colors hover:bg-danger-700 disabled:opacity-60"
            >
              {saving ? 'Anulando…' : 'Anular venta'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
