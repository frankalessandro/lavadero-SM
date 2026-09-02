import { useEffect, useMemo, useState, type ComponentType, type ReactNode } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import {
  TrendingUp,
  TrendingDown,
  ArrowRight,
  ChevronRight,
  Wallet,
  Coins,
  Droplets,
  CircleParking,
  ShoppingBasket,
  Users,
  ShieldCheck,
  Package,
  Receipt,
  CalendarDays,
  Sparkles,
} from 'lucide-react'
import {
  fetchRentabilidad,
  type RentabilidadReporte,
  type RentabilidadDia,
  type RentabilidadTotales,
} from '../../../data/rentabilidad'
import { PeriodoSelector } from '../../../components/layout/PeriodoSelector'
import { calcularRango, lunesDeLaSemana, fechaLocalISO, type ModoPeriodo } from '../../../lib/periodo'
import { Card } from '../../../components/layout/Card'
import { StatCard } from '../../../components/layout/StatCard'
import { KpiCard } from '../../../components/layout/KpiCard'
import { calcularDelta } from '../../../lib/kpi'
import { BarChart } from '../../../components/layout/BarChart'
import { CHART_COLORS } from '../../../lib/chartTheme'
import { TablaDetalleModal, type ColumnaDetalle } from '../../../components/layout/TablaDetalleModal'

const COP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })
const PCT = (n: number) => `${n.toFixed(1)}%`
const FECHA_LARGA = new Intl.DateTimeFormat('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })
const FECHA_CORTA = new Intl.DateTimeFormat('es-CO', { weekday: 'short', day: 'numeric', month: 'short' })
const FECHA_HORA = new Intl.DateTimeFormat('es-CO', { dateStyle: 'short', timeStyle: 'short' })

function dateFromISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

async function loadRentabilidad() {
  const rango = calcularRango('semana', new Date())
  const reporte = await fetchRentabilidad(rango.periodoInicio, rango.periodoFin)
  return { reporte }
}

export const Route = createFileRoute('/admin/rentabilidad/')({
  loader: loadRentabilidad,
  component: RentabilidadPage,
})

type ModalTipo =
  | 'lavadero'
  | 'parqueadero'
  | 'productos'
  | 'comLavadores'
  | 'comJefe'
  | 'costo'
  | 'gastos'
  | 'dia'

function RentabilidadPage() {
  const initial = Route.useLoaderData()
  const [reporte, setReporte] = useState<RentabilidadReporte>(initial.reporte)
  const [modoPeriodo, setModoPeriodo] = useState<ModoPeriodo>('semana')
  const [anclaPeriodo, setAnclaPeriodo] = useState(() => new Date())
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [modal, setModal] = useState<{ tipo: ModalTipo; dia?: RentabilidadDia } | null>(null)
  const rango = calcularRango(modoPeriodo, anclaPeriodo)

  function cambiarModoPeriodo(modo: ModoPeriodo) {
    setCargando(true)
    setModoPeriodo(modo)
  }
  function cambiarAnclaPeriodo(ancla: Date) {
    setCargando(true)
    setAnclaPeriodo(ancla)
  }

  useEffect(() => {
    let cancelado = false
    fetchRentabilidad(rango.periodoInicio, rango.periodoFin)
      .then((r) => {
        if (!cancelado) {
          setReporte(r)
          setError(null)
        }
      })
      .catch((err) => {
        if (!cancelado) setError(err instanceof Error ? err.message : 'No se pudo cargar la rentabilidad')
      })
      .finally(() => {
        if (!cancelado) setCargando(false)
      })
    return () => {
      cancelado = true
    }
  }, [rango.periodoInicio, rango.periodoFin])

  const { porDia, totales, comparativa } = reporte
  const ingresosTotales = totales.ingresosLavadero + totales.ingresosParqueadero + totales.ingresosVentas
  const egresosTotales = totales.comisionLavadores + totales.comisionJefeZona + totales.costoMercancia + totales.gastos
  const ingresosPrev = comparativa.ingresosLavadero + comparativa.ingresosParqueadero + comparativa.ingresosVentas
  const egresosPrev =
    comparativa.comisionLavadores + comparativa.comisionJefeZona + comparativa.costoMercancia + comparativa.gastos

  // Agrupado por semana ISO — solo tiene sentido cuando el rango abarca más de una semana.
  const porSemana = useMemo(() => {
    const map = new Map<string, RentabilidadTotales & { semana: string; label: string }>()
    for (const d of porDia) {
      const lunes = lunesDeLaSemana(dateFromISO(d.fecha))
      const key = fechaLocalISO(lunes)
      let v = map.get(key)
      if (!v) {
        const domingo = new Date(lunes)
        domingo.setDate(domingo.getDate() + 6)
        v = {
          semana: key,
          label: `${FECHA_CORTA.format(lunes)} – ${FECHA_CORTA.format(domingo)}`,
          ingresosLavadero: 0,
          ingresosParqueadero: 0,
          ingresosVentas: 0,
          descuentos: 0,
          comisionLavadores: 0,
          comisionJefeZona: 0,
          costoMercancia: 0,
          gastos: 0,
          utilidadNeta: 0,
          margen: 0,
          ventasSinCosto: 0,
        }
        map.set(key, v)
      }
      v.ingresosLavadero += d.ingresosLavadero
      v.ingresosParqueadero += d.ingresosParqueadero
      v.ingresosVentas += d.ingresosVentas
      v.comisionLavadores += d.comisionLavadores
      v.comisionJefeZona += d.comisionJefeZona
      v.costoMercancia += d.costoMercancia
      v.gastos += d.gastos
      v.utilidadNeta += d.utilidadNeta
    }
    return Array.from(map.values())
      .map((v) => {
        const ing = v.ingresosLavadero + v.ingresosParqueadero + v.ingresosVentas
        return { ...v, margen: ing > 0 ? (v.utilidadNeta / ing) * 100 : 0 }
      })
      .sort((a, b) => a.semana.localeCompare(b.semana))
  }, [porDia])

  return (
    <div className="flex flex-col gap-8 text-left">
      {/* Encabezado */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-neutral-900">Rentabilidad del negocio</h2>
            <p className="mt-1 max-w-2xl text-sm text-neutral-500">
              Cuánto entra, cuánto sale y cuánto queda — por día, por semana y por lavador. Ingresos de lavadero (ya con
              descuentos absorbidos), parqueadero y venta de productos, menos comisiones, costo de la mercancía vendida y
              gastos. Aún no descuenta el consumo de insumos de lavado.
            </p>
          </div>
          <PeriodoSelector
            modo={modoPeriodo}
            onModoChange={cambiarModoPeriodo}
            ancla={anclaPeriodo}
            onAnclaChange={cambiarAnclaPeriodo}
            rango={rango}
          />
        </div>
        {error ? <p className="rounded-lg bg-danger-50 px-4 py-3 text-sm text-danger-700">{error}</p> : null}
        {cargando ? <p className="text-xs font-medium text-primary-600">Calculando {rango.label.toLowerCase()}…</p> : null}
      </div>

      {/* Banda de KPIs */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label={`Utilidad neta · ${rango.label}`}
          valor={COP.format(totales.utilidadNeta)}
          tono={totales.utilidadNeta >= 0 ? 'verde' : 'rojo'}
          icon={totales.utilidadNeta >= 0 ? TrendingUp : TrendingDown}
          delta={calcularDelta(totales.utilidadNeta, comparativa.utilidadNeta, 'mayor-mejor', COP.format)}
        />
        <KpiCard
          label="Margen sobre ingresos"
          valor={PCT(totales.margen)}
          tono={totales.margen >= 0 ? 'verde' : 'rojo'}
          icon={Sparkles}
          delta={calcularDelta(totales.margen, comparativa.margen, 'mayor-mejor', PCT)}
        />
        <KpiCard
          label="Ingresos totales"
          valor={COP.format(ingresosTotales)}
          tono="neutro"
          icon={Wallet}
          delta={calcularDelta(ingresosTotales, ingresosPrev, 'mayor-mejor', COP.format)}
        />
        <KpiCard
          label="Egresos totales"
          valor={COP.format(egresosTotales)}
          tono="rojo-suave"
          icon={Coins}
          delta={calcularDelta(egresosTotales, egresosPrev, 'menor-mejor', COP.format)}
        />
      </div>

      {/* Cascada */}
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold text-neutral-900">De ingresos a utilidad</h3>
          <span className="text-xs capitalize text-neutral-400">{rango.label}</span>
        </div>

        <Card className="p-0">
          {/* --- Entra --- */}
          <BloqueEtiqueta texto="Entra" />
          <CascadaFila
            label="Lavadero"
            icon={Droplets}
            sub={
              totales.descuentos > 0
                ? `${reporte.cantidadLavados} lavados · ${COP.format(totales.descuentos)} en descuentos absorbidos`
                : `${reporte.cantidadLavados} lavado${reporte.cantidadLavados === 1 ? '' : 's'} entregado${reporte.cantidadLavados === 1 ? '' : 's'}`
            }
            valor={totales.ingresosLavadero}
            pct={porcentaje(totales.ingresosLavadero, ingresosTotales)}
            tipo="ingreso"
            onClick={reporte.ordenes.length > 0 ? () => setModal({ tipo: 'lavadero' }) : undefined}
          />
          <CascadaFila
            label="Parqueadero"
            icon={CircleParking}
            sub={totales.ingresosParqueadero === 0 ? 'sin registros en el periodo' : 'cobros de salida'}
            valor={totales.ingresosParqueadero}
            pct={porcentaje(totales.ingresosParqueadero, ingresosTotales)}
            tipo="ingreso"
          />
          <CascadaFila
            label="Venta de productos"
            icon={ShoppingBasket}
            sub={
              reporte.cantidadProductos > 0
                ? `${reporte.cantidadProductos} unidad${reporte.cantidadProductos === 1 ? '' : 'es'} vendida${reporte.cantidadProductos === 1 ? '' : 's'}`
                : 'sin ventas en el periodo'
            }
            valor={totales.ingresosVentas}
            pct={porcentaje(totales.ingresosVentas, ingresosTotales)}
            tipo="ingreso"
            onClick={reporte.productos.length > 0 ? () => setModal({ tipo: 'productos' }) : undefined}
          />
          <CascadaSubtotal label="Ingresos totales" valor={ingresosTotales} pctTexto="100%" tipo="ingreso" />

          {/* --- Sale --- */}
          <BloqueEtiqueta texto="Sale" />
          <CascadaFila
            label="Comisión de lavadores"
            icon={Users}
            badge="40%"
            sub={
              reporte.porLavador.length > 0
                ? `${reporte.porLavador.length} lavador${reporte.porLavador.length === 1 ? '' : 'es'} · sobre precio de lista`
                : 'sin lavados en el periodo'
            }
            valor={-totales.comisionLavadores}
            pct={porcentaje(totales.comisionLavadores, ingresosTotales)}
            tipo="egreso"
            onClick={reporte.porLavador.length > 0 ? () => setModal({ tipo: 'comLavadores' }) : undefined}
          />
          <CascadaFila
            label="Comisión de jefe de patio"
            icon={ShieldCheck}
            badge="3%"
            sub="para quien estaba a cargo del turno de recepción"
            valor={-totales.comisionJefeZona}
            pct={porcentaje(totales.comisionJefeZona, ingresosTotales)}
            tipo="egreso"
            onClick={totales.comisionJefeZona > 0 ? () => setModal({ tipo: 'comJefe' }) : undefined}
          />
          <CascadaFila
            label="Costo de los productos vendidos"
            icon={Package}
            sub={
              reporte.productos.length > 0
                ? `${reporte.productos.length} producto${reporte.productos.length === 1 ? '' : 's'} · costo promedio ponderado`
                : 'sin ventas en el periodo'
            }
            valor={-totales.costoMercancia}
            pct={porcentaje(totales.costoMercancia, ingresosTotales)}
            tipo="egreso"
            alerta={totales.ventasSinCosto > 0 ? `${totales.ventasSinCosto} venta(s) sin costo registrado` : undefined}
            onClick={reporte.productos.length > 0 ? () => setModal({ tipo: 'costo' }) : undefined}
          />
          <CascadaFila
            label="Gastos"
            icon={Receipt}
            sub={
              reporte.gastos.length > 0
                ? `${reporte.gastos.length} movimiento${reporte.gastos.length === 1 ? '' : 's'} en ${reporte.gastosPorCategoria.length} categoría${reporte.gastosPorCategoria.length === 1 ? '' : 's'}`
                : 'sin gastos cargados en el periodo'
            }
            valor={-totales.gastos}
            pct={porcentaje(totales.gastos, ingresosTotales)}
            tipo="egreso"
            alerta={reporte.gastos.length === 0 ? 'la utilidad no descuenta costos fijos' : undefined}
            onClick={reporte.gastos.length > 0 ? () => setModal({ tipo: 'gastos' }) : undefined}
          />
          <CascadaSubtotal
            label="Total de egresos"
            valor={-egresosTotales}
            pctTexto={PCT(porcentaje(egresosTotales, ingresosTotales))}
            tipo="egreso"
          />

          {/* --- Queda --- */}
          <div className="p-3 sm:p-4">
            <UtilidadPanel
              utilidad={totales.utilidadNeta}
              margen={totales.margen}
              ingresos={ingresosTotales}
              reparto={[
                { label: 'Utilidad', valor: Math.max(0, totales.utilidadNeta), clase: 'bg-success-600' },
                { label: 'Comisión lavadores', valor: totales.comisionLavadores, clase: 'bg-primary-600' },
                { label: 'Comisión jefe de patio', valor: totales.comisionJefeZona, clase: 'bg-primary-400' },
                { label: 'Costo productos', valor: totales.costoMercancia, clase: 'bg-warning-600' },
                { label: 'Gastos', valor: totales.gastos, clase: 'bg-danger-600' },
              ]}
            />
          </div>
        </Card>

        <p className="text-xs leading-relaxed text-neutral-400">
          El costo de los productos usa el costo promedio ponderado de las entradas al momento de cada venta, o el costo
          oficial del producto si aún no tiene entradas con costo. No descuenta el consumo de insumos de lavado ni
          refleja el arqueo real de caja. El parqueadero todavía no registra método de pago.
          {totales.ventasSinCosto > 0 ? (
            <span className="text-warning-600">
              {' '}
              {totales.ventasSinCosto === 1
                ? '1 venta del periodo no tiene costo registrado'
                : `${totales.ventasSinCosto} ventas del periodo no tienen costo registrado`}
              , así que la utilidad sale algo más alta de lo real.
            </span>
          ) : null}
        </p>
      </section>

      {/* Gráficos */}
      {porDia.length > 2 ? (
        <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card className="text-left">
            <h3 className="mb-3 text-sm font-semibold text-neutral-900">Utilidad por día</h3>
            <BarChart
              labels={porDia.map((d) => FECHA_CORTA.format(dateFromISO(d.fecha)))}
              data={porDia.map((d) => d.utilidadNeta)}
              colors={porDia.map((d) => (d.utilidadNeta >= 0 ? CHART_COLORS.success : CHART_COLORS.danger))}
              valueFormatter={COP.format}
              height={Math.max(160, porDia.length * 32)}
            />
          </Card>
          <Card className="text-left">
            <h3 className="mb-3 text-sm font-semibold text-neutral-900">Ingresos por día</h3>
            <BarChart
              labels={porDia.map((d) => FECHA_CORTA.format(dateFromISO(d.fecha)))}
              data={porDia.map((d) => d.ingresosLavadero + d.ingresosParqueadero + d.ingresosVentas)}
              valueFormatter={COP.format}
              height={Math.max(160, porDia.length * 32)}
            />
          </Card>
        </section>
      ) : null}

      {/* Resumen por día */}
      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold text-neutral-900">Resumen por día</h3>
        <Card className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-200 text-left text-xs font-medium uppercase tracking-wide text-neutral-500">
                  <th className="px-4 py-3">Fecha</th>
                  <th className="px-4 py-3 text-right">Lavadero</th>
                  <th className="px-4 py-3 text-right">Parq.</th>
                  <th className="px-4 py-3 text-right">Productos</th>
                  <th className="px-4 py-3 text-right">Ingresos</th>
                  <th className="px-4 py-3 text-right">Comisiones</th>
                  <th className="px-4 py-3 text-right">Costo prod.</th>
                  <th className="px-4 py-3 text-right">Gastos</th>
                  <th className="px-4 py-3 text-right">Utilidad</th>
                  <th className="px-4 py-3 text-right">Margen</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {porDia.map((d) => {
                  const ingresos = d.ingresosLavadero + d.ingresosParqueadero + d.ingresosVentas
                  return (
                    <tr
                      key={d.fecha}
                      role="button"
                      tabIndex={0}
                      onClick={() => setModal({ tipo: 'dia', dia: d })}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') setModal({ tipo: 'dia', dia: d })
                      }}
                      className="cursor-pointer border-b border-neutral-100 transition-colors last:border-0 hover:bg-primary-50/50"
                    >
                      <td className="whitespace-nowrap px-4 py-3 font-medium capitalize text-neutral-900">
                        {FECHA_CORTA.format(dateFromISO(d.fecha))}
                      </td>
                      <td className="px-4 py-3 text-right text-neutral-600">{COP.format(d.ingresosLavadero)}</td>
                      <td className="px-4 py-3 text-right text-neutral-600">{COP.format(d.ingresosParqueadero)}</td>
                      <td className="px-4 py-3 text-right text-neutral-600">{COP.format(d.ingresosVentas)}</td>
                      <td className="px-4 py-3 text-right font-medium text-neutral-900">{COP.format(ingresos)}</td>
                      <td className="px-4 py-3 text-right text-danger-600">
                        {COP.format(d.comisionLavadores + d.comisionJefeZona)}
                      </td>
                      <td className="px-4 py-3 text-right text-danger-600">{COP.format(d.costoMercancia)}</td>
                      <td className="px-4 py-3 text-right text-danger-600">{COP.format(d.gastos)}</td>
                      <td
                        className={`px-4 py-3 text-right font-semibold ${
                          d.utilidadNeta >= 0 ? 'text-success-700' : 'text-danger-600'
                        }`}
                      >
                        {COP.format(d.utilidadNeta)}
                      </td>
                      <td className="px-4 py-3 text-right text-neutral-500">{PCT(d.margen)}</td>
                      <td className="px-2 py-3 text-neutral-300">
                        <ChevronRight size={16} />
                      </td>
                    </tr>
                  )
                })}
                {porDia.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="px-4 py-8 text-center text-neutral-400">
                      Sin movimientos en {rango.label}.
                    </td>
                  </tr>
                ) : (
                  <tr className="border-t-2 border-neutral-200 text-sm font-semibold">
                    <td className="px-4 py-3 text-neutral-700">Total</td>
                    <td className="px-4 py-3 text-right text-neutral-700">{COP.format(totales.ingresosLavadero)}</td>
                    <td className="px-4 py-3 text-right text-neutral-700">{COP.format(totales.ingresosParqueadero)}</td>
                    <td className="px-4 py-3 text-right text-neutral-700">{COP.format(totales.ingresosVentas)}</td>
                    <td className="px-4 py-3 text-right text-neutral-900">{COP.format(ingresosTotales)}</td>
                    <td className="px-4 py-3 text-right text-danger-600">
                      {COP.format(totales.comisionLavadores + totales.comisionJefeZona)}
                    </td>
                    <td className="px-4 py-3 text-right text-danger-600">{COP.format(totales.costoMercancia)}</td>
                    <td className="px-4 py-3 text-right text-danger-600">{COP.format(totales.gastos)}</td>
                    <td
                      className={`px-4 py-3 text-right ${
                        totales.utilidadNeta >= 0 ? 'text-success-700' : 'text-danger-600'
                      }`}
                    >
                      {COP.format(totales.utilidadNeta)}
                    </td>
                    <td className="px-4 py-3 text-right text-neutral-500">{PCT(totales.margen)}</td>
                    <td />
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </section>

      {/* Resumen por semana */}
      {porSemana.length > 1 ? (
        <section className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-neutral-900">Resumen por semana</h3>
          <Card className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-neutral-200 text-left text-xs font-medium uppercase tracking-wide text-neutral-500">
                    <th className="px-4 py-3">Semana</th>
                    <th className="px-4 py-3 text-right">Ingresos</th>
                    <th className="px-4 py-3 text-right">Comisiones</th>
                    <th className="px-4 py-3 text-right">Costo prod.</th>
                    <th className="px-4 py-3 text-right">Gastos</th>
                    <th className="px-4 py-3 text-right">Utilidad</th>
                    <th className="px-4 py-3 text-right">Margen</th>
                  </tr>
                </thead>
                <tbody>
                  {porSemana.map((s) => {
                    const ingresos = s.ingresosLavadero + s.ingresosParqueadero + s.ingresosVentas
                    return (
                      <tr key={s.semana} className="border-b border-neutral-100 last:border-0">
                        <td className="whitespace-nowrap px-4 py-3 font-medium capitalize text-neutral-900">{s.label}</td>
                        <td className="px-4 py-3 text-right text-neutral-700">{COP.format(ingresos)}</td>
                        <td className="px-4 py-3 text-right text-danger-600">
                          {COP.format(s.comisionLavadores + s.comisionJefeZona)}
                        </td>
                        <td className="px-4 py-3 text-right text-danger-600">{COP.format(s.costoMercancia)}</td>
                        <td className="px-4 py-3 text-right text-danger-600">{COP.format(s.gastos)}</td>
                        <td
                          className={`px-4 py-3 text-right font-semibold ${
                            s.utilidadNeta >= 0 ? 'text-success-700' : 'text-danger-600'
                          }`}
                        >
                          {COP.format(s.utilidadNeta)}
                        </td>
                        <td className="px-4 py-3 text-right text-neutral-500">{PCT(s.margen)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </section>
      ) : null}

      {/* Desglose por lavador */}
      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold text-neutral-900">Comisión por lavador</h3>
        {reporte.porLavador.length > 2 ? (
          <Card className="text-left">
            <BarChart
              labels={reporte.porLavador.map((l) => l.nombre)}
              data={reporte.porLavador.map((l) => l.comision)}
              valueFormatter={COP.format}
              height={Math.max(120, reporte.porLavador.length * 40)}
            />
          </Card>
        ) : null}
        <Card className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-xs font-medium uppercase tracking-wide text-neutral-500">
                <th className="px-4 py-3">Lavador</th>
                <th className="px-4 py-3 text-right">Órdenes</th>
                <th className="px-4 py-3 text-right">Ingreso generado</th>
                <th className="px-4 py-3 text-right">Comisión (40%)</th>
                <th className="px-4 py-3 text-right">% del total</th>
              </tr>
            </thead>
            <tbody>
              {reporte.porLavador.map((l) => (
                <tr key={l.lavadorId} className="border-b border-neutral-100 last:border-0">
                  <td className="px-4 py-3 font-medium text-neutral-900">{l.nombre}</td>
                  <td className="px-4 py-3 text-right text-neutral-600">{l.ordenes}</td>
                  <td className="px-4 py-3 text-right text-neutral-600">{COP.format(l.ingresoLista)}</td>
                  <td className="px-4 py-3 text-right font-medium text-neutral-900">{COP.format(l.comision)}</td>
                  <td className="px-4 py-3 text-right text-neutral-500">{PCT(l.pctComisionDelTotal)}</td>
                </tr>
              ))}
              {reporte.porLavador.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-neutral-400">
                    Sin lavados entregados en el periodo.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </Card>
      </section>

      {/* Desglose por combo */}
      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold text-neutral-900">Lavados por combo</h3>
        {reporte.porCombo.length > 2 ? (
          <Card className="text-left">
            <BarChart
              labels={reporte.porCombo.map((c) => c.nombre)}
              data={reporte.porCombo.map((c) => c.cantidad)}
              valueFormatter={(n) => `${n}`}
              height={Math.max(120, reporte.porCombo.length * 40)}
            />
          </Card>
        ) : null}
        <Card className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-xs font-medium uppercase tracking-wide text-neutral-500">
                <th className="px-4 py-3">Combo</th>
                <th className="px-4 py-3">Categoría</th>
                <th className="px-4 py-3 text-right">Cantidad</th>
                <th className="px-4 py-3 text-right">Ingreso</th>
                <th className="px-4 py-3 text-right">Ticket promedio</th>
              </tr>
            </thead>
            <tbody>
              {reporte.porCombo.map((c) => (
                <tr key={c.comboId} className="border-b border-neutral-100 last:border-0">
                  <td className="px-4 py-3 font-medium text-neutral-900">{c.nombre}</td>
                  <td className="px-4 py-3 capitalize text-neutral-500">{c.categoria}</td>
                  <td className="px-4 py-3 text-right text-neutral-600">{c.cantidad}</td>
                  <td className="px-4 py-3 text-right text-neutral-700">{COP.format(c.ingreso)}</td>
                  <td className="px-4 py-3 text-right text-neutral-600">{COP.format(c.ticketPromedio)}</td>
                </tr>
              ))}
              {reporte.porCombo.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-neutral-400">
                    Sin lavados entregados en el periodo.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </Card>
      </section>

      {/* Gastos por categoría */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-neutral-900">Gastos por categoría</h3>
          <Link
            to="/admin/dinero/gastos"
            className="flex items-center gap-1 text-xs font-medium text-primary-600 transition-colors hover:text-primary-700"
          >
            Registrar gasto <ArrowRight size={13} />
          </Link>
        </div>
        {reporte.gastosPorCategoria.length === 0 ? (
          <Card className="p-6 text-sm text-neutral-500">
            No hay gastos cargados en este periodo — la utilidad de arriba está sin descontar costos fijos (arriendo,
            servicios, insumos de lavado, etc.).
          </Card>
        ) : (
          <>
            {reporte.gastosPorCategoria.length > 2 ? (
              <Card className="text-left">
                <BarChart
                  labels={reporte.gastosPorCategoria.map((g) => g.nombre)}
                  data={reporte.gastosPorCategoria.map((g) => g.total)}
                  color={CHART_COLORS.danger}
                  valueFormatter={COP.format}
                  height={Math.max(120, reporte.gastosPorCategoria.length * 40)}
                />
              </Card>
            ) : null}
            <Card className="p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-neutral-200 text-left text-xs font-medium uppercase tracking-wide text-neutral-500">
                    <th className="px-4 py-3">Categoría</th>
                    <th className="px-4 py-3 text-right">Movimientos</th>
                    <th className="px-4 py-3 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {reporte.gastosPorCategoria.map((g) => (
                    <tr key={g.categoriaId} className="border-b border-neutral-100 last:border-0">
                      <td className="px-4 py-3 font-medium text-neutral-900">{g.nombre}</td>
                      <td className="px-4 py-3 text-right text-neutral-600">{g.cantidad}</td>
                      <td className="px-4 py-3 text-right font-medium text-danger-600">{COP.format(g.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </>
        )}
      </section>

      {/* Indicadores */}
      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold text-neutral-900">Indicadores del periodo</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <StatCard label="Lavados entregados" value={`${reporte.cantidadLavados}`} icon={Droplets} />
          <StatCard
            label="Ticket promedio de lavado"
            value={COP.format(reporte.ticketPromedioLavado)}
            icon={Sparkles}
          />
          <StatCard label="Productos vendidos" value={`${reporte.cantidadProductos}`} icon={ShoppingBasket} />
          <StatCard
            label="Descuentos absorbidos"
            value={COP.format(totales.descuentos)}
            icon={Coins}
            hint={totales.descuentos > 0 ? 'El negocio asumió estas rebajas' : undefined}
          />
          <StatCard
            label="Día más rentable"
            value={reporte.diaMasRentable ? COP.format(reporte.diaMasRentable.utilidadNeta) : '—'}
            icon={TrendingUp}
            hint={
              reporte.diaMasRentable
                ? FECHA_LARGA.format(dateFromISO(reporte.diaMasRentable.fecha))
                : undefined
            }
          />
          <StatCard
            label="Día menos rentable"
            value={reporte.diaMenosRentable ? COP.format(reporte.diaMenosRentable.utilidadNeta) : '—'}
            icon={TrendingDown}
            hint={
              reporte.diaMenosRentable
                ? FECHA_LARGA.format(dateFromISO(reporte.diaMenosRentable.fecha))
                : undefined
            }
          />
        </div>
      </section>

      {modal ? <DetalleModal modal={modal} reporte={reporte} onClose={() => setModal(null)} /> : null}
    </div>
  )
}

// --- Cascada de rentabilidad ---
//
// Waterfall en tres bloques (Entra → Sale → Queda) en vez de una lista plana de renglones. Cada
// fila lleva una barra de proporción cuyo ancho es su peso sobre los ingresos totales: eso es lo
// que hace evidente de un vistazo que la comisión de lavadores se come ~40 de cada 100 pesos,
// algo que una columna de cifras sueltas no comunica. La barra usa dos colores semánticos (entra /
// sale), no una paleta categórica — es estado, no categoría (misma excepción que el chart de stock).

function porcentaje(parte: number, total: number): number {
  return total > 0 ? (parte / total) * 100 : 0
}

function BloqueEtiqueta({ texto }: { texto: string }) {
  return (
    <div className="flex items-center gap-3 px-5 pb-1 pt-5">
      <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-400">{texto}</span>
      <span className="h-px flex-1 bg-neutral-100" />
    </div>
  )
}

function CascadaFila({
  label,
  icon: Icon,
  sub,
  badge,
  alerta,
  valor,
  pct,
  tipo,
  onClick,
}: {
  label: string
  icon: ComponentType<{ size?: number; strokeWidth?: number }>
  sub?: string
  /** Chip con la tasa de la regla de negocio (40% / 3%), junto al nombre. */
  badge?: string
  /** Nota en ámbar cuando la cifra está incompleta o no se está descontando algo. */
  alerta?: string
  /** Negativo para egresos — se pinta con "−" y en rojo. */
  valor: number
  /** Peso de esta línea sobre los ingresos totales (0–100). */
  pct: number
  tipo: 'ingreso' | 'egreso'
  onClick?: () => void
}) {
  const esEgreso = tipo === 'egreso'
  const vacio = valor === 0
  const colorBarra = esEgreso ? 'bg-danger-600' : 'bg-primary-500'
  const colorIcono = vacio
    ? 'bg-neutral-100 text-neutral-400'
    : esEgreso
      ? 'bg-danger-50 text-danger-600'
      : 'bg-primary-50 text-primary-600'
  const colorValor = vacio ? 'text-neutral-400' : esEgreso ? 'text-danger-600' : 'text-neutral-900'

  const contenido = (
    <div className="flex flex-col gap-2">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className={`mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl ${colorIcono}`}>
            <Icon size={16} strokeWidth={2} />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-sm font-medium text-neutral-800 transition-colors group-hover:text-primary-700">
                {label}
              </span>
              {badge ? (
                <span className="rounded-md bg-neutral-100 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-neutral-500">
                  {badge}
                </span>
              ) : null}
            </div>
            {sub ? <p className="mt-0.5 truncate text-xs text-neutral-400">{sub}</p> : null}
            {alerta ? <p className="mt-0.5 text-xs font-medium text-warning-600">{alerta}</p> : null}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <div className="text-right">
            <p className={`text-sm font-semibold tabular-nums ${colorValor}`}>
              {esEgreso && !vacio ? `− ${COP.format(Math.abs(valor))}` : COP.format(Math.abs(valor))}
            </p>
            <p className="text-[11px] tabular-nums text-neutral-400">{pct.toFixed(1)}% de ingresos</p>
          </div>
          <ChevronRight
            size={16}
            className={
              onClick
                ? 'text-neutral-300 transition-all group-hover:translate-x-0.5 group-hover:text-primary-600'
                : 'text-transparent'
            }
          />
        </div>
      </div>

      {/* Barra de proporción — el ancho es el peso real de la línea sobre los ingresos. */}
      <div className="ml-12 h-1.5 overflow-hidden rounded-full bg-neutral-100">
        <div
          className={`h-full rounded-full transition-[width] duration-500 ${colorBarra}`}
          style={{ width: `${Math.min(100, Math.max(pct > 0 ? 1.5 : 0, pct))}%` }}
        />
      </div>
    </div>
  )

  if (!onClick) {
    return <div className="px-5 py-3.5">{contenido}</div>
  }
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Ver detalle de ${label}`}
      className="group w-full cursor-pointer px-5 py-3.5 text-left transition-colors hover:bg-primary-50/40 focus:outline-none focus-visible:bg-primary-50/60"
    >
      {contenido}
    </button>
  )
}

function CascadaSubtotal({
  label,
  valor,
  pctTexto,
  tipo,
}: {
  label: string
  valor: number
  pctTexto: string
  tipo: 'ingreso' | 'egreso'
}) {
  const esEgreso = tipo === 'egreso'
  return (
    <div
      className={`mt-1 flex items-center justify-between gap-3 border-y px-5 py-3 ${
        esEgreso ? 'border-danger-600/15 bg-danger-50/50' : 'border-primary-600/15 bg-primary-50/50'
      }`}
    >
      <span className="text-sm font-semibold text-neutral-800">{label}</span>
      <div className="flex items-baseline gap-2.5">
        <span className="text-[11px] tabular-nums text-neutral-400">{pctTexto}</span>
        <span
          className={`text-base font-semibold tabular-nums ${esEgreso ? 'text-danger-700' : 'text-primary-700'}`}
        >
          {esEgreso ? `− ${COP.format(Math.abs(valor))}` : COP.format(valor)}
        </span>
      </div>
    </div>
  )
}

// Cierre de la cascada: la utilidad como resultado destacado + la barra apilada que responde
// "¿en qué se va cada $100 que entra?" de un solo vistazo. Acá sí hay varias categorías reales en
// una sola barra, por eso lleva paleta y leyenda (no es el caso de "una serie" de BarChart).
function UtilidadPanel({
  utilidad,
  margen,
  ingresos,
  reparto,
}: {
  utilidad: number
  margen: number
  ingresos: number
  reparto: { label: string; valor: number; clase: string }[]
}) {
  const positiva = utilidad >= 0
  const porCada100 = ingresos > 0 ? (utilidad / ingresos) * 100 : 0
  const segmentos = reparto.filter((r) => r.valor > 0)
  const totalSegmentos = segmentos.reduce((s, r) => s + r.valor, 0)

  return (
    <div
      className={`rounded-xl border p-4 sm:p-5 ${
        positiva ? 'border-success-600/25 bg-success-50' : 'border-danger-600/25 bg-danger-50'
      }`}
    >
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div>
          <span
            className={`text-[11px] font-semibold uppercase tracking-[0.14em] ${
              positiva ? 'text-success-700' : 'text-danger-700'
            }`}
          >
            Queda
          </span>
          <p className="mt-1 text-sm font-medium text-neutral-600">Utilidad neta del periodo</p>
        </div>
        <div className="text-right">
          <p
            className={`text-3xl font-semibold tracking-tight tabular-nums ${
              positiva ? 'text-success-700' : 'text-danger-600'
            }`}
          >
            {COP.format(utilidad)}
          </p>
          <p className="text-xs tabular-nums text-neutral-500">margen {PCT(margen)}</p>
        </div>
      </div>

      {ingresos > 0 ? (
        <div className={`mt-4 border-t pt-4 ${positiva ? 'border-success-600/20' : 'border-danger-600/20'}`}>
          <p className="mb-2.5 text-xs font-medium text-neutral-600">
            De cada $100 que entra,{' '}
            <span className={positiva ? 'font-semibold text-success-700' : 'font-semibold text-danger-600'}>
              te quedan ${porCada100.toFixed(0)}
            </span>
            .
          </p>
          <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-white/70">
            {segmentos.map((r) => (
              <div
                key={r.label}
                className={r.clase}
                style={{ width: `${(r.valor / totalSegmentos) * 100}%` }}
                title={`${r.label}: ${COP.format(r.valor)}`}
              />
            ))}
          </div>
          <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
            {segmentos.map((r) => (
              <li key={r.label} className="flex items-center gap-1.5 text-[11px] text-neutral-500">
                <span className={`size-2 shrink-0 rounded-full ${r.clase}`} />
                {r.label}
                <span className="font-medium tabular-nums text-neutral-700">
                  {((r.valor / totalSegmentos) * 100).toFixed(0)}%
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}

// --- Modales de detalle ---

function DetalleModal({
  modal,
  reporte,
  onClose,
}: {
  modal: { tipo: ModalTipo; dia?: RentabilidadDia }
  reporte: RentabilidadReporte
  onClose: () => void
}) {
  if (modal.tipo === 'dia' && modal.dia) {
    const dia = modal.dia
    const ordenesDia = reporte.ordenes.filter((o) => fechaLocalISO(new Date(o.fecha)) === dia.fecha)
    const ventasDia = reporte.ventas.filter((v) => fechaLocalISO(new Date(v.fecha)) === dia.fecha)
    const gastosDia = reporte.gastos.filter((g) => g.fecha === dia.fecha)
    const columnas: ColumnaDetalle[] = [
      { key: 'concepto', label: 'Concepto' },
      { key: 'detalle', label: 'Detalle' },
      { key: 'valor', label: 'Valor', align: 'right' },
    ]
    const filas: Record<string, ReactNode>[] = [
      { concepto: 'Ingresos lavadero', detalle: `${ordenesDia.length} lavado(s) entregado(s)`, valor: COP.format(dia.ingresosLavadero) },
      { concepto: 'Ingresos parqueadero', detalle: '—', valor: COP.format(dia.ingresosParqueadero) },
      { concepto: 'Ingresos productos', detalle: `${ventasDia.length} venta(s)`, valor: COP.format(dia.ingresosVentas) },
      { concepto: '− Comisión lavadores', detalle: '40%', valor: <span className="text-danger-600">− {COP.format(dia.comisionLavadores)}</span> },
      { concepto: '− Comisión jefe de patio', detalle: '3%', valor: <span className="text-danger-600">− {COP.format(dia.comisionJefeZona)}</span> },
      { concepto: '− Costo productos', detalle: '—', valor: <span className="text-danger-600">− {COP.format(dia.costoMercancia)}</span> },
      { concepto: '− Gastos', detalle: `${gastosDia.length} movimiento(s)`, valor: <span className="text-danger-600">− {COP.format(dia.gastos)}</span> },
    ]
    const ingresosDia = dia.ingresosLavadero + dia.ingresosParqueadero + dia.ingresosVentas
    const egresosDia = dia.comisionLavadores + dia.comisionJefeZona + dia.costoMercancia + dia.gastos
    return (
      <TablaDetalleModal
        titulo={FECHA_LARGA.format(dateFromISO(dia.fecha))}
        subtitulo="Cómo se formó la utilidad de este día"
        icono={CalendarDays}
        resumen={[
          { label: 'Ingresos', valor: COP.format(ingresosDia) },
          { label: 'Egresos', valor: `− ${COP.format(egresosDia)}`, tono: 'rojo' },
          {
            label: 'Utilidad neta',
            valor: COP.format(dia.utilidadNeta),
            tono: dia.utilidadNeta >= 0 ? 'verde' : 'rojo',
          },
          { label: 'Margen', valor: PCT(dia.margen), tono: dia.margen >= 0 ? 'verde' : 'rojo' },
        ]}
        columnas={columnas}
        filas={filas}
        total={{ concepto: 'Utilidad neta', detalle: '', valor: COP.format(dia.utilidadNeta) }}
        onClose={onClose}
      />
    )
  }

  if (modal.tipo === 'lavadero') {
    return (
      <TablaDetalleModal
        titulo="Ingresos del lavadero"
        subtitulo="Cada lavado entregado en el periodo"
        icono={Droplets}
        ancho="lg"
        resumen={[
          { label: 'Lavados entregados', valor: `${reporte.cantidadLavados}` },
          { label: 'Precio de lista', valor: COP.format(reporte.totales.ingresosLavadero + reporte.totales.descuentos) },
          { label: 'Descuentos', valor: `− ${COP.format(reporte.totales.descuentos)}`, tono: 'rojo' },
          { label: 'Ingreso neto', valor: COP.format(reporte.totales.ingresosLavadero), tono: 'verde' },
        ]}
        columnas={[
          { key: 'fecha', label: 'Fecha' },
          { key: 'placa', label: 'Vehículo' },
          { key: 'servicio', label: 'Servicio' },
          { key: 'lavador', label: 'Lavador' },
          { key: 'metodo', label: 'Pago' },
          { key: 'precio', label: 'Precio', align: 'right' },
          { key: 'neto', label: 'Neto', align: 'right' },
        ]}
        filas={reporte.ordenes.map((o) => ({
          fecha: (
            <>
              <span className="whitespace-nowrap">{FECHA_HORA.format(new Date(o.fecha))}</span>
              <span className="mt-0.5 block text-[11px] text-neutral-400">#{o.consecutivo}</span>
            </>
          ),
          placa: (
            <>
              <span className="font-mono font-semibold text-neutral-900">{o.placa}</span>
              <span className="mt-0.5 block text-[11px] text-neutral-400">{o.tipoNombre}</span>
            </>
          ),
          servicio: o.comboNombre,
          lavador: o.lavadorNombre,
          metodo: <span className="capitalize text-neutral-500">{o.metodoPago}</span>,
          precio: (
            <>
              <span className={o.descuento > 0 ? 'text-neutral-400 line-through' : ''}>{COP.format(o.precio)}</span>
              {o.descuento > 0 ? (
                <span className="mt-0.5 block text-[11px] text-danger-600">− {COP.format(o.descuento)}</span>
              ) : null}
            </>
          ),
          neto: <span className="font-medium text-neutral-900">{COP.format(o.neto)}</span>,
        }))}
        total={{ neto: COP.format(reporte.totales.ingresosLavadero) }}
        onClose={onClose}
      />
    )
  }

  if (modal.tipo === 'productos' || modal.tipo === 'costo') {
    const esCosto = modal.tipo === 'costo'
    return (
      <TablaDetalleModal
        titulo={esCosto ? 'Costo de los productos vendidos' : 'Venta de productos'}
        subtitulo={esCosto ? 'Costo promedio ponderado al momento de cada venta' : 'Lo vendido en vitrina y nevera'}
        icono={esCosto ? Package : ShoppingBasket}
        resumen={[
          { label: 'Unidades vendidas', valor: `${reporte.cantidadProductos}` },
          { label: 'Ingreso', valor: COP.format(reporte.totales.ingresosVentas) },
          { label: 'Costo', valor: `− ${COP.format(reporte.totales.costoMercancia)}`, tono: 'rojo' },
          {
            label: 'Margen',
            valor: COP.format(reporte.totales.ingresosVentas - reporte.totales.costoMercancia),
            tono: 'verde',
          },
        ]}
        columnas={[
          { key: 'producto', label: 'Producto' },
          { key: 'cantidad', label: 'Cantidad', align: 'right' },
          { key: 'ingreso', label: 'Ingreso', align: 'right' },
          { key: 'costo', label: 'Costo', align: 'right' },
          { key: 'margen', label: 'Margen', align: 'right' },
        ]}
        filas={reporte.productos.map((p) => ({
          producto: <span className="font-medium text-neutral-900">{p.nombre}</span>,
          cantidad: p.cantidad,
          ingreso: COP.format(p.ingreso),
          costo: <span className="text-danger-600">{COP.format(p.costo)}</span>,
          margen: (
            <span className={p.margen >= 0 ? 'text-success-700' : 'text-danger-600'}>{COP.format(p.margen)}</span>
          ),
        }))}
        total={{
          ingreso: COP.format(reporte.totales.ingresosVentas),
          costo: COP.format(reporte.totales.costoMercancia),
          margen: COP.format(reporte.totales.ingresosVentas - reporte.totales.costoMercancia),
        }}
        onClose={onClose}
      />
    )
  }

  if (modal.tipo === 'comLavadores') {
    return (
      <TablaDetalleModal
        titulo="Comisión de lavadores"
        subtitulo="40% del precio de lista de cada orden; en órdenes de dos lavadores se parte a la mitad"
        icono={Users}
        resumen={[
          { label: 'Lavadores', valor: `${reporte.porLavador.length}` },
          { label: 'Lavados entregados', valor: `${reporte.cantidadLavados}` },
          { label: 'Comisión total', valor: `− ${COP.format(reporte.totales.comisionLavadores)}`, tono: 'rojo' },
          {
            label: '% de ingresos',
            valor: PCT(
              porcentaje(
                reporte.totales.comisionLavadores,
                reporte.totales.ingresosLavadero + reporte.totales.ingresosParqueadero + reporte.totales.ingresosVentas,
              ),
            ),
          },
        ]}
        columnas={[
          { key: 'lavador', label: 'Lavador' },
          { key: 'ordenes', label: 'Órdenes', align: 'right' },
          { key: 'ingreso', label: 'Ingreso generado', align: 'right' },
          { key: 'comision', label: 'Comisión', align: 'right' },
          { key: 'pct', label: '% del total', align: 'right' },
        ]}
        filas={reporte.porLavador.map((l) => ({
          lavador: <span className="font-medium text-neutral-900">{l.nombre}</span>,
          ordenes: l.ordenes,
          ingreso: COP.format(l.ingresoLista),
          comision: <span className="font-medium text-neutral-900">{COP.format(l.comision)}</span>,
          pct: PCT(l.pctComisionDelTotal),
        }))}
        total={{ comision: COP.format(reporte.totales.comisionLavadores) }}
        onClose={onClose}
      />
    )
  }

  if (modal.tipo === 'comJefe') {
    const porResponsable = new Map<string, { ordenes: number; comision: number }>()
    for (const o of reporte.ordenes) {
      const key = o.jefeZonaResponsable || '—'
      const v = porResponsable.get(key) ?? { ordenes: 0, comision: 0 }
      v.ordenes += 1
      v.comision += o.comisionJefeZona
      porResponsable.set(key, v)
    }
    return (
      <TablaDetalleModal
        titulo="Comisión de jefe de patio"
        subtitulo="3% del precio de lista, para quien estaba a cargo del turno de recepción"
        icono={ShieldCheck}
        resumen={[
          { label: 'Responsables', valor: `${porResponsable.size}` },
          { label: 'Órdenes', valor: `${reporte.cantidadLavados}` },
          { label: 'Comisión total', valor: `− ${COP.format(reporte.totales.comisionJefeZona)}`, tono: 'rojo' },
        ]}
        columnas={[
          { key: 'responsable', label: 'Responsable' },
          { key: 'ordenes', label: 'Órdenes', align: 'right' },
          { key: 'comision', label: 'Comisión', align: 'right' },
        ]}
        filas={Array.from(porResponsable.entries())
          .sort((a, b) => b[1].comision - a[1].comision)
          .map(([responsable, v]) => ({
            responsable: <span className="font-medium text-neutral-900">{responsable}</span>,
            ordenes: v.ordenes,
            comision: <span className="font-medium text-neutral-900">{COP.format(v.comision)}</span>,
          }))}
        total={{ comision: COP.format(reporte.totales.comisionJefeZona) }}
        onClose={onClose}
      />
    )
  }

  if (modal.tipo === 'gastos') {
    return (
      <TablaDetalleModal
        titulo="Gastos del periodo"
        subtitulo="Todo lo que salió de caja y no es comisión ni costo de mercancía"
        icono={Receipt}
        resumen={[
          { label: 'Movimientos', valor: `${reporte.gastos.length}` },
          { label: 'Categorías', valor: `${reporte.gastosPorCategoria.length}` },
          { label: 'Total', valor: `− ${COP.format(reporte.totales.gastos)}`, tono: 'rojo' },
        ]}
        columnas={[
          { key: 'fecha', label: 'Fecha' },
          { key: 'categoria', label: 'Categoría' },
          { key: 'descripcion', label: 'Descripción' },
          { key: 'responsable', label: 'Responsable' },
          { key: 'monto', label: 'Monto', align: 'right' },
        ]}
        filas={reporte.gastos.map((g) => ({
          fecha: FECHA_CORTA.format(dateFromISO(g.fecha)),
          categoria: g.categoriaNombre,
          descripcion: g.descripcion,
          responsable: g.responsable,
          monto: <span className="font-medium text-danger-600">{COP.format(g.monto)}</span>,
        }))}
        total={{ monto: COP.format(reporte.totales.gastos) }}
        onClose={onClose}
      />
    )
  }

  return null
}
