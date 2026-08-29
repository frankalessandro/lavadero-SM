import { useMemo, useState, type FormEvent } from 'react'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { ShoppingCart, Receipt, X, Plus, Minus, Trash2, Wallet } from 'lucide-react'
import { fetchTurnoAbierto } from '../../../data/turnos'
import { fetchProductosOperativo } from '../../../data/productos'
import { fetchStockProductosOperativo } from '../../../data/movimientosInventario'
import { createVentaCarrito, anularVenta, fetchVentasHoy } from '../../../data/ventas'
import { anularVentaInputSchema, type Venta } from '../../../schemas/venta'
import type { Producto } from '../../../schemas/producto'
import type { PagoLineaInput } from '../../../schemas/pago'
import { Card } from '../../../components/layout/Card'
import { StatCard } from '../../../components/layout/StatCard'
import { AbrirTurnoPrompt } from '../../../components/layout/TurnoResponsableBanner'
import { VentaReciboModal, type VentaReciboData } from '../../../components/layout/VentaReciboModal'
import { CorregirPagoModal } from '../../../components/layout/CorregirPagoModal'
import { PagoLineas } from '../../../components/layout/PagoLineas'
import { borradorAPagos, nuevaLineaBorrador, pagoLineasCuadra, type PagoLineaBorrador } from '../../../lib/pagoLineas'
import { METODO_PAGO_LABEL } from '../../../lib/metodoPago'

async function loadVentas() {
  const [turno, productos, stock, ventasHoy] = await Promise.all([
    fetchTurnoAbierto('jefe_zona'),
    fetchProductosOperativo(),
    fetchStockProductosOperativo(),
    fetchVentasHoy(),
  ])
  return { turno, productos, stock, ventasHoy }
}

export const Route = createFileRoute('/jefe-zona/ventas/')({
  loader: loadVentas,
  component: VenderPage,
})

const COP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })

function VenderPage() {
  const data = Route.useLoaderData()
  const router = useRouter()
  const [turno, setTurno] = useState(data.turno)
  const [productos] = useState<Producto[]>(data.productos)
  const [stock, setStock] = useState(data.stock)
  const [ventasHoy, setVentasHoy] = useState<Venta[]>(data.ventasHoy)
  const [recibo, setRecibo] = useState<VentaReciboData | null>(null)
  const [anulando, setAnulando] = useState<Venta | null>(null)
  // Venta (de un carrito) cuyo reparto de pago se está corrigiendo.
  const [corrigiendo, setCorrigiendo] = useState<Venta | null>(null)

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
      <p className="px-1 text-sm text-neutral-500">
        Venta de productos de nevera (agua, cerveza, etc.) al mostrador — descuenta el stock automáticamente y
        suma al arqueo de caja, aparte de lo cobrado por lavados.
      </p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard label="Ventas de hoy" value={String(ventasActivas.length)} icon={ShoppingCart} />
        <StatCard label="Total vendido hoy" value={COP.format(totalVendidoHoy)} hint="Efectivo + transferencia" icon={Receipt} />
      </div>

      {turno ? (
        <VentaCarrito
          productosVendibles={productosVendibles}
          stockPorProducto={stockPorProducto}
          responsableSugerido={turno.responsableActual}
          onVendido={async (ventas, pagos) => {
            const primera = ventas[0]
            const consecutivos = ventas.map((v) => v.consecutivo)
            setRecibo({
              consecutivo: Math.min(...consecutivos),
              consecutivoFin: Math.max(...consecutivos),
              productoNombre: ventas.length === 1 ? productoNombre(primera.productoId) : `${ventas.length} productos`,
              cantidad: ventas.reduce((s, v) => s + v.cantidad, 0),
              precioUnitario: ventas.length === 1 ? primera.precioUnitario : 0,
              total: ventas.reduce((s, v) => s + v.total, 0),
              items:
                ventas.length === 1
                  ? undefined
                  : ventas.map((v) => ({
                      nombre: productoNombre(v.productoId),
                      cantidad: v.cantidad,
                      precioUnitario: v.precioUnitario,
                      total: v.total,
                    })),
              metodoPago: primera.metodoPago,
              referenciaPago: pagos.length === 1 ? pagos[0].referencia : undefined,
              pagos:
                pagos.length > 1
                  ? pagos.map((p) => ({ metodo: p.metodo, monto: p.monto, referencia: p.referencia }))
                  : undefined,
              vendidoPor: primera.vendidoPor,
              fecha: primera.creadoEn,
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
                  {productoNombre(venta.productoId)} · {METODO_PAGO_LABEL[venta.metodoPago]} ·{' '}
                  {venta.vendidoPor}
                </p>
                {venta.estado === 'anulada' ? (
                  <p className="mt-0.5 text-xs text-danger-600">Anulada — {venta.motivoAnulacion}</p>
                ) : null}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1.5">
                <span className="text-sm font-semibold text-neutral-900">{COP.format(venta.total)}</span>
                {venta.estado === 'activa' ? (
                  <div className="flex items-center gap-2">
                    {venta.ventaGrupoId ? (
                      <button
                        type="button"
                        onClick={() => setCorrigiendo(venta)}
                        className="flex items-center gap-1 text-xs font-medium text-neutral-500 transition-colors hover:text-primary-700"
                      >
                        <Wallet size={12} /> Corregir pago
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => setAnulando(venta)}
                      className="text-xs font-medium text-danger-600 transition-colors hover:text-danger-700"
                    >
                      Anular
                    </button>
                  </div>
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

      {recibo ? <VentaReciboModal venta={recibo} onClose={() => setRecibo(null)} /> : null}

      {corrigiendo?.ventaGrupoId ? (
        <CorregirPagoModal
          target={{ ventaGrupoId: corrigiendo.ventaGrupoId }}
          referencia={`Venta de mostrador VTA-${corrigiendo.consecutivo}`}
          onClose={() => setCorrigiendo(null)}
          onCorregido={async () => {
            setCorrigiendo(null)
            await refresh()
          }}
        />
      ) : null}

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

// Carrito de venta aparte: varias líneas de producto cobradas juntas con pago partido (1–3
// medios que deben sumar el total). Todo en una transacción vía `registrar_venta_carrito` —
// una fila `ventas` por producto + 1–3 filas `pagos` contra un `venta_grupo_id` común.
function VentaCarrito({
  productosVendibles,
  stockPorProducto,
  responsableSugerido,
  onVendido,
}: {
  productosVendibles: Producto[]
  stockPorProducto: Map<string, number>
  responsableSugerido: string
  onVendido: (ventas: Venta[], pagos: PagoLineaInput[]) => Promise<void>
}) {
  const [carrito, setCarrito] = useState<Map<string, number>>(new Map())
  const [pagoLineas, setPagoLineas] = useState<PagoLineaBorrador[]>([nuevaLineaBorrador()])
  const [vendidoPor, setVendidoPor] = useState(responsableSugerido)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  function setCantidad(productoId: string, cantidad: number) {
    setCarrito((prev) => {
      const siguiente = new Map(prev)
      if (cantidad <= 0) siguiente.delete(productoId)
      else siguiente.set(productoId, cantidad)
      return siguiente
    })
  }

  const items = [...carrito.entries()]
  const unidades = items.reduce((s, [, c]) => s + c, 0)
  const total = items.reduce((s, [id, c]) => {
    const p = productosVendibles.find((x) => x.id === id)
    return s + (p?.precioVenta ?? 0) * c
  }, 0)

  // Con una sola línea de pago su monto ES el total del carrito (única forma de que cuadre), así
  // que se deriva en vez de guardarse — sin esto habría que teclearlo en el caso simple. Con 2 o
  // 3 líneas cada monto se edita a mano.
  const pagoLineasEfectivas: PagoLineaBorrador[] =
    pagoLineas.length === 1
      ? [{ ...pagoLineas[0], monto: total > 0 ? String(total) : '' }]
      : pagoLineas

  const cuadra = total > 0 && pagoLineasCuadra(pagoLineasEfectivas, total)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (items.length === 0) return
    if (!vendidoPor.trim()) {
      setError('El responsable es obligatorio')
      return
    }
    if (!cuadra) {
      setError(`Las líneas de pago deben sumar exactamente ${COP.format(total)}`)
      return
    }
    setError(null)
    setSaving(true)
    try {
      const pagos = borradorAPagos(pagoLineasEfectivas)
      const hechas = await createVentaCarrito(
        { items: items.map(([productoId, cantidad]) => ({ productoId, cantidad })), vendidoPor: vendidoPor.trim() },
        pagos,
      )
      setCarrito(new Map())
      setPagoLineas([nuevaLineaBorrador()])
      await onVendido(hechas, pagos)
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
        <div className="grid grid-cols-2 gap-2">
          {productosVendibles.map((p) => {
            const stock = stockPorProducto.get(p.id) ?? 0
            const cant = carrito.get(p.id) ?? 0
            const agotado = stock <= 0
            return (
              <div
                key={p.id}
                className={`flex flex-col gap-1.5 rounded-lg border p-2.5 transition-colors ${
                  cant > 0 ? 'border-primary-500 bg-primary-50' : 'border-neutral-200'
                } ${agotado ? 'opacity-50' : ''}`}
              >
                <button
                  type="button"
                  disabled={agotado}
                  onClick={() => setCantidad(p.id, cant + 1)}
                  className="text-left disabled:cursor-not-allowed"
                >
                  <span className="block text-sm font-medium text-neutral-800">{p.nombre}</span>
                  <span className="block text-xs text-neutral-500">
                    {COP.format(p.precioVenta ?? 0)} · stock {stock}
                  </span>
                </button>
                {cant > 0 ? (
                  <div className="flex items-center justify-between rounded-md bg-white px-1 py-0.5">
                    <button
                      type="button"
                      onClick={() => setCantidad(p.id, cant - 1)}
                      className="flex size-7 items-center justify-center rounded text-neutral-600 hover:bg-neutral-100"
                    >
                      <Minus size={14} />
                    </button>
                    <span className="text-sm font-semibold text-neutral-900">{cant}</span>
                    <button
                      type="button"
                      onClick={() => setCantidad(p.id, cant + 1)}
                      className="flex size-7 items-center justify-center rounded text-neutral-600 hover:bg-neutral-100"
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                ) : null}
              </div>
            )
          })}
          {productosVendibles.length === 0 ? (
            <p className="col-span-2 py-6 text-center text-xs text-neutral-400">
              No hay productos con precio de venta definido.
            </p>
          ) : null}
        </div>

        {items.length > 0 ? (
          <button
            type="button"
            onClick={() => setCarrito(new Map())}
            className="flex items-center gap-1.5 self-start text-xs font-medium text-danger-600 transition-colors hover:text-danger-700"
          >
            <Trash2 size={13} /> Vaciar
          </button>
        ) : null}

        {items.length > 0 ? (
          <div className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-neutral-700">Cómo paga</span>
            <PagoLineas lineas={pagoLineasEfectivas} onChange={setPagoLineas} total={total} />
          </div>
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
          disabled={saving || items.length === 0 || !cuadra}
          className="flex items-center justify-center gap-2 rounded-lg bg-primary-600 py-3 text-sm font-semibold text-white shadow-nav-active transition-colors hover:bg-primary-700 disabled:opacity-60"
        >
          {saving
            ? 'Registrando…'
            : items.length === 0
              ? 'Elige productos'
              : `Cobrar ${unidades} · ${COP.format(total)}`}
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
          {venta.ventaGrupoId
            ? ' Esta venta se cobró junto con otras en un mismo comprobante: se anulará el comprobante completo.'
            : ''}
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
