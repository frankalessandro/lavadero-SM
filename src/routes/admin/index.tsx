import { createFileRoute } from '@tanstack/react-router'
import { Droplets, Users, CircleParking, Wallet, TrendingUp, Receipt, HandCoins, Ban } from 'lucide-react'
import { fetchOrdenesHoy, fetchOrdenesEntregadasHoy } from '../../data/ordenes'
import { fetchLavadores } from '../../data/lavadores'
import { fetchResumenHoy } from '../../data/estanciasParqueadero'
import { fetchGastos, fetchTotalGastosPorCategoria } from '../../data/gastos'
import { fetchComisionesPendientes } from '../../data/liquidaciones'
import { StatCard } from '../../components/layout/StatCard'
import { Card } from '../../components/layout/Card'
import { BarChart } from '../../components/layout/BarChart'

function hoyISO(): string {
  return new Date().toISOString().slice(0, 10)
}

async function loadDashboard() {
  const hoy = hoyISO()
  const [ordenesHoy, entregadasHoy, lavadores, resumenParqueadero, gastosHoy, totalesPorCategoria, comisionesPendientes] =
    await Promise.all([
      fetchOrdenesHoy(),
      fetchOrdenesEntregadasHoy(),
      fetchLavadores(),
      fetchResumenHoy(),
      fetchGastos(hoy, hoy),
      fetchTotalGastosPorCategoria(hoy, hoy),
      fetchComisionesPendientes(),
    ])
  return { ordenesHoy, entregadasHoy, lavadores, resumenParqueadero, gastosHoy, totalesPorCategoria, comisionesPendientes }
}

export const Route = createFileRoute('/admin/')({
  loader: loadDashboard,
  component: AdminDashboard,
})

const COP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })

function AdminDashboard() {
  const { ordenesHoy, entregadasHoy, lavadores, resumenParqueadero, gastosHoy, totalesPorCategoria, comisionesPendientes } =
    Route.useLoaderData()
  const lavadoresActivos = lavadores.filter((l) => l.activo).length
  const anuladasHoy = ordenesHoy.filter((o) => o.estado === 'anulada')

  // Solo lo cobrado hoy (estado entregado) cuenta como ingreso — un vehículo en proceso o
  // listo todavía no ha entrado dinero a caja por él, aunque ya tenga precio fijado.
  const ingresosLavadero = entregadasHoy.reduce((total, o) => total + o.precio, 0)
  const ingresosParqueadero = resumenParqueadero.dineroHoy
  const ingresosTotales = ingresosLavadero + ingresosParqueadero
  const cajaEsperada = ingresosTotales

  const ingresosPorMetodo = entregadasHoy.reduce(
    (acc, o) => {
      if (o.metodoPago) acc[o.metodoPago] += o.precio
      return acc
    },
    { efectivo: 0, transferencia: 0 } as Record<'efectivo' | 'transferencia', number>,
  )

  const totalGastosHoy = gastosHoy.reduce((total, g) => total + g.monto, 0)
  const comisionesHoy = entregadasHoy.reduce((total, o) => total + o.comisionLavador, 0)
  const utilidadNetaHoy = ingresosTotales - comisionesHoy - totalGastosHoy
  const totalComisionesPendientes = comisionesPendientes.reduce((total, c) => total + c.montoPendiente, 0)

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Lavados de hoy" value={String(ordenesHoy.filter((o) => o.estado !== 'anulada').length)} icon={Droplets} />
        <StatCard label="Lavadores activos" value={String(lavadoresActivos)} icon={Users} />
        <StatCard label="Ocupación parqueadero" value={String(resumenParqueadero.vehiculosAdentro)} icon={CircleParking} />
        <StatCard label="Caja esperada" value={COP.format(cajaEsperada)} hint="Solo lo cobrado, sin arqueo (M5)" icon={Wallet} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="text-left">
          <h2 className="mb-3 text-sm font-semibold text-neutral-900">Ingresos de hoy por método de pago</h2>
          <dl className="flex flex-col gap-2 text-sm">
            <div className="flex items-center justify-between">
              <dt className="text-neutral-500">Efectivo (lavadero)</dt>
              <dd className="font-medium text-neutral-900">{COP.format(ingresosPorMetodo.efectivo)}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-neutral-500">Transferencia (lavadero)</dt>
              <dd className="font-medium text-neutral-900">{COP.format(ingresosPorMetodo.transferencia)}</dd>
            </div>
            <div className="flex items-center justify-between border-t border-neutral-100 pt-2">
              <dt className="text-neutral-500">Parqueadero (método no distinguido)</dt>
              <dd className="font-medium text-neutral-900">{COP.format(ingresosParqueadero)}</dd>
            </div>
          </dl>
        </Card>

        <Card className="text-left">
          <h2 className="mb-3 text-sm font-semibold text-neutral-900">Ingresos de hoy por línea de negocio</h2>
          <dl className="flex flex-col gap-2 text-sm">
            <div className="flex items-center justify-between">
              <dt className="text-neutral-500">Lavadero</dt>
              <dd className="font-medium text-neutral-900">{COP.format(ingresosLavadero)}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-neutral-500">Parqueadero</dt>
              <dd className="font-medium text-neutral-900">{COP.format(ingresosParqueadero)}</dd>
            </div>
            <div className="flex items-center justify-between border-t border-neutral-100 pt-2">
              <dt className="font-medium text-neutral-700">Total</dt>
              <dd className="font-semibold text-neutral-900">{COP.format(ingresosTotales)}</dd>
            </div>
          </dl>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Gastos de hoy" value={COP.format(totalGastosHoy)} hint={`${gastosHoy.length} registro(s)`} icon={Receipt} />
        <StatCard
          label="Utilidad neta de hoy (aprox.)"
          value={COP.format(utilidadNetaHoy)}
          hint="No incluye consumo de inventario (M7 no implementado)"
          icon={TrendingUp}
        />
        <StatCard
          label="Comisiones pendientes de pago"
          value={COP.format(totalComisionesPendientes)}
          hint="Excluye lavadores con pago diario"
          icon={HandCoins}
        />
        <StatCard label="Anulaciones de hoy" value={String(anuladasHoy.length)} icon={Ban} />
      </div>

      {totalesPorCategoria.length > 0 ? (
        <Card className="text-left">
          <h2 className="mb-3 text-sm font-semibold text-neutral-900">Gastos de hoy por categoría</h2>
          {totalesPorCategoria.length > 2 ? (
            <BarChart
              labels={totalesPorCategoria.map((t) => t.categoriaNombre)}
              data={totalesPorCategoria.map((t) => t.total)}
              valueFormatter={COP.format}
              height={Math.max(120, totalesPorCategoria.length * 40)}
            />
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {totalesPorCategoria.map((t) => (
                <li key={t.categoriaId} className="flex items-center justify-between">
                  <span className="text-neutral-500">{t.categoriaNombre}</span>
                  <span className="font-medium text-neutral-900">{COP.format(t.total)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : null}

      {anuladasHoy.length > 0 ? (
        <Card className="text-left">
          <h2 className="mb-3 text-sm font-semibold text-neutral-900">Anulaciones recientes (hoy)</h2>
          <ul className="flex flex-col gap-3 text-sm">
            {anuladasHoy.map((o) => (
              <li key={o.id} className="border-b border-neutral-100 pb-2 last:border-0 last:pb-0">
                <p className="font-medium text-neutral-900">
                  #{o.consecutivo} · {o.placa}
                </p>
                <p className="text-neutral-500">
                  Motivo: {o.motivoAnulacion ?? '—'} · Anuló: {o.anuladaPor ?? '—'}
                  {o.anuladaEn ? ` · ${new Date(o.anuladaEn).toLocaleString('es-CO')}` : ''}
                </p>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card className="text-left">
        <h2 className="mb-1 text-sm font-semibold text-neutral-900">Panel financiero (M11, primera iteración)</h2>
        <p className="text-sm text-neutral-500">
          Cifras aproximadas del día — sin arqueo de caja (M5) ni consumo de inventario (M7). Para histórico
          por rango, anulaciones con motivo y detalle de cada orden, ve a{' '}
          <span className="font-medium text-neutral-700">Órdenes</span> en el menú.
        </p>
      </Card>
    </div>
  )
}
