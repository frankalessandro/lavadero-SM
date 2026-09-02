import type { ComponentType } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import {
  Droplets,
  Users,
  CircleParking,
  TrendingUp,
  TrendingDown,
  HandCoins,
  Ban,
  ArrowRight,
  Wallet,
  Banknote,
  Clock,
  CheckCircle2,
  Lock,
  LockOpen,
  Sparkles,
  Receipt,
  ShieldCheck,
} from 'lucide-react'
import { fetchOrdenesHoy, fetchOrdenesEntregadasHoy } from '../../data/ordenes'
import { fetchLavadores } from '../../data/lavadores'
import { fetchResumenHoy } from '../../data/estanciasParqueadero'
import { fetchGastos, fetchTotalGastosPorCategoria } from '../../data/gastos'
import { fetchComisionesPendientes } from '../../data/liquidaciones'
import { fetchComisionesPendientesJefeZona } from '../../data/liquidacionesJefeZona'
import { fetchVentasHoy, fetchCostoMercanciaVendida } from '../../data/ventas'
import { fetchPagosHoy } from '../../data/pagos'
import { fetchTurnoAbierto } from '../../data/turnos'
import { fetchRentabilidadEnRango } from '../../data/rentabilidad'
import type { MetodoPagoBase } from '../../schemas/orden'
import type { TurnoCaja } from '../../schemas/turnoCaja'
import { StatCard } from '../../components/layout/StatCard'
import { Card } from '../../components/layout/Card'
import { BarChart } from '../../components/layout/BarChart'
import { KpiCard } from '../../components/layout/KpiCard'
import { calcularDelta } from '../../lib/kpi'
import { CHART_COLORS } from '../../lib/chartTheme'
import { fechaLocalISO } from '../../lib/periodo'

function hoyISO(): string {
  return fechaLocalISO(new Date())
}

function hace(dias: number): string {
  const d = new Date()
  d.setDate(d.getDate() - dias)
  return fechaLocalISO(d)
}

async function loadDashboard() {
  const hoy = hoyISO()
  const [
    ordenesHoy,
    entregadasHoy,
    lavadores,
    resumenParqueadero,
    gastosHoy,
    totalesPorCategoria,
    comisionesPendientes,
    comisionesPendientesJefeZona,
    ventasHoy,
    pagosHoy,
    // Una sola llamada cubre dos cosas: la tendencia de los últimos 7 días y los totales de AYER
    // para los indicadores ▲▼ de la banda de KPIs.
    ultimos7,
    turnoJefeZona,
    turnoVigilante,
  ] = await Promise.all([
    fetchOrdenesHoy(),
    fetchOrdenesEntregadasHoy(),
    fetchLavadores(),
    fetchResumenHoy(),
    fetchGastos(hoy, hoy),
    fetchTotalGastosPorCategoria(hoy, hoy),
    fetchComisionesPendientes(),
    fetchComisionesPendientesJefeZona(),
    fetchVentasHoy(),
    fetchPagosHoy(),
    fetchRentabilidadEnRango(hace(6), hoy),
    fetchTurnoAbierto('jefe_zona'),
    fetchTurnoAbierto('vigilante'),
  ])
  // Depende de las ventas activas del día, así que no puede ir en el Promise.all de arriba: el
  // costo se busca por los ids de esas ventas (una sola query, no una por venta).
  const costoMercancia = await fetchCostoMercanciaVendida(
    ventasHoy.filter((v) => v.estado === 'activa').map((v) => v.id),
  )
  return {
    ordenesHoy,
    entregadasHoy,
    lavadores,
    resumenParqueadero,
    gastosHoy,
    totalesPorCategoria,
    comisionesPendientes,
    comisionesPendientesJefeZona,
    ventasHoy,
    pagosHoy,
    costoMercancia,
    ultimos7,
    turnoJefeZona,
    turnoVigilante,
  }
}

export const Route = createFileRoute('/admin/')({
  loader: loadDashboard,
  component: AdminDashboard,
})

const COP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })
const PCT = (n: number) => `${n.toFixed(1)}%`
const FECHA_HOY = new Intl.DateTimeFormat('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })
const DIA_CORTO = new Intl.DateTimeFormat('es-CO', { weekday: 'short', day: 'numeric' })
const HORA = new Intl.DateTimeFormat('es-CO', { hour: 'numeric', minute: '2-digit' })

function dateFromISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function AdminDashboard() {
  const {
    ordenesHoy,
    entregadasHoy,
    lavadores,
    resumenParqueadero,
    gastosHoy,
    totalesPorCategoria,
    comisionesPendientes,
    comisionesPendientesJefeZona,
    ventasHoy,
    pagosHoy,
    costoMercancia,
    ultimos7,
    turnoJefeZona,
    turnoVigilante,
  } = Route.useLoaderData()
  const lavadoresActivos = lavadores.filter((l) => l.activo).length
  const anuladasHoy = ordenesHoy.filter((o) => o.estado === 'anulada')
  const ventasActivasHoy = ventasHoy.filter((v) => v.estado === 'activa')

  // Solo lo cobrado hoy (estado entregado) cuenta como ingreso — un vehículo en proceso o
  // listo todavía no ha entrado dinero a caja por él, aunque ya tenga precio fijado. Neto del
  // descuento (0037): el negocio absorbe la rebaja, así que el ingreso real del lavado es
  // `precio − descuento`. Las comisiones NO se tocan (siguen sobre `precio` de lista).
  const descuentosHoy = entregadasHoy.reduce((total, o) => total + o.descuento, 0)
  const ingresosLavadero = entregadasHoy.reduce((total, o) => total + o.precio - o.descuento, 0)
  const ingresosParqueadero = resumenParqueadero.dineroHoy
  const ingresosVentas = ventasActivasHoy.reduce((total, v) => total + v.total, 0)
  const ingresosTotales = ingresosLavadero + ingresosParqueadero + ingresosVentas

  // Ingresos por método reales = suma de las LÍNEAS DE PAGO vigentes (tabla `pagos`, 0036), no la
  // columna-resumen `metodo_pago` — un cobro repartido tiene parte en efectivo y parte no. Se
  // separan lavados (pagos con ordenId) de ventas de mostrador (pagos con ventaGrupoId).
  const pagosVigentesHoy = pagosHoy.filter((p) => !p.anulado)
  const ingresosPorMetodo = pagosVigentesHoy.reduce(
    (acc, p) => {
      if (p.ordenId) acc[p.metodoPago] += p.monto
      return acc
    },
    { efectivo: 0, transferencia: 0, datafono: 0 } as Record<MetodoPagoBase, number>,
  )

  const ventasPorMetodo = pagosVigentesHoy.reduce(
    (acc, p) => {
      if (p.ventaGrupoId) acc[p.metodoPago] += p.monto
      return acc
    },
    { efectivo: 0, transferencia: 0, datafono: 0 } as Record<MetodoPagoBase, number>,
  )

  const totalGastosHoy = gastosHoy.reduce((total, g) => total + g.monto, 0)
  const comisionesHoy = entregadasHoy.reduce((total, o) => total + o.comisionLavador, 0)
  const comisionesJefeZonaHoy = entregadasHoy.reduce((total, o) => total + o.comisionJefeZona, 0)
  const utilidadNetaHoy = ingresosTotales - comisionesHoy - comisionesJefeZonaHoy - costoMercancia.costo - totalGastosHoy
  const totalComisionesPendientes = comisionesPendientes.reduce((total, c) => total + c.montoPendiente, 0)
  const totalComisionesPendientesJefeZona = comisionesPendientesJefeZona.reduce((total, c) => total + c.montoPendiente, 0)

  // Una sola tabla línea × método reemplaza las dos tarjetas que había antes ("por método de
  // pago" y "por línea de negocio"): eran el mismo total partido de dos formas, y ambas repetían
  // la fila de parqueadero. Parqueadero no distingue método (fetchResumenHoy solo da el total),
  // por eso va con "—" en esas columnas en vez de inventar un reparto.
  const filasIngresos = [
    {
      linea: 'Lavadero',
      efectivo: ingresosPorMetodo.efectivo,
      transferencia: ingresosPorMetodo.transferencia,
      datafono: ingresosPorMetodo.datafono,
      total: ingresosLavadero,
    },
    {
      linea: 'Ventas de productos',
      efectivo: ventasPorMetodo.efectivo,
      transferencia: ventasPorMetodo.transferencia,
      datafono: ventasPorMetodo.datafono,
      total: ingresosVentas,
    },
    { linea: 'Parqueadero', efectivo: undefined, transferencia: undefined, datafono: undefined, total: ingresosParqueadero },
  ]
  const totalEfectivo = ingresosPorMetodo.efectivo + ventasPorMetodo.efectivo
  const totalTransferencia = ingresosPorMetodo.transferencia + ventasPorMetodo.transferencia
  const totalDatafono = ingresosPorMetodo.datafono + ventasPorMetodo.datafono

  // --- Contexto: ayer y últimos 7 días ---
  // `ultimos7.porDia` solo trae días CON movimiento, así que se rellena la serie completa para que
  // un día muerto se vea como barra en cero y no desaparezca del eje.
  const hoy = hoyISO()
  const porDiaMap = new Map(ultimos7.porDia.map((d) => [d.fecha, d] as const))
  const serie7 = Array.from({ length: 7 }, (_, i) => {
    const fecha = hace(6 - i)
    const d = porDiaMap.get(fecha)
    return {
      fecha,
      esHoy: fecha === hoy,
      ingresos: d ? d.ingresosLavadero + d.ingresosParqueadero + d.ingresosVentas : 0,
      utilidad: d?.utilidadNeta ?? 0,
    }
  })
  const ayer = porDiaMap.get(hace(1))
  const ingresosAyer = ayer ? ayer.ingresosLavadero + ayer.ingresosParqueadero + ayer.ingresosVentas : 0
  const utilidadAyer = ayer?.utilidadNeta ?? 0
  const margenHoy = ingresosTotales > 0 ? (utilidadNetaHoy / ingresosTotales) * 100 : 0

  // --- Flujo del día: en qué estado están los vehículos de hoy ---
  const enProceso = ordenesHoy.filter((o) => o.estado === 'en_proceso').length
  const listos = ordenesHoy.filter((o) => o.estado === 'listo').length
  const entregados = ordenesHoy.filter((o) => o.estado === 'entregado').length
  const totalFlujo = enProceso + listos + entregados
  const flujo = [
    { label: 'En proceso', valor: enProceso, clase: 'bg-warning-600', texto: 'text-warning-700', icon: Clock },
    { label: 'Listos', valor: listos, clase: 'bg-primary-500', texto: 'text-primary-700', icon: Sparkles },
    { label: 'Entregados', valor: entregados, clase: 'bg-success-600', texto: 'text-success-700', icon: CheckCircle2 },
  ]

  // --- Ritmo del día: ingreso de lavado por hora de entrega ---
  const porHoraMap = new Map<number, number>()
  for (const o of entregadasHoy) {
    if (!o.entregadaEn) continue
    const h = new Date(o.entregadaEn).getHours()
    porHoraMap.set(h, (porHoraMap.get(h) ?? 0) + o.precio - o.descuento)
  }
  const horas = Array.from(porHoraMap.keys()).sort((a, b) => a - b)
  const ritmo =
    horas.length > 0
      ? Array.from({ length: horas[horas.length - 1] - horas[0] + 1 }, (_, i) => {
          const h = horas[0] + i
          return { hora: h, valor: porHoraMap.get(h) ?? 0 }
        })
      : []
  const horaPico = ritmo.length > 0 ? ritmo.reduce((a, b) => (b.valor > a.valor ? b : a)) : null

  // --- Producción por lavador hoy (lavados entregados, no comisión: eso vive en Rentabilidad) ---
  const nombrePorLavador = new Map(lavadores.map((l) => [l.id, l.nombre] as const))
  const produccionMap = new Map<string, number>()
  for (const o of entregadasHoy) {
    for (const id of [o.lavadorId, o.lavadorId2]) {
      if (!id) continue
      produccionMap.set(id, (produccionMap.get(id) ?? 0) + 1)
    }
  }
  const produccion = Array.from(produccionMap.entries())
    .map(([id, cantidad]) => ({ nombre: nombrePorLavador.get(id) ?? '—', cantidad }))
    .sort((a, b) => b.cantidad - a.cantidad)

  const egresosHoy = comisionesHoy + comisionesJefeZonaHoy + costoMercancia.costo + totalGastosHoy
  const cascada = [
    { label: 'Lavadero', valor: ingresosLavadero, tipo: 'ingreso' as const },
    { label: 'Parqueadero', valor: ingresosParqueadero, tipo: 'ingreso' as const },
    { label: 'Venta de productos', valor: ingresosVentas, tipo: 'ingreso' as const },
    { label: 'Comisión de lavadores', valor: comisionesHoy, tipo: 'egreso' as const },
    { label: 'Comisión de jefe de patio', valor: comisionesJefeZonaHoy, tipo: 'egreso' as const },
    { label: 'Costo de productos vendidos', valor: costoMercancia.costo, tipo: 'egreso' as const },
    { label: 'Gastos', valor: totalGastosHoy, tipo: 'egreso' as const },
  ]


  return (
    <div className="flex flex-col gap-8">
      {/* Encabezado + estado de las dos cajas */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold capitalize text-neutral-900">Hoy · {FECHA_HOY.format(new Date())}</h2>
          <p className="mt-1 text-sm text-neutral-500">
            El pulso del día: qué está pasando ahora, cuánto entró y cómo va contra ayer.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ChipCaja label="Caja jefe de zona" turno={turnoJefeZona} />
          <ChipCaja label="Caja vigilante" turno={turnoVigilante} />
          <Link
            to="/admin/operacion/turnos"
            className="flex items-center gap-1 text-xs font-medium text-primary-600 transition-colors hover:text-primary-700"
          >
            Turnos <ArrowRight size={13} />
          </Link>
        </div>
      </div>

      {/* Banda de KPIs — contra ayer */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Utilidad del día"
          valor={COP.format(utilidadNetaHoy)}
          tono={utilidadNetaHoy >= 0 ? 'verde' : 'rojo'}
          icon={utilidadNetaHoy >= 0 ? TrendingUp : TrendingDown}
          delta={calcularDelta(utilidadNetaHoy, utilidadAyer, 'mayor-mejor', COP.format, 'vs. ayer')}
          sinComparacionLabel="sin movimiento ayer para comparar"
        />
        <KpiCard
          label="Ingresos del día"
          valor={COP.format(ingresosTotales)}
          tono="neutro"
          icon={Wallet}
          delta={calcularDelta(ingresosTotales, ingresosAyer, 'mayor-mejor', COP.format, 'vs. ayer')}
          sinComparacionLabel="sin movimiento ayer para comparar"
        />
        <KpiCard
          label="Lavados entregados"
          valor={String(entregadasHoy.length)}
          tono="neutro"
          icon={Droplets}
          sinComparacionLabel={`${enProceso + listos} todavía en el patio · margen ${PCT(margenHoy)}`}
        />
        <KpiCard
          label="Efectivo recibido hoy"
          valor={COP.format(totalEfectivo)}
          tono="neutro"
          icon={Banknote}
          sinComparacionLabel="lavados + productos, sin parqueadero"
        />
      </div>

      {/* Flujo del día */}
      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold text-neutral-900">Flujo del día</h3>
        <Card className="p-0">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto]">
            <div className="p-5">
              {totalFlujo > 0 ? (
                <>
                  <div className="flex h-3 w-full overflow-hidden rounded-full bg-neutral-100">
                    {flujo
                      .filter((f) => f.valor > 0)
                      .map((f) => (
                        <div
                          key={f.label}
                          className={f.clase}
                          style={{ width: `${(f.valor / totalFlujo) * 100}%` }}
                          title={`${f.label}: ${f.valor}`}
                        />
                      ))}
                  </div>
                  <ul className="mt-4 grid grid-cols-3 gap-3">
                    {flujo.map((f) => (
                      <li key={f.label} className="flex items-center gap-2.5">
                        <span className={`size-2.5 shrink-0 rounded-full ${f.clase}`} />
                        <span className="min-w-0">
                          <span className={`block text-xl font-semibold tabular-nums ${f.texto}`}>{f.valor}</span>
                          <span className="block truncate text-xs text-neutral-500">{f.label}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="py-6 text-center text-sm text-neutral-400">
                  Todavía no se ha registrado ningún vehículo hoy.
                </p>
              )}
            </div>
            <div className="grid grid-cols-3 gap-px border-t border-neutral-100 bg-neutral-100 lg:grid-cols-1 lg:border-l lg:border-t-0">
              <MiniDato icon={Users} label="Lavadores activos" valor={String(lavadoresActivos)} />
              <MiniDato icon={CircleParking} label="En parqueadero" valor={String(resumenParqueadero.vehiculosAdentro)} />
              <MiniDato
                icon={Ban}
                label="Anulaciones"
                valor={String(anuladasHoy.length)}
                alerta={anuladasHoy.length > 0}
                to="/admin/operacion/ordenes"
              />
            </div>
          </div>
        </Card>
      </section>

      {/* Dinero de hoy */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-neutral-900">Dinero de hoy</h3>
          <Link
            to="/admin/rentabilidad"
            className="flex items-center gap-1 text-xs font-medium text-primary-600 transition-colors hover:text-primary-700"
          >
            Ver rentabilidad <ArrowRight size={13} />
          </Link>
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card className="text-left">
            <h4 className="mb-3 text-sm font-semibold text-neutral-900">Ingresos por línea y método</h4>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-neutral-200 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
                    <th className="py-2 text-left">Línea</th>
                    <th className="py-2 text-right">Efectivo</th>
                    <th className="py-2 text-right">Transfer.</th>
                    <th className="py-2 text-right">Datáfono</th>
                    <th className="py-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {filasIngresos.map((fila) => (
                    <tr key={fila.linea} className="border-b border-neutral-100 last:border-0">
                      <td className="py-2.5 text-neutral-500">{fila.linea}</td>
                      <td className="py-2.5 text-right tabular-nums text-neutral-700">
                        {fila.efectivo === undefined ? (
                          <span className="text-neutral-300">—</span>
                        ) : (
                          COP.format(fila.efectivo)
                        )}
                      </td>
                      <td className="py-2.5 text-right tabular-nums text-neutral-700">
                        {fila.transferencia === undefined ? (
                          <span className="text-neutral-300">—</span>
                        ) : (
                          COP.format(fila.transferencia)
                        )}
                      </td>
                      <td className="py-2.5 text-right tabular-nums text-neutral-700">
                        {fila.datafono === undefined ? (
                          <span className="text-neutral-300">—</span>
                        ) : (
                          COP.format(fila.datafono)
                        )}
                      </td>
                      <td className="py-2.5 text-right font-medium tabular-nums text-neutral-900">
                        {COP.format(fila.total)}
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-neutral-200 font-semibold">
                    <td className="py-2.5 text-neutral-700">Total</td>
                    <td className="py-2.5 text-right tabular-nums text-neutral-900">{COP.format(totalEfectivo)}</td>
                    <td className="py-2.5 text-right tabular-nums text-neutral-900">{COP.format(totalTransferencia)}</td>
                    <td className="py-2.5 text-right tabular-nums text-neutral-900">{COP.format(totalDatafono)}</td>
                    <td className="py-2.5 text-right tabular-nums text-neutral-900">{COP.format(ingresosTotales)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-neutral-400">
              El parqueadero no registra método de pago todavía, por eso su valor solo aparece en la columna Total.
              Datáfono muestra el monto bruto cobrado — cuánto llega neto a la cuenta no está configurado.
            </p>
          </Card>

          <Card className="p-0">
            <h4 className="px-5 pt-5 text-sm font-semibold text-neutral-900">Resultado del día</h4>
            <div className="mt-2">
              {cascada.map((c) => (
                <FilaResultado
                  key={c.label}
                  label={c.label}
                  valor={c.valor}
                  pct={ingresosTotales > 0 ? (c.valor / ingresosTotales) * 100 : 0}
                  tipo={c.tipo}
                />
              ))}
            </div>
            <div className="mt-2 flex flex-col gap-1.5 border-t border-neutral-100 px-5 py-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-neutral-500">Ingresos</span>
                <span className="font-medium tabular-nums text-neutral-900">{COP.format(ingresosTotales)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-neutral-500">Egresos</span>
                <span className="font-medium tabular-nums text-danger-600">− {COP.format(egresosHoy)}</span>
              </div>
            </div>
            <div className="p-3">
              <div
                className={`flex items-end justify-between gap-3 rounded-xl border p-4 ${
                  utilidadNetaHoy >= 0 ? 'border-success-600/25 bg-success-50' : 'border-danger-600/25 bg-danger-50'
                }`}
              >
                <div>
                  <span
                    className={`text-[11px] font-semibold uppercase tracking-[0.14em] ${
                      utilidadNetaHoy >= 0 ? 'text-success-700' : 'text-danger-700'
                    }`}
                  >
                    Queda
                  </span>
                  <p className="mt-1 text-sm font-medium text-neutral-600">Utilidad neta de hoy</p>
                </div>
                <div className="text-right">
                  <p
                    className={`text-2xl font-semibold tracking-tight tabular-nums ${
                      utilidadNetaHoy >= 0 ? 'text-success-700' : 'text-danger-600'
                    }`}
                  >
                    {COP.format(utilidadNetaHoy)}
                  </p>
                  <p className="text-xs tabular-nums text-neutral-500">margen {PCT(margenHoy)}</p>
                </div>
              </div>
            </div>
            <p className="px-5 pb-5 text-xs leading-relaxed text-neutral-400">
              Aproximado: no descuenta el consumo de insumos de lavado ni refleja el arqueo real de caja.
              {descuentosHoy > 0 ? ` Incluye ${COP.format(descuentosHoy)} en descuentos absorbidos por el negocio.` : ''}
              {costoMercancia.ventasSinCosto > 0 ? (
                <span className="text-warning-600">
                  {' '}
                  {costoMercancia.ventasSinCosto === 1
                    ? '1 venta de hoy no tiene costo registrado'
                    : `${costoMercancia.ventasSinCosto} ventas de hoy no tienen costo registrado`}
                  , así que la utilidad sale algo más alta de lo real.
                </span>
              ) : null}
            </p>
          </Card>
        </div>
      </section>

      {/* Últimos 7 días */}
      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold text-neutral-900">Últimos 7 días</h3>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card className="text-left">
            <h4 className="mb-3 text-sm font-semibold text-neutral-900">Ingresos por día</h4>
            <BarChart
              horizontal={false}
              labels={serie7.map((d) => DIA_CORTO.format(dateFromISO(d.fecha)))}
              data={serie7.map((d) => d.ingresos)}
              colors={serie7.map((d) => (d.esHoy ? CHART_COLORS.primary : CHART_COLORS.primarySoft))}
              valueFormatter={COP.format}
              height={200}
            />
            <p className="mt-2 text-xs text-neutral-400">La barra oscura es hoy.</p>
          </Card>
          <Card className="text-left">
            <h4 className="mb-3 text-sm font-semibold text-neutral-900">Utilidad por día</h4>
            <BarChart
              horizontal={false}
              labels={serie7.map((d) => DIA_CORTO.format(dateFromISO(d.fecha)))}
              data={serie7.map((d) => d.utilidad)}
              colors={serie7.map((d) => (d.utilidad >= 0 ? CHART_COLORS.success : CHART_COLORS.danger))}
              valueFormatter={COP.format}
              height={200}
            />
            <p className="mt-2 text-xs text-neutral-400">Verde si el día dejó utilidad, rojo si dio pérdida.</p>
          </Card>
        </div>
      </section>

      {/* Ritmo del día + producción por lavador */}
      {ritmo.length > 2 || produccion.length > 2 ? (
        <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {ritmo.length > 2 ? (
            <Card className="text-left">
              <div className="mb-3 flex items-baseline justify-between gap-2">
                <h4 className="text-sm font-semibold text-neutral-900">Ritmo del día</h4>
                {horaPico ? (
                  <span className="text-xs text-neutral-400">
                    pico a las {horaPico.hora}:00 · {COP.format(horaPico.valor)}
                  </span>
                ) : null}
              </div>
              <BarChart
                horizontal={false}
                labels={ritmo.map((r) => `${r.hora}:00`)}
                data={ritmo.map((r) => r.valor)}
                valueFormatter={COP.format}
                height={200}
              />
              <p className="mt-2 text-xs text-neutral-400">
                Ingreso de lavado según la hora en que se entregó el vehículo.
              </p>
            </Card>
          ) : null}
          {produccion.length > 2 ? (
            <Card className="text-left">
              <h4 className="mb-3 text-sm font-semibold text-neutral-900">Lavados por lavador hoy</h4>
              <BarChart
                labels={produccion.map((p) => p.nombre)}
                data={produccion.map((p) => p.cantidad)}
                valueFormatter={(n) => `${n}`}
                height={Math.max(140, produccion.length * 38)}
              />
              <p className="mt-2 text-xs text-neutral-400">
                Vehículos entregados; una orden lavada entre dos cuenta para ambos.
              </p>
            </Card>
          ) : null}
        </section>
      ) : null}

      {/* Pendiente por pagar + gastos de hoy */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-neutral-900">Pendiente por pagar</h3>
            <Link
              to="/admin/dinero/liquidaciones"
              className="flex items-center gap-1 text-xs font-medium text-primary-600 transition-colors hover:text-primary-700"
            >
              Ir a liquidaciones <ArrowRight size={13} />
            </Link>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <StatCard
              label="Comisiones de lavadores"
              value={COP.format(totalComisionesPendientes)}
              hint={`${COP.format(comisionesHoy)} generadas hoy`}
              icon={HandCoins}
              info={{
                title: 'Comisiones de lavadores pendientes',
                description:
                  'Acumulado total sin liquidar, sin importar de qué día venga. Cuenta el trabajo hecho aunque el lavado siga en curso o el cliente no haya pagado todavía, porque la comisión queda fija desde que se crea la orden. Solo se excluyen las órdenes anuladas.',
              }}
            />
            <StatCard
              label="Comisión de jefe de patio"
              value={COP.format(totalComisionesPendientesJefeZona)}
              hint={`${COP.format(comisionesJefeZonaHoy)} generadas hoy`}
              icon={ShieldCheck}
              info={{
                title: 'Comisión de jefe de patio pendiente',
                description:
                  'Porcentaje de cada orden para quien estaba a cargo del turno de recepción cuando se registró el vehículo. El porcentaje se ajusta en Configuración y se liquida aparte de la de los lavadores.',
              }}
            />
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-neutral-900">Gastos de hoy por categoría</h3>
            <Link
              to="/admin/dinero/gastos"
              className="flex items-center gap-1 text-xs font-medium text-primary-600 transition-colors hover:text-primary-700"
            >
              Ir a gastos <ArrowRight size={13} />
            </Link>
          </div>
          {totalesPorCategoria.length === 0 ? (
            <Card className="flex flex-1 items-center justify-center p-6 text-center text-sm text-neutral-400">
              <span>
                <Receipt size={18} className="mx-auto mb-2 text-neutral-300" />
                Sin gastos cargados hoy — la utilidad de arriba no descuenta costos fijos.
              </span>
            </Card>
          ) : (
            <Card className="text-left">
              {totalesPorCategoria.length > 2 ? (
                <BarChart
                  labels={totalesPorCategoria.map((t) => t.categoriaNombre)}
                  data={totalesPorCategoria.map((t) => t.total)}
                  color={CHART_COLORS.danger}
                  valueFormatter={COP.format}
                  height={Math.max(120, totalesPorCategoria.length * 40)}
                />
              ) : (
                <ul className="flex flex-col gap-2 text-sm">
                  {totalesPorCategoria.map((t) => (
                    <li key={t.categoriaId} className="flex items-center justify-between">
                      <span className="text-neutral-500">{t.categoriaNombre}</span>
                      <span className="font-medium tabular-nums text-danger-600">{COP.format(t.total)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}
        </div>
      </section>
    </div>
  )
}

// --- Piezas locales del dashboard ---

// Chip de estado de una caja: verde con responsable si hay turno abierto, ámbar si no.
function ChipCaja({ label, turno }: { label: string; turno: TurnoCaja | undefined }) {
  const abierta = Boolean(turno)
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium ${
        abierta
          ? 'border-success-600/25 bg-success-50 text-success-700'
          : 'border-warning-600/25 bg-warning-50 text-warning-700'
      }`}
      title={
        turno
          ? `${turno.responsableActual} · abierta ${HORA.format(new Date(turno.abiertoEn))}`
          : 'No hay turno de caja abierto'
      }
    >
      {abierta ? <LockOpen size={13} /> : <Lock size={13} />}
      {label}
      <span className="font-normal opacity-80">{turno ? `· ${turno.responsableActual}` : '· cerrada'}</span>
    </span>
  )
}

// Cifra de contexto al costado del flujo del día. Con `to` se vuelve enlace.
function MiniDato({
  icon: Icon,
  label,
  valor,
  alerta,
  to,
}: {
  icon: ComponentType<{ size?: number; strokeWidth?: number }>
  label: string
  valor: string
  alerta?: boolean
  to?: string
}) {
  const contenido = (
    <>
      <span
        className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${
          alerta ? 'bg-danger-50 text-danger-600' : 'bg-neutral-100 text-neutral-500'
        }`}
      >
        <Icon size={15} strokeWidth={2} />
      </span>
      <span className="min-w-0">
        <span className={`block text-lg font-semibold tabular-nums ${alerta ? 'text-danger-600' : 'text-neutral-900'}`}>
          {valor}
        </span>
        <span className="block truncate text-[11px] text-neutral-500">{label}</span>
      </span>
    </>
  )
  const clases = 'flex items-center gap-2.5 bg-white px-4 py-3 lg:min-w-[11rem]'
  if (to) {
    return (
      <Link to={to} className={`${clases} transition-colors hover:bg-primary-50/50`}>
        {contenido}
      </Link>
    )
  }
  return <div className={clases}>{contenido}</div>
}

// Fila de la cascada compacta del "Resultado del día" — mismo recurso visual que la cascada de
// /admin/rentabilidad (barra cuyo ancho es el peso de la línea sobre los ingresos), pero sin
// modales: el detalle fila a fila vive allá, acá solo se muestra la forma del día.
function FilaResultado({
  label,
  valor,
  pct,
  tipo,
}: {
  label: string
  valor: number
  pct: number
  tipo: 'ingreso' | 'egreso'
}) {
  const esEgreso = tipo === 'egreso'
  const vacio = valor === 0
  return (
    <div className="px-5 py-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="truncate text-sm text-neutral-600">{label}</span>
        <span
          className={`shrink-0 text-sm font-semibold tabular-nums ${
            vacio ? 'text-neutral-400' : esEgreso ? 'text-danger-600' : 'text-neutral-900'
          }`}
        >
          {esEgreso && !vacio ? `− ${COP.format(valor)}` : COP.format(valor)}
        </span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-neutral-100">
        <div
          className={`h-full rounded-full ${esEgreso ? 'bg-danger-600' : 'bg-primary-500'}`}
          style={{ width: `${Math.min(100, Math.max(pct > 0 ? 1.5 : 0, pct))}%` }}
        />
      </div>
    </div>
  )
}
