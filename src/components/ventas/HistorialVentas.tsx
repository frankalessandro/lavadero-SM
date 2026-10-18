import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Ban, ChevronDown, ChevronRight, CupSoda, Receipt, ShoppingCart, UserRound } from 'lucide-react'
import { fetchHistorialVentas, type HistorialVentas as Historial } from '../../data/historialVentas'
import type { Producto } from '../../schemas/producto'
import type { Cuenta } from '../../schemas/cuenta'
import type { Venta } from '../../schemas/venta'
import { Card } from '../layout/Card'
import { StatCard } from '../layout/StatCard'
import { PageHeader } from '../layout/PageHeader'
import { PeriodoSelector } from '../layout/PeriodoSelector'
import { CuentaDetalleModal } from './CuentaDetalleModal'
import { BarraFiltros, FiltroBusqueda, FiltroCombo, FiltroMenu } from '../layout/Filtros'
import { COP } from '../../lib/formato'
import { METODO_PAGO_LABEL } from '../../lib/metodoPago'
import { calcularRango, rangoAISO, type ModoPeriodo } from '../../lib/periodo'
import { coincide } from '../../lib/tableFilters'

const FECHA_HORA = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })

interface Comprobante {
  clave: string
  ventas: Venta[]
  cliente: string
  detalle: string | null
  cuenta: Cuenta | null
  cargadaA: string | null
  aCosto: boolean
  factura: string
  total: number
  anulada: boolean
  fecha: string
}

function facturaTexto(ventas: Venta[]): string {
  const consecutivos = ventas.map((v) => v.consecutivo)
  const min = Math.min(...consecutivos)
  const max = Math.max(...consecutivos)
  return min === max ? `VTA-${min}` : `VTA-${min} a VTA-${max}`
}

// Un comprobante = un carrito de mostrador (venta_grupo_id), una cuenta o una orden de lavado: lo
// que el cliente ve como "una compra", no una fila por producto.
function agrupar(historial: Historial): Comprobante[] {
  const mapa = new Map<string, Venta[]>()
  for (const v of historial.ventas) {
    const clave = v.ventaGrupoId ?? v.cuentaId ?? v.ordenId ?? v.id
    const lista = mapa.get(clave) ?? []
    lista.push(v)
    mapa.set(clave, lista)
  }
  const comprobantes: Comprobante[] = []
  for (const [clave, ventas] of mapa) {
    const primera = ventas[0]
    const cuenta = primera.cuentaId ? historial.cuentaPorId.get(primera.cuentaId) : undefined
    const orden = primera.ordenId ? historial.ordenPorId.get(primera.ordenId) : undefined
    let cliente = 'Mostrador'
    let detalle: string | null = null
    if (primera.cuentaId) {
      cliente = cuenta?.titular ?? 'Cuenta'
      detalle = cuenta?.nota ?? null
    } else if (primera.ordenId) {
      cliente = orden ? `Lavado · ${orden.placa}` : 'Lavado'
    }
    comprobantes.push({
      clave,
      ventas,
      cliente,
      detalle,
      cuenta: cuenta ?? null,
      cargadaA: primera.cuentaId ? (historial.cargadaAPorCuenta.get(primera.cuentaId) ?? null) : null,
      aCosto: ventas.some((v) => v.aCosto),
      factura: facturaTexto(ventas),
      total: ventas.reduce((s, v) => s + v.total, 0),
      anulada: ventas.every((v) => v.estado === 'anulada'),
      fecha: primera.cobradaEn ?? primera.creadoEn,
    })
  }
  return comprobantes.sort((a, b) => Math.max(...b.ventas.map((v) => v.consecutivo)) - Math.max(...a.ventas.map((v) => v.consecutivo)))
}

// Histórico de ventas de nevera/vitrina por día/semana/mes: el listado de "Ventas de hoy" solo
// llega hasta hoy; acá se consulta cualquier periodo, con qué se llevó cada quien y, si se cargó a
// un trabajador, a quién. Lo comparten gerencia y jefe de patio — cada uno trae sus productos
// (el jefe de patio no ve costos) y solo gerencia ve la marca de "a costo".
export function HistorialVentas({
  cargarProductos,
  queryKeyProductos,
  esAdmin = false,
}: {
  cargarProductos: () => Promise<Producto[]>
  queryKeyProductos: readonly unknown[]
  esAdmin?: boolean
}) {
  const [modo, setModo] = useState<ModoPeriodo>('semana')
  const [ancla, setAncla] = useState(() => new Date())
  const [busqueda, setBusqueda] = useState('')
  const [metodo, setMetodo] = useState('')
  const [estado, setEstado] = useState('')
  const [trabajador, setTrabajador] = useState('')
  const [tab, setTab] = useState<'ventas' | 'cuentas'>('ventas')
  const [verCuenta, setVerCuenta] = useState<Comprobante | null>(null)

  const rango = calcularRango(modo, ancla)
  const { desdeISO, hastaISO } = rangoAISO(rango)

  const historialQuery = useQuery({
    queryKey: ['ventas', 'historial', desdeISO, hastaISO],
    queryFn: () => fetchHistorialVentas(desdeISO, hastaISO),
  })
  const productosQuery = useQuery({ queryKey: queryKeyProductos, queryFn: cargarProductos })

  const nombreProducto = useMemo(() => {
    const mapa = new Map((productosQuery.data ?? []).map((p) => [p.id, p.nombre]))
    return (id: string) => mapa.get(id) ?? '—'
  }, [productosQuery.data])

  const comprobantes = useMemo(() => (historialQuery.data ? agrupar(historialQuery.data) : []), [historialQuery.data])

  // Ventas (mostrador y lavados) y cuentas a nombre de alguien se manejan por separado: no se
  // buscan, se cuentan ni se abren igual.
  const esCuenta = (c: Comprobante) => Boolean(c.ventas[0].cuentaId)
  const delTab = useMemo(
    () => comprobantes.filter((c) => (tab === 'cuentas') === esCuenta(c)),
    [comprobantes, tab],
  )
  const cuentasCount = comprobantes.filter(esCuenta).length
  const ventasCount = comprobantes.length - cuentasCount

  const trabajadores = useMemo(
    () => delTab.map((c) => c.cargadaA).filter((n): n is string => Boolean(n)),
    [delTab],
  )

  const filtrados = delTab.filter((c) => {
    if (metodo && c.ventas[0].metodoPago !== metodo) return false
    if (estado === 'activas' && c.anulada) return false
    if (estado === 'anuladas' && !c.anulada) return false
    if (trabajador && c.cargadaA !== trabajador) return false
    if (!busqueda.trim()) return true
    return (
      coincide(c.cliente, busqueda) ||
      coincide(c.cargadaA, busqueda) ||
      coincide(c.factura, busqueda) ||
      coincide(c.ventas[0].vendidoPor, busqueda) ||
      c.ventas.some((v) => coincide(nombreProducto(v.productoId), busqueda))
    )
  })

  const vigentes = delTab.filter((c) => !c.anulada)
  const totalVendido = vigentes.reduce((s, c) => s + c.total, 0)
  const totalCargado = vigentes.filter((c) => c.cargadaA).reduce((s, c) => s + c.total, 0)
  const anuladas = delTab.length - vigentes.length
  const activos = [busqueda, metodo, estado, trabajador].filter(Boolean).length

  return (
    <div className="flex flex-col gap-6 text-left">
      <PageHeader
        title="Historial de ventas"
        description="Qué se vendió en cualquier periodo, a quién y cómo se pagó."
        help={{
          body: 'Cada fila es un comprobante: un carrito de mostrador, una cuenta cerrada o los productos cobrados con un lavado. Toca una fila para ver los productos.\n\nLas ventas "cargadas a trabajador" no entraron plata: son consumo de nevera que quedó como deuda de esa persona (se ve en Dinero › Deudas).\n\nLa fecha es la del cobro, no la de cuando se metió el producto a la cuenta u orden. Lo que sigue en una cuenta abierta o una orden sin entregar todavía no aparece.',
        }}
        actions={<PeriodoSelector modo={modo} onModoChange={setModo} ancla={ancla} onAnclaChange={setAncla} rango={rango} />}
      />

      <div className="grid grid-cols-2 gap-1 rounded-xl bg-neutral-200/60 p-1 sm:w-fit">
        {(
          [
            { id: 'ventas', label: 'Ventas', count: ventasCount },
            { id: 'cuentas', label: 'Cuentas', count: cuentasCount },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              setTab(t.id)
              setTrabajador('')
            }}
            className={`rounded-lg px-5 py-2 text-sm font-medium transition-colors ${
              tab === t.id ? 'bg-white text-primary-700 shadow-sm' : 'text-neutral-500 hover:text-neutral-900'
            }`}
          >
            {t.label} <span className="text-neutral-400">{t.count}</span>
          </button>
        ))}
      </div>

      <div className={`grid grid-cols-2 gap-3 ${tab === 'cuentas' ? 'lg:grid-cols-4' : 'lg:grid-cols-3'}`}>
        <StatCard label={tab === 'cuentas' ? 'Total en cuentas' : 'Vendido'} value={COP.format(totalVendido)} icon={Receipt} />
        <StatCard label={tab === 'cuentas' ? 'Cuentas' : 'Ventas'} value={String(vigentes.length)} icon={ShoppingCart} />
        {tab === 'cuentas' ? (
          <StatCard label="Cargado a trabajadores" value={COP.format(totalCargado)} icon={UserRound} />
        ) : null}
        <StatCard label="Anuladas" value={String(anuladas)} icon={Ban} />
      </div>

      <BarraFiltros
        activos={activos}
        onLimpiar={() => {
          setBusqueda('')
          setMetodo('')
          setEstado('')
          setTrabajador('')
        }}
        resultado={`${filtrados.length} de ${delTab.length}`}
      >
        <FiltroBusqueda value={busqueda} onChange={setBusqueda} placeholder="Producto, cuenta, VTA-…" ancho="sm:w-64" />
        {tab === 'cuentas' ? (
          <FiltroCombo value={trabajador} onChange={setTrabajador} options={trabajadores} placeholder="Cargado a…" icon={UserRound} />
        ) : null}
        <FiltroMenu
          label="Pago"
          value={metodo}
          onChange={setMetodo}
          options={Object.entries(METODO_PAGO_LABEL).map(([value, label]) => ({ value, label }))}
        />
        <FiltroMenu
          label="Estado"
          value={estado}
          onChange={setEstado}
          options={[
            { value: 'activas', label: 'Activas' },
            { value: 'anuladas', label: 'Anuladas' },
          ]}
        />
      </BarraFiltros>

      {historialQuery.isError ? (
        <Card className="p-6 text-center text-sm text-danger-600">No se pudo cargar el historial de ventas.</Card>
      ) : historialQuery.isPending ? (
        <Card className="p-6 text-center text-sm text-neutral-400">Cargando…</Card>
      ) : filtrados.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 py-12 text-center">
          <span className="flex size-14 items-center justify-center rounded-2xl bg-neutral-100 text-neutral-400">
            <ShoppingCart size={26} />
          </span>
          <p className="text-sm text-neutral-500">
            {delTab.length === 0
              ? tab === 'cuentas'
                ? 'No hay cuentas cobradas o cargadas en este periodo.'
                : 'No hay ventas en este periodo.'
              : 'Nada coincide con los filtros.'}
          </p>
        </Card>
      ) : (
        <ul className="flex flex-col gap-2">
          {filtrados.map((c) => (
            <ComprobanteFila key={c.clave} comprobante={c} nombreProducto={nombreProducto} esAdmin={esAdmin} onVerCuenta={() => setVerCuenta(c)} />
          ))}
        </ul>
      )}

      {verCuenta?.cuenta ? (
        <CuentaDetalleModal
          cuenta={verCuenta.cuenta}
          cargadaA={verCuenta.cargadaA}
          nombreProducto={nombreProducto}
          esAdmin={esAdmin}
          onClose={() => setVerCuenta(null)}
        />
      ) : null}
    </div>
  )
}

function ComprobanteFila({
  comprobante: c,
  nombreProducto,
  esAdmin,
  onVerCuenta,
}: {
  comprobante: Comprobante
  nombreProducto: (id: string) => string
  esAdmin: boolean
  onVerCuenta: () => void
}) {
  const [abierta, setAbierta] = useState(false)
  // Una cuenta se abre en su propio modal (línea de tiempo + cada producto); el resto de ventas se
  // despliega en la misma fila.
  const abreModal = Boolean(c.cuenta)
  const primera = c.ventas[0]
  const motivoAnulacion = c.ventas.find((v) => v.motivoAnulacion)?.motivoAnulacion
  return (
    <li>
      <Card className={`p-0 ${c.anulada ? 'bg-neutral-50' : ''}`}>
        <button
          type="button"
          onClick={abreModal ? onVerCuenta : () => setAbierta((v) => !v)}
          aria-expanded={abreModal ? undefined : abierta}
          className="flex w-full items-center gap-3 p-3 text-left"
        >
          <span
            className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${
              c.anulada ? 'bg-danger-50 text-danger-600' : c.cargadaA ? 'bg-warning-50 text-warning-700' : 'bg-primary-50 text-primary-600'
            }`}
          >
            {c.anulada ? <Ban size={16} /> : c.cargadaA ? <UserRound size={16} /> : <ShoppingCart size={16} />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-neutral-900">
              {c.cliente}
              {c.cargadaA ? <span className="font-normal text-warning-700"> → cargada a {c.cargadaA}</span> : null}
            </span>
            <span className="block truncate text-xs text-neutral-400">
              <span className="font-mono">{c.factura}</span> · {FECHA_HORA.format(new Date(c.fecha))} · {c.ventas.length} producto
              {c.ventas.length === 1 ? '' : 's'}
            </span>
          </span>
          <span className="shrink-0 text-right">
            <span className={`block text-sm font-semibold ${c.anulada ? 'text-neutral-400 line-through' : 'text-neutral-900'}`}>
              {COP.format(c.total)}
            </span>
            <span className="block text-xs text-neutral-500">{METODO_PAGO_LABEL[primera.metodoPago]}</span>
          </span>
          {abreModal ? (
            <ChevronRight size={16} className="shrink-0 text-neutral-400" />
          ) : (
            <ChevronDown size={16} className={`shrink-0 text-neutral-400 transition-transform ${abierta ? 'rotate-180' : ''}`} />
          )}
        </button>

        {c.anulada ? (
          <p className="border-t border-danger-600/20 bg-danger-50 px-3 py-2 text-xs text-danger-700">
            Anulada{motivoAnulacion ? ` — ${motivoAnulacion}` : ''}
            {primera.anuladaPor ? ` · ${primera.anuladaPor}` : ''}
          </p>
        ) : null}

        {abierta && !abreModal ? (
          <div className="flex flex-col gap-2 border-t border-neutral-100 px-3 py-3">
            <ul className="flex flex-col divide-y divide-neutral-100 rounded-xl bg-neutral-50/70 px-3 text-xs">
              {c.ventas.map((v) => (
                <li key={v.id} className="flex items-center justify-between gap-2 py-2">
                  <span className="flex min-w-0 items-center gap-1.5 text-neutral-700">
                    <CupSoda size={12} className="shrink-0 text-neutral-400" />
                    <span className="truncate">
                      {nombreProducto(v.productoId)} <span className="text-neutral-400">×{v.cantidad}</span>
                    </span>
                  </span>
                  <span className="shrink-0 text-neutral-600">
                    <span className="mr-2 text-neutral-400">{COP.format(v.precioUnitario)} c/u</span>
                    {COP.format(v.total)}
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-xs text-neutral-500">
              Vendió {primera.vendidoPor}
              {c.detalle ? ` · ${c.detalle}` : ''}
              {esAdmin && c.aCosto ? ' · retiro a costo de gerencia' : ''}
            </p>
          </div>
        ) : null}
      </Card>
    </li>
  )
}
