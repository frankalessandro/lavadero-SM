import { createFileRoute, Link } from '@tanstack/react-router'
import { Droplets, Users, CircleParking, TrendingUp, HandCoins, Ban, ArrowRight } from 'lucide-react'
import { fetchOrdenesHoy, fetchOrdenesEntregadasHoy } from '../../data/ordenes'
import { fetchLavadores } from '../../data/lavadores'
import { fetchResumenHoy } from '../../data/estanciasParqueadero'
import { fetchGastos, fetchTotalGastosPorCategoria } from '../../data/gastos'
import { fetchComisionesPendientes } from '../../data/liquidaciones'
import { fetchComisionesPendientesJefeZona } from '../../data/liquidacionesJefeZona'
import { fetchVentasHoy } from '../../data/ventas'
import type { MetodoPago } from '../../schemas/orden'
import { StatCard } from '../../components/layout/StatCard'
import { Card } from '../../components/layout/Card'
import { BarChart } from '../../components/layout/BarChart'

function hoyISO(): string {
  return new Date().toISOString().slice(0, 10)
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
  ])
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
  }
}

export const Route = createFileRoute('/admin/')({
  loader: loadDashboard,
  component: AdminDashboard,
})

const COP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })

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
  } = Route.useLoaderData()
  const lavadoresActivos = lavadores.filter((l) => l.activo).length
  const anuladasHoy = ordenesHoy.filter((o) => o.estado === 'anulada')
  const ventasActivasHoy = ventasHoy.filter((v) => v.estado === 'activa')

  // Solo lo cobrado hoy (estado entregado) cuenta como ingreso — un vehículo en proceso o
  // listo todavía no ha entrado dinero a caja por él, aunque ya tenga precio fijado.
  const ingresosLavadero = entregadasHoy.reduce((total, o) => total + o.precio, 0)
  const ingresosParqueadero = resumenParqueadero.dineroHoy
  const ingresosVentas = ventasActivasHoy.reduce((total, v) => total + v.total, 0)
  const ingresosTotales = ingresosLavadero + ingresosParqueadero + ingresosVentas

  const ingresosPorMetodo = entregadasHoy.reduce(
    (acc, o) => {
      if (o.metodoPago) acc[o.metodoPago] += o.precio
      return acc
    },
    { efectivo: 0, transferencia: 0, datafono: 0 } as Record<MetodoPago, number>,
  )

  const ventasPorMetodo = ventasActivasHoy.reduce(
    (acc, v) => {
      acc[v.metodoPago] += v.total
      return acc
    },
    { efectivo: 0, transferencia: 0, datafono: 0 } as Record<MetodoPago, number>,
  )

  const totalGastosHoy = gastosHoy.reduce((total, g) => total + g.monto, 0)
  const comisionesHoy = entregadasHoy.reduce((total, o) => total + o.comisionLavador, 0)
  const comisionesJefeZonaHoy = entregadasHoy.reduce((total, o) => total + o.comisionJefeZona, 0)
  const utilidadNetaHoy = ingresosTotales - comisionesHoy - comisionesJefeZonaHoy - totalGastosHoy
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

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-neutral-900">Operación de hoy</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Lavados de hoy"
            value={String(ordenesHoy.filter((o) => o.estado !== 'anulada').length)}
            icon={Droplets}
          />
          <StatCard label="Lavadores activos" value={String(lavadoresActivos)} icon={Users} />
          <StatCard label="Ocupación parqueadero" value={String(resumenParqueadero.vehiculosAdentro)} icon={CircleParking} />
          <StatCard
            label="Anulaciones de hoy"
            value={String(anuladasHoy.length)}
            hint={anuladasHoy.length > 0 ? 'Ver motivo en Operación › Órdenes' : undefined}
            icon={Ban}
            info={{
              title: 'Anulaciones de hoy',
              description:
                'Órdenes anuladas con motivo obligatorio (regla de negocio 13: nada se elimina). El detalle completo —motivo, quién anuló y cuándo— vive en Operación › Órdenes, junto con el histórico por rango de fechas.',
            }}
          />
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-neutral-900">Dinero de hoy</h2>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card className="text-left">
            <h3 className="mb-3 text-sm font-semibold text-neutral-900">Ingresos por línea y método</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-neutral-200 text-xs font-medium uppercase tracking-wide text-neutral-500">
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
                      <td className="py-2 text-neutral-500">{fila.linea}</td>
                      <td className="py-2 text-right text-neutral-700">
                        {fila.efectivo === undefined ? <span className="text-neutral-300">—</span> : COP.format(fila.efectivo)}
                      </td>
                      <td className="py-2 text-right text-neutral-700">
                        {fila.transferencia === undefined ? (
                          <span className="text-neutral-300">—</span>
                        ) : (
                          COP.format(fila.transferencia)
                        )}
                      </td>
                      <td className="py-2 text-right text-neutral-700">
                        {fila.datafono === undefined ? <span className="text-neutral-300">—</span> : COP.format(fila.datafono)}
                      </td>
                      <td className="py-2 text-right font-medium text-neutral-900">{COP.format(fila.total)}</td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-neutral-200">
                    <td className="py-2 font-medium text-neutral-700">Total</td>
                    <td className="py-2 text-right font-medium text-neutral-900">{COP.format(totalEfectivo)}</td>
                    <td className="py-2 text-right font-medium text-neutral-900">{COP.format(totalTransferencia)}</td>
                    <td className="py-2 text-right font-medium text-neutral-900">{COP.format(totalDatafono)}</td>
                    <td className="py-2 text-right font-semibold text-neutral-900">{COP.format(ingresosTotales)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-neutral-400">
              El parqueadero no registra método de pago todavía, por eso su valor solo aparece en la columna Total —
              las columnas de efectivo, transferencia y datáfono no lo incluyen. Datáfono muestra el monto bruto
              cobrado — cuánto llega neto a la cuenta (descuento de la pasarela) todavía no está configurado.
            </p>
          </Card>

          <Card className="text-left">
            <h3 className="mb-3 text-sm font-semibold text-neutral-900">Resultado del día (aprox.)</h3>
            <dl className="flex flex-col gap-2 text-sm">
              <div className="flex items-center justify-between">
                <dt className="text-neutral-500">Ingresos totales</dt>
                <dd className="font-medium text-neutral-900">{COP.format(ingresosTotales)}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-neutral-500">− Comisión de lavadores</dt>
                <dd className="font-medium text-danger-600">{COP.format(comisionesHoy)}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-neutral-500">− Comisión de jefe de patio</dt>
                <dd className="font-medium text-danger-600">{COP.format(comisionesJefeZonaHoy)}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-neutral-500">− Gastos del día</dt>
                <dd className="font-medium text-danger-600">{COP.format(totalGastosHoy)}</dd>
              </div>
              <div className="mt-1 flex items-center justify-between border-t-2 border-neutral-200 pt-2">
                <dt className="flex items-center gap-1.5 font-medium text-neutral-700">
                  <TrendingUp size={15} className="text-primary-500" />
                  Utilidad neta
                </dt>
                <dd className="text-lg font-semibold text-neutral-900">{COP.format(utilidadNetaHoy)}</dd>
              </div>
            </dl>
            <p className="mt-3 text-xs text-neutral-400">
              Incluye las ventas de productos como ingreso, pero todavía no resta su costo de mercancía. Tampoco
              descuenta el consumo de insumos de lavado ni refleja el arqueo real de caja.
            </p>
          </Card>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-neutral-900">Pendiente por pagar</h2>
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
            icon={HandCoins}
            info={{
              title: 'Comisión de jefe de patio pendiente',
              description:
                'Porcentaje de cada orden para quien estaba a cargo del turno de recepción cuando se registró el vehículo. El porcentaje se ajusta en Configuración y se liquida aparte de la de los lavadores.',
            }}
          />
        </div>
      </section>

      {totalesPorCategoria.length > 0 ? (
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-neutral-900">Gastos de hoy por categoría</h2>
            <Link
              to="/admin/dinero/gastos"
              className="flex items-center gap-1 text-xs font-medium text-primary-600 transition-colors hover:text-primary-700"
            >
              Ir a gastos <ArrowRight size={13} />
            </Link>
          </div>
          <Card className="text-left">
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
        </section>
      ) : null}
    </div>
  )
}
