import { useMemo, useState, type FormEvent } from 'react'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { ShoppingCart, Receipt, X, Plus, Minus, Trash2, Wallet, Users, UserPlus, PackagePlus, StickyNote } from 'lucide-react'
import { fetchTurnoAbierto } from '../../../data/turnos'
import { fetchProductosOperativo } from '../../../data/productos'
import { fetchStockProductosOperativo } from '../../../data/movimientosInventario'
import { createVenta, createVentaCarrito, anularVenta, fetchVentasHoy, fetchVentasPendientes } from '../../../data/ventas'
import { fetchCuentasAbiertas, fetchCuentasHoy, abrirCuenta, cerrarCuenta, anularCuenta } from '../../../data/cuentas'
import { anularVentaInputSchema, type Venta } from '../../../schemas/venta'
import { abrirCuentaInputSchema, anularCuentaInputSchema, type Cuenta } from '../../../schemas/cuenta'
import type { Producto } from '../../../schemas/producto'
import type { PagoLineaInput } from '../../../schemas/pago'
import { Card } from '../../../components/layout/Card'
import { StatCard } from '../../../components/layout/StatCard'
import { AbrirTurnoPrompt } from '../../../components/layout/TurnoResponsableBanner'
import { VentaReciboModal, type VentaReciboData } from '../../../components/layout/VentaReciboModal'
import { CorregirPagoModal } from '../../../components/layout/CorregirPagoModal'
import { PagoLineas } from '../../../components/layout/PagoLineas'
import { AgregarProductoModal } from '../../../components/layout/AgregarProductoModal'
import { QuitarProductoModal } from '../../../components/layout/QuitarProductoModal'
import { borradorAPagos, nuevaLineaBorrador, pagoLineasCuadra, type PagoLineaBorrador } from '../../../lib/pagoLineas'
import { METODO_PAGO_LABEL } from '../../../lib/metodoPago'

async function loadVentas() {
  const [turno, productos, stock, ventasHoy, cuentasAbiertas, cuentasHoy, pendientes] = await Promise.all([
    fetchTurnoAbierto('jefe_zona'),
    fetchProductosOperativo(),
    fetchStockProductosOperativo(),
    fetchVentasHoy(),
    fetchCuentasAbiertas(),
    fetchCuentasHoy(),
    fetchVentasPendientes(),
  ])
  return { turno, productos, stock, ventasHoy, cuentasAbiertas, cuentasHoy, pendientes }
}

export const Route = createFileRoute('/jefe-zona/ventas/')({
  loader: loadVentas,
  component: VenderPage,
})

const COP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })

// Solo se recalcula al renderizar (esta pantalla no tiene un timer en vivo como el dashboard de
// seguimiento) — suficiente para "hace cuánto se abrió", no hace falta que actualice cada minuto.
function hace(desdeISO: string): string {
  const minutos = Math.max(0, Math.round((Date.now() - new Date(desdeISO).getTime()) / 60000))
  if (minutos < 1) return 'recién'
  if (minutos < 60) return `hace ${minutos} min`
  const horas = Math.floor(minutos / 60)
  const resto = minutos % 60
  return `hace ${horas} h${resto > 0 ? ` ${resto} min` : ''}`
}

function VenderPage() {
  const data = Route.useLoaderData()
  const router = useRouter()
  const [turno, setTurno] = useState(data.turno)
  const [productos] = useState<Producto[]>(data.productos)
  const [stock, setStock] = useState(data.stock)
  const [ventasHoy, setVentasHoy] = useState<Venta[]>(data.ventasHoy)
  const [cuentasAbiertas, setCuentasAbiertas] = useState<Cuenta[]>(data.cuentasAbiertas)
  const [cuentasHoy, setCuentasHoy] = useState<Cuenta[]>(data.cuentasHoy)
  const [pendientes, setPendientes] = useState<Venta[]>(data.pendientes)
  const [tab, setTab] = useState<'mostrador' | 'cuentas'>('mostrador')
  const [recibo, setRecibo] = useState<VentaReciboData | null>(null)
  const [anulando, setAnulando] = useState<Venta | null>(null)
  // Venta (de un carrito) cuyo reparto de pago se está corrigiendo.
  const [corrigiendo, setCorrigiendo] = useState<Venta | null>(null)
  const [abriendoCuenta, setAbriendoCuenta] = useState(false)
  const [agregandoACuenta, setAgregandoACuenta] = useState<Cuenta | null>(null)
  const [quitandoDeCuenta, setQuitandoDeCuenta] = useState<Venta | null>(null)
  const [cerrandoCuenta, setCerrandoCuenta] = useState<Cuenta | null>(null)
  const [anulandoCuenta, setAnulandoCuenta] = useState<Cuenta | null>(null)

  async function refresh() {
    const nuevo = await loadVentas()
    setTurno(nuevo.turno)
    setStock(nuevo.stock)
    setVentasHoy(nuevo.ventasHoy)
    setCuentasAbiertas(nuevo.cuentasAbiertas)
    setCuentasHoy(nuevo.cuentasHoy)
    setPendientes(nuevo.pendientes)
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

  const itemsPorCuenta = useMemo(() => {
    const mapa = new Map<string, Venta[]>()
    for (const v of pendientes) {
      if (!v.cuentaId) continue
      const lista = mapa.get(v.cuentaId) ?? []
      lista.push(v)
      mapa.set(v.cuentaId, lista)
    }
    return mapa
  }, [pendientes])

  const cuentaPorId = useMemo(() => {
    const mapa = new Map<string, Cuenta>()
    for (const c of cuentasHoy) mapa.set(c.id, c)
    for (const c of cuentasAbiertas) if (!mapa.has(c.id)) mapa.set(c.id, c)
    return mapa
  }, [cuentasHoy, cuentasAbiertas])

  // Un solo listado por comprobante (no por línea de producto): agrupa por venta_grupo_id
  // (carrito de mostrador) o cuenta_id (cuenta cerrada) — una venta suelta (legado o cargada a una
  // orden) queda como grupo de un solo ítem. Excluye 'pendiente' (todavía no se vendió de verdad,
  // sigue como cuenta abierta u orden en espera en otra parte de la pantalla).
  const gruposVentasHoy = useMemo(() => {
    const mapa = new Map<string, Venta[]>()
    for (const v of ventasHoy) {
      if (v.estado === 'pendiente') continue
      const key = v.ventaGrupoId ?? v.cuentaId ?? v.id
      const lista = mapa.get(key) ?? []
      lista.push(v)
      mapa.set(key, lista)
    }
    return [...mapa.values()].sort((a, b) => b[0].consecutivo - a[0].consecutivo)
  }, [ventasHoy])

  function facturaTexto(grupo: Venta[]): string {
    const consecutivos = grupo.map((v) => v.consecutivo)
    const min = Math.min(...consecutivos)
    const max = Math.max(...consecutivos)
    return min === max ? `VTA-${min}` : `VTA-${min} a VTA-${max}`
  }

  function abrirReciboDeCuenta(cuenta: Cuenta, items: Venta[], pagos: PagoLineaInput[]) {
    setRecibo({
      consecutivo: Math.min(...items.map((v) => v.consecutivo)),
      consecutivoFin: Math.max(...items.map((v) => v.consecutivo)),
      titular: cuenta.titular,
      productoNombre: items.length === 1 ? productoNombre(items[0].productoId) : `${items.length} productos`,
      cantidad: items.reduce((s, v) => s + v.cantidad, 0),
      precioUnitario: items.length === 1 ? items[0].precioUnitario : 0,
      total: items.reduce((s, v) => s + v.total, 0),
      items:
        items.length === 1
          ? undefined
          : items.map((v) => ({
              nombre: productoNombre(v.productoId),
              cantidad: v.cantidad,
              precioUnitario: v.precioUnitario,
              total: v.total,
            })),
      metodoPago: pagos.length === 1 ? pagos[0].metodo : 'mixto',
      referenciaPago: pagos.length === 1 ? pagos[0].referencia : undefined,
      pagos: pagos.length > 1 ? pagos.map((p) => ({ metodo: p.metodo, monto: p.monto, referencia: p.referencia })) : undefined,
      vendidoPor: cuenta.cerradaPor ?? turno?.responsableActual ?? cuenta.abiertaPor,
      fecha: new Date().toISOString(),
    })
  }

  return (
    <div className="flex flex-col gap-6 text-left">
      <p className="px-1 text-sm text-neutral-500">
        Venta de productos de nevera (agua, cerveza, etc.) — al mostrador con cobro inmediato, o cargados a una
        cuenta abierta a nombre de alguien sin vehículo (lavador, acompañante, transeúnte) que se cobra completa al
        cerrarla. Descuenta el stock automáticamente y suma al arqueo de caja, aparte de lo cobrado por lavados.
      </p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard label="Ventas de hoy" value={String(ventasActivas.length)} icon={ShoppingCart} />
        <StatCard label="Total vendido hoy" value={COP.format(totalVendidoHoy)} hint="Efectivo + transferencia" icon={Receipt} />
      </div>

      {!turno ? (
        <AbrirTurnoPrompt onAbierto={refresh} />
      ) : (
        <>
          <div className="flex rounded-lg border border-neutral-300 p-1">
            {(
              [
                { key: 'mostrador' as const, label: 'Mostrador', icon: ShoppingCart },
                { key: 'cuentas' as const, label: `Cuentas abiertas${cuentasAbiertas.length > 0 ? ` (${cuentasAbiertas.length})` : ''}`, icon: Users },
              ] as const
            ).map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2.5 text-sm font-medium transition-colors ${
                  tab === key ? 'bg-primary-600 text-white shadow-nav-active' : 'text-neutral-600 hover:bg-neutral-50'
                }`}
              >
                <Icon size={15} />
                {label}
              </button>
            ))}
          </div>

          {tab === 'mostrador' ? (
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
            <div className="flex flex-col gap-4">
              <button
                type="button"
                onClick={() => setAbriendoCuenta(true)}
                className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-primary-300 bg-primary-50/50 py-3 text-sm font-semibold text-primary-700 transition-colors hover:bg-primary-50"
              >
                <UserPlus size={16} />
                Abrir cuenta
              </button>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {cuentasAbiertas.map((cuenta) => {
                  const items = itemsPorCuenta.get(cuenta.id) ?? []
                  const total = items.reduce((s, v) => s + v.total, 0)
                  return (
                    <Card key={cuenta.id} className="flex flex-col gap-3 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-medium text-neutral-900">{cuenta.titular}</p>
                          <p className="mt-0.5 text-xs text-neutral-500">
                            {hace(cuenta.abiertaEn)} · {cuenta.abiertaPor}
                          </p>
                          {cuenta.nota ? (
                            <p className="mt-1 flex items-start gap-1 text-xs text-neutral-500">
                              <StickyNote size={12} className="mt-0.5 shrink-0" /> {cuenta.nota}
                            </p>
                          ) : null}
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-lg font-semibold text-neutral-900">{COP.format(total)}</p>
                          <p className="text-xs text-neutral-400">
                            {items.length} ítem{items.length === 1 ? '' : 's'}
                          </p>
                        </div>
                      </div>

                      {items.length > 0 ? (
                        <div
                          className={`flex flex-col gap-1 rounded-lg bg-neutral-50 px-3 py-2 ${
                            items.length > 4 ? 'custom-scroll max-h-24 overflow-y-auto' : ''
                          }`}
                        >
                          {items.map((v) => (
                            <div key={v.id} className="flex items-center justify-between gap-2 text-xs">
                              <span className="min-w-0 truncate text-neutral-600">
                                {productoNombre(v.productoId)} ×{v.cantidad}
                              </span>
                              <div className="flex shrink-0 items-center gap-2">
                                <span className="font-medium text-neutral-700">{COP.format(v.total)}</span>
                                <button
                                  type="button"
                                  onClick={() => setQuitandoDeCuenta(v)}
                                  className="text-danger-500 transition-colors hover:text-danger-700"
                                  aria-label={`Quitar ${productoNombre(v.productoId)}`}
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : null}

                      <div className="flex gap-2 border-t border-neutral-100 pt-3">
                        <button
                          type="button"
                          onClick={() => setAgregandoACuenta(cuenta)}
                          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-neutral-300 py-2 text-xs font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
                        >
                          <PackagePlus size={14} /> Producto
                        </button>
                        <button
                          type="button"
                          disabled={items.length === 0}
                          onClick={() => setCerrandoCuenta(cuenta)}
                          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary-600 py-2 text-xs font-semibold text-white shadow-nav-active transition-colors hover:bg-primary-700 disabled:opacity-50"
                        >
                          <Wallet size={14} /> Cobrar y cerrar
                        </button>
                        <button
                          type="button"
                          onClick={() => setAnulandoCuenta(cuenta)}
                          className="rounded-lg px-3 py-2 text-xs font-medium text-danger-600 transition-colors hover:bg-danger-50"
                        >
                          Anular
                        </button>
                      </div>
                    </Card>
                  )
                })}
                {cuentasAbiertas.length === 0 ? (
                  <Card className="py-10 text-center text-sm text-neutral-400">No hay cuentas abiertas ahora mismo.</Card>
                ) : null}
              </div>

            </div>
          )}
        </>
      )}

      <div>
        <h3 className="mb-2 px-1 text-sm font-semibold text-neutral-900">Ventas de hoy ({gruposVentasHoy.length})</h3>
        <div className="flex flex-col gap-2">
          {gruposVentasHoy.map((grupo) => {
            const primera = grupo[0]
            const total = grupo.reduce((s, v) => s + v.total, 0)
            const cuenta = primera.cuentaId ? cuentaPorId.get(primera.cuentaId) : undefined
            const cliente = cuenta?.titular ?? 'Mostrador'
            const anulada = primera.estado === 'anulada'
            return (
              <Card key={primera.id} className={`flex flex-col gap-2.5 p-4 ${anulada ? 'opacity-60' : ''}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-neutral-900">{cliente}</p>
                    <p className="font-mono text-xs text-neutral-400">{facturaTexto(grupo)}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-semibold text-neutral-900">{COP.format(total)}</p>
                    <p className="text-xs text-neutral-500">{METODO_PAGO_LABEL[primera.metodoPago]}</p>
                  </div>
                </div>

                <div className="flex flex-col gap-1 rounded-lg bg-neutral-50 px-3 py-2 text-xs">
                  {grupo.map((v) => (
                    <div key={v.id} className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate text-neutral-600">
                        {productoNombre(v.productoId)} ×{v.cantidad}
                      </span>
                      <span className="shrink-0 text-neutral-500">{COP.format(v.total)}</span>
                    </div>
                  ))}
                </div>

                {anulada ? (
                  <p className="text-xs text-danger-600">Anulada — {primera.motivoAnulacion}</p>
                ) : (
                  <div className="flex items-center justify-end gap-3">
                    {primera.ventaGrupoId ? (
                      <button
                        type="button"
                        onClick={() => setCorrigiendo(primera)}
                        className="flex items-center gap-1 text-xs font-medium text-neutral-500 transition-colors hover:text-primary-700"
                      >
                        <Wallet size={12} /> Corregir pago
                      </button>
                    ) : null}
                    {!primera.cuentaId ? (
                      <button
                        type="button"
                        onClick={() => setAnulando(primera)}
                        className="text-xs font-medium text-danger-600 transition-colors hover:text-danger-700"
                      >
                        Anular
                      </button>
                    ) : null}
                  </div>
                )}
              </Card>
            )
          })}
          {gruposVentasHoy.length === 0 ? (
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

      {abriendoCuenta ? (
        <AbrirCuentaModal
          responsableSugerido={turno?.responsableActual ?? ''}
          onClose={() => setAbriendoCuenta(false)}
          onAbierta={async () => {
            setAbriendoCuenta(false)
            setTab('cuentas')
            await refresh()
          }}
        />
      ) : null}

      {agregandoACuenta ? (
        <AgregarProductoModal
          titulo="Agregar productos"
          subtitulo={`Cuenta: ${agregandoACuenta.titular} — se cobran al cerrar`}
          productos={productosVendibles}
          stockPorProducto={stockPorProducto}
          onClose={() => setAgregandoACuenta(null)}
          onAgregar={async (productoId, cantidad) => {
            await createVenta({
              productoId,
              cantidad,
              metodoPago: 'efectivo',
              vendidoPor: turno?.responsableActual ?? agregandoACuenta.abiertaPor,
              cuentaId: agregandoACuenta.id,
            })
            await refresh()
          }}
        />
      ) : null}

      {quitandoDeCuenta ? (
        <QuitarProductoModal
          venta={quitandoDeCuenta}
          productoNombre={productoNombre(quitandoDeCuenta.productoId)}
          onClose={() => setQuitandoDeCuenta(null)}
          onQuitar={async (venta, motivo) => {
            await anularVenta(venta.id, { motivo, anuladaPor: turno?.responsableActual ?? 'jefe de zona' })
            setQuitandoDeCuenta(null)
            await refresh()
          }}
        />
      ) : null}

      {cerrandoCuenta ? (
        <CerrarCuentaModal
          cuenta={cerrandoCuenta}
          items={itemsPorCuenta.get(cerrandoCuenta.id) ?? []}
          productoNombre={productoNombre}
          responsableSugerido={turno?.responsableActual ?? ''}
          onClose={() => setCerrandoCuenta(null)}
          onCerrada={async (pagos) => {
            const items = itemsPorCuenta.get(cerrandoCuenta.id) ?? []
            abrirReciboDeCuenta(cerrandoCuenta, items, pagos)
            setCerrandoCuenta(null)
            await refresh()
          }}
        />
      ) : null}

      {anulandoCuenta ? (
        <AnularCuentaModal
          cuenta={anulandoCuenta}
          onClose={() => setAnulandoCuenta(null)}
          onAnulada={async () => {
            setAnulandoCuenta(null)
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

function AbrirCuentaModal({
  responsableSugerido,
  onClose,
  onAbierta,
}: {
  responsableSugerido: string
  onClose: () => void
  onAbierta: () => Promise<void>
}) {
  const [titular, setTitular] = useState('')
  const [nota, setNota] = useState('')
  const [abiertaPor, setAbiertaPor] = useState(responsableSugerido)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const parsed = abrirCuentaInputSchema.safeParse({ titular, nota: nota || undefined, abiertaPor })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Datos inválidos')
      return
    }
    setError(null)
    setSaving(true)
    try {
      await abrirCuenta(parsed.data)
      await onAbierta()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo abrir la cuenta')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center bg-neutral-900/40 backdrop-blur-[2px] sm:items-center sm:p-4">
      <div className="w-full max-w-sm rounded-t-2xl bg-white p-5 shadow-card-hover sm:rounded-2xl sm:p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-neutral-900">Abrir cuenta</h3>
          <button
            type="button"
            onClick={onClose}
            className="flex size-8 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-neutral-100"
          >
            <X size={18} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-neutral-700">A nombre de</span>
            <input
              autoFocus
              value={titular}
              onChange={(e) => setTitular(e.target.value)}
              placeholder="p. ej. Andrés (lavador), acompañante del Mazda"
              className="rounded-lg border border-neutral-300 px-3 py-3 text-base outline-none transition-colors focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-neutral-700">
              Nota <span className="font-normal text-neutral-400">(opcional)</span>
            </span>
            <input
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              placeholder="p. ej. pidió agua y gaseosa"
              className="rounded-lg border border-neutral-300 px-3 py-3 text-base outline-none transition-colors focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-neutral-700">Quién abre</span>
            <input
              value={abiertaPor}
              onChange={(e) => setAbiertaPor(e.target.value)}
              className="rounded-lg border border-neutral-300 px-3 py-3 text-base outline-none transition-colors focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
            />
          </label>
          {error ? <p className="text-xs text-danger-600">{error}</p> : null}
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-primary-600 py-3 text-sm font-semibold text-white shadow-nav-active transition-colors hover:bg-primary-700 disabled:opacity-60"
          >
            {saving ? 'Abriendo…' : 'Abrir cuenta'}
          </button>
        </form>
      </div>
    </div>
  )
}

// Cobra todos los productos pendientes de la cuenta juntos (pago partido, 1-3 líneas que deben
// sumar exacto) — mismo componente `PagoLineas` que ya usa `CobroModal`/`VentaCarrito`.
function CerrarCuentaModal({
  cuenta,
  items,
  productoNombre,
  responsableSugerido,
  onClose,
  onCerrada,
}: {
  cuenta: Cuenta
  items: Venta[]
  productoNombre: (id: string) => string
  responsableSugerido: string
  onClose: () => void
  onCerrada: (pagos: PagoLineaInput[]) => Promise<void>
}) {
  const total = items.reduce((s, v) => s + v.total, 0)
  const [pagoLineas, setPagoLineas] = useState<PagoLineaBorrador[]>([nuevaLineaBorrador(total)])
  const [cerradaPor, setCerradaPor] = useState(responsableSugerido)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const pagoLineasEfectivas: PagoLineaBorrador[] =
    pagoLineas.length === 1 ? [{ ...pagoLineas[0], monto: total > 0 ? String(total) : '' }] : pagoLineas
  const cuadra = total > 0 && pagoLineasCuadra(pagoLineasEfectivas, total)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!cerradaPor.trim()) {
      setError('Indica quién cierra la cuenta')
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
      await cerrarCuenta(cuenta.id, pagos, cerradaPor.trim())
      await onCerrada(pagos)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cerrar la cuenta')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-neutral-900/40 backdrop-blur-[2px] sm:items-center sm:p-4">
      <div className="custom-scroll flex max-h-[90vh] w-full max-w-sm flex-col overflow-y-auto rounded-t-2xl bg-white p-5 shadow-card-hover sm:rounded-2xl sm:p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-neutral-900">Cobrar y cerrar — {cuenta.titular}</h3>
          <button
            type="button"
            onClick={onClose}
            className="flex size-8 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-neutral-100"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5 rounded-lg bg-neutral-50 px-3 py-2.5 text-sm">
            {items.map((v) => (
              <div key={v.id} className="flex items-center justify-between gap-2">
                <span className="text-neutral-600">
                  {productoNombre(v.productoId)} ×{v.cantidad}
                </span>
                <span className="font-medium text-neutral-800">{COP.format(v.total)}</span>
              </div>
            ))}
            <div className="mt-1 flex items-center justify-between border-t border-neutral-200 pt-1.5 text-sm font-semibold text-neutral-900">
              <span>Total</span>
              <span>{COP.format(total)}</span>
            </div>
          </div>

          <div className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-neutral-700">Cómo paga</span>
            <PagoLineas lineas={pagoLineasEfectivas} onChange={setPagoLineas} total={total} />
          </div>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-neutral-700">Quién cierra</span>
            <input
              value={cerradaPor}
              onChange={(e) => setCerradaPor(e.target.value)}
              className="rounded-lg border border-neutral-300 px-3 py-3 text-base outline-none transition-colors focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
            />
          </label>

          {error ? <p className="text-xs text-danger-600">{error}</p> : null}

          <button
            type="submit"
            disabled={saving || !cuadra}
            className="flex items-center justify-center gap-2 rounded-lg bg-primary-600 py-3 text-sm font-semibold text-white shadow-nav-active transition-colors hover:bg-primary-700 disabled:opacity-60"
          >
            <Wallet size={16} />
            {saving ? 'Cerrando…' : `Cobrar ${COP.format(total)}`}
          </button>
        </form>
      </div>
    </div>
  )
}

function AnularCuentaModal({
  cuenta,
  onClose,
  onAnulada,
}: {
  cuenta: Cuenta
  onClose: () => void
  onAnulada: () => Promise<void>
}) {
  const [motivo, setMotivo] = useState('')
  const [anuladaPor, setAnuladaPor] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const parsed = anularCuentaInputSchema.safeParse({ motivo, anuladaPor })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Datos inválidos')
      return
    }
    setError(null)
    setSaving(true)
    try {
      await anularCuenta(cuenta.id, parsed.data)
      await onAnulada()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo anular la cuenta')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-neutral-900/40 p-4 backdrop-blur-[2px]">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-card-hover">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-neutral-900">Anular cuenta — {cuenta.titular}</h3>
          <button
            type="button"
            onClick={onClose}
            className="flex size-8 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-neutral-100"
          >
            <X size={18} />
          </button>
        </div>
        <p className="mb-4 text-xs text-neutral-500">
          Sus productos pendientes quedan anulados sin afectar el stock (nunca lo descontaron). Queda visible en
          reportes con el motivo (control antifraude).
        </p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-neutral-700">Motivo</span>
            <textarea
              autoFocus
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="p. ej. Se fue sin pagar"
              rows={2}
              className="resize-none rounded-lg border border-neutral-300 px-3 py-2.5 text-sm outline-none transition-colors focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-neutral-700">Quién anula</span>
            <input
              value={anuladaPor}
              onChange={(e) => setAnuladaPor(e.target.value)}
              className="rounded-lg border border-neutral-300 px-3 py-2.5 text-sm outline-none transition-colors focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
            />
          </label>
          {error ? <p className="text-xs text-danger-600">{error}</p> : null}
          <div className="flex justify-end gap-2 border-t border-neutral-100 pt-4">
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
              {saving ? 'Anulando…' : 'Anular cuenta'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
