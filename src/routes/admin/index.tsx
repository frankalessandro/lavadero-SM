import { useState, type ComponentType } from 'react'
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
  Hash,
  Layers,
  PieChart,
  ChevronRight,
} from 'lucide-react'
import { fetchOrdenesHoy, fetchOrdenesEntregadasHoy, fetchConsecutivosEnRango } from '../../data/ordenes'
import { fetchLavadores } from '../../data/lavadores'
import { fetchResumenHoy } from '../../data/estanciasParqueadero'
import { fetchGastos, fetchTotalGastosPorCategoria } from '../../data/gastos'
import { fetchComisionesPendientes } from '../../data/liquidaciones'
import { fetchComisionesPendientesJefeZona } from '../../data/liquidacionesJefeZona'
import { fetchVentasHoy, fetchCostoMercanciaVendida } from '../../data/ventas'
import { fetchPagosHoy } from '../../data/pagos'
import { fetchTurnoAbierto } from '../../data/turnos'
import { fetchAlertas } from '../../data/alertas'
import {
  fetchRentabilidadEnRango,
  resultadoPorLinea,
  ingresosTotalesDe,
  totalesVacio,
  bucketGasto,
} from '../../data/rentabilidad'
import type { MetodoPagoBase } from '../../schemas/orden'
import type { TurnoCaja } from '../../schemas/turnoCaja'
import { Card } from '../../components/layout/Card'
import { BarChart } from '../../components/layout/BarChart'
import { KpiCard } from '../../components/layout/KpiCard'
import { Modal } from '../../components/layout/Modal'
import { Button } from '../../components/layout/Button'
import { PageHeader, SectionHeader } from '../../components/layout/PageHeader'
import { AtencionPanel } from '../../components/layout/AtencionPanel'
import { calcularDelta } from '../../lib/kpi'
import { CHART_COLORS } from '../../lib/chartTheme'
import { huecosEntre } from '../../lib/consecutivo'
import { fechaLocalISO } from '../../lib/periodo'
import { COP, copCompacto, pct as PCT } from '../../lib/formato'

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
    consecutivos7d,
    alertas,
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
    (() => {
      const desde = new Date(); desde.setDate(desde.getDate() - 7); desde.setHours(0, 0, 0, 0)
      const hasta = new Date(); hasta.setDate(hasta.getDate() + 1); hasta.setHours(0, 0, 0, 0)
      return fetchConsecutivosEnRango(desde.toISOString(), hasta.toISOString())
    })(),
    fetchAlertas(),
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
    huecosConsecutivo7d: huecosEntre(consecutivos7d),
    alertas,
  }
}

export const Route = createFileRoute('/admin/')({
  loader: loadDashboard,
  component: AdminDashboard,
})

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
    huecosConsecutivo7d,
    alertas,
  } = Route.useLoaderData()
  const [modal, setModal] = useState<'resultado' | 'metodos' | null>(null)
  const [serieTendencia, setSerieTendencia] = useState<'ingresos' | 'utilidad'>('ingresos')
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
  // Otros ingresos de hoy (0078): vienen del mismo agregado por día de rentabilidad que ya trae el
  // loader (`ultimos7` incluye hoy), así el dashboard y /admin/rentabilidad no pueden divergir.
  const ingresosOtros = ultimos7.porDia.find((d) => d.fecha === hoyISO())?.ingresosOtros ?? 0
  const ingresosTotales = ingresosLavadero + ingresosParqueadero + ingresosVentas + ingresosOtros

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
    // Solo aparece el día que entró algo (alquiler, patrocinio…): no es operación diaria.
    ...(ingresosOtros > 0
      ? [{ linea: 'Otros ingresos', efectivo: undefined, transferencia: undefined, datafono: undefined, total: ingresosOtros }]
      : []),
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
      ingresos: d ? ingresosTotalesDe(d) : 0,
      utilidad: d?.utilidadNeta ?? 0,
    }
  })
  const ayer = porDiaMap.get(hace(1))
  const ingresosAyer = ayer ? ingresosTotalesDe(ayer) : 0
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

  // P&L por línea de negocio (0059) con las cifras vivas de hoy. Se construye un `RentabilidadTotales`
  // y se pasa por el MISMO `resultadoPorLinea` que usa /admin/rentabilidad, para que las dos
  // pantallas no puedan divergir en cómo descomponen el resultado. El desglose bebidas/snacks no se
  // arma acá a propósito: el dashboard es el pulso de hoy (glanceable), el desglose profundo vive en
  // rentabilidad — misma división de roles que ya documenta CLAUDE.md.
  const gastosPorLinea = gastosHoy.reduce(
    (acc, g) => {
      acc[bucketGasto(g)] += g.monto
      return acc
    },
    { gastosLavadero: 0, gastosProductos: 0, gastosParqueadero: 0, gastosGenerales: 0 },
  )
  const lineaHoy = resultadoPorLinea({
    ...totalesVacio(),
    ingresosLavadero,
    ingresosParqueadero,
    ingresosVentas,
    ingresosOtros,
    descuentos: descuentosHoy,
    comisionLavadores: comisionesHoy,
    comisionJefeZona: comisionesJefeZonaHoy,
    costoMercancia: costoMercancia.costo,
    gastos: totalGastosHoy,
    ventasSinCosto: costoMercancia.ventasSinCosto,
    ...gastosPorLinea,
  })


  const serieValores = serie7.map((d) => (serieTendencia === 'ingresos' ? d.ingresos : d.utilidad))
  const totalSemana = serieValores.reduce((a, b) => a + b, 0)
  const lineas = [
    { nombre: 'Lavadero', icon: Droplets, r: lineaHoy.lavadero },
    { nombre: 'Productos', icon: Layers, r: lineaHoy.productos },
    { nombre: 'Parqueadero', icon: CircleParking, r: lineaHoy.parqueadero },
  ]
  const metodos = [
    { label: 'Efectivo', valor: totalEfectivo, clase: 'bg-success-600' },
    { label: 'Transferencia', valor: totalTransferencia, clase: 'bg-primary-500' },
    { label: 'Datáfono', valor: totalDatafono, clase: 'bg-warning-600' },
  ]
  const totalMetodos = totalEfectivo + totalTransferencia + totalDatafono

  return (
    <div className="flex flex-col gap-6 lg:gap-8">
      <PageHeader
        showTitle
        title={`Hoy, ${FECHA_HOY.format(new Date())}`}
        description="Qué está pasando ahora, cuánto entró y cómo va contra ayer."
        help={{
          title: 'Cómo leer el dashboard',
          body:
            'Es el pulso de HOY. Arriba, lo que necesita una decisión tuya (pagos pendientes, faltantes, diferencias de caja). Luego las cifras del día contra ayer, la operación en curso y el dinero.\n\n' +
            'Solo lo cobrado (entregado) cuenta como ingreso. La utilidad es aproximada: no descuenta insumos de lavado ni refleja el arqueo real de caja.\n\n' +
            'Para analizar un periodo completo, fila por fila, usa Rentabilidad.',
        }}
        actions={
          <>
            <ChipCaja label="Lavadero" turno={turnoJefeZona} />
            <ChipCaja label="Parqueadero" turno={turnoVigilante} />
          </>
        }
      />

      <AtencionPanel alertas={alertas} />

      {/* KPIs contra ayer */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <KpiCard
          label="Utilidad del día"
          valor={COP.format(utilidadNetaHoy)}
          tono={utilidadNetaHoy >= 0 ? 'verde' : 'rojo'}
          icon={utilidadNetaHoy >= 0 ? TrendingUp : TrendingDown}
          delta={calcularDelta(utilidadNetaHoy, utilidadAyer, 'mayor-mejor', COP.format, 'vs. ayer')}
          sinComparacionLabel="sin movimiento ayer"
        />
        <KpiCard
          label="Ingresos del día"
          valor={COP.format(ingresosTotales)}
          tono="neutro"
          icon={Wallet}
          delta={calcularDelta(ingresosTotales, ingresosAyer, 'mayor-mejor', COP.format, 'vs. ayer')}
          sinComparacionLabel="sin movimiento ayer"
        />
        <KpiCard
          label="Lavados entregados"
          valor={String(entregadasHoy.length)}
          tono="neutro"
          icon={Droplets}
          sinComparacionLabel={`${enProceso + listos} todavía en el patio`}
        />
        <KpiCard
          label="Efectivo recibido"
          valor={COP.format(totalEfectivo)}
          tono="neutro"
          icon={Banknote}
          sinComparacionLabel="lavados + productos"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5 lg:gap-6">
        {/* Operación ahora */}
        <Card className="flex flex-col gap-5 p-5 lg:col-span-2">
          <SectionHeader
            title="Operación ahora"
            action={
              <Link
                to="/admin/operacion/ordenes"
                className="flex items-center gap-1 text-xs font-medium text-primary-600 transition-colors hover:text-primary-700"
              >
                Órdenes <ArrowRight size={13} />
              </Link>
            }
          />
          {totalFlujo > 0 ? (
            <div>
              <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-neutral-100">
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
              <ul className="mt-4 grid grid-cols-3 gap-2">
                {flujo.map((f) => (
                  <li key={f.label} className="rounded-xl bg-neutral-50 px-3 py-2.5">
                    <span className="flex items-center gap-1.5 text-[11px] text-neutral-500">
                      <span className={`size-2 shrink-0 rounded-full ${f.clase}`} />
                      <span className="truncate">{f.label}</span>
                    </span>
                    <span className={`mt-0.5 block text-2xl font-semibold tabular-nums ${f.texto}`}>{f.valor}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="rounded-xl bg-neutral-50 py-6 text-center text-sm text-neutral-400">
              Todavía no se ha registrado ningún vehículo hoy.
            </p>
          )}

          <div className="grid grid-cols-2 gap-2">
            <MiniDato icon={Users} label="Lavadores activos" valor={String(lavadoresActivos)} />
            <MiniDato icon={CircleParking} label="En parqueadero" valor={String(resumenParqueadero.vehiculosAdentro)} />
            <MiniDato
              icon={Ban}
              label="Anuladas hoy"
              valor={String(anuladasHoy.length)}
              alerta={anuladasHoy.length > 0}
              to="/admin/operacion/ordenes"
            />
            <MiniDato
              icon={Hash}
              label="Huecos consecutivo (7d)"
              valor={String(huecosConsecutivo7d.length)}
              alerta={huecosConsecutivo7d.length > 0}
              to="/admin/operacion/ordenes"
            />
          </div>

          {produccion.length > 0 ? (
            <div>
              <p className="mb-2 text-xs font-medium text-neutral-500">Lavados entregados por lavador</p>
              <ul className="flex flex-col gap-1.5">
                {produccion.map((p) => (
                  <li key={p.nombre} className="flex items-center gap-3 text-sm">
                    <span className="w-24 shrink-0 truncate text-neutral-600 sm:w-28">{p.nombre}</span>
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-neutral-100">
                      <span
                        className="block h-full rounded-full bg-primary-500"
                        style={{ width: `${(p.cantidad / produccion[0].cantidad) * 100}%` }}
                      />
                    </span>
                    <span className="w-6 shrink-0 text-right font-semibold tabular-nums text-neutral-900">{p.cantidad}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </Card>

        {/* Dinero de hoy */}
        <Card className="flex flex-col gap-5 p-5 lg:col-span-3">
          <SectionHeader
            title="Dinero de hoy"
            action={
              <Link
                to="/admin/rentabilidad"
                className="flex items-center gap-1 text-xs font-medium text-primary-600 transition-colors hover:text-primary-700"
              >
                Rentabilidad <ArrowRight size={13} />
              </Link>
            }
          />

          <div>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-xs font-medium text-neutral-500">Cobrado por método</span>
              <span className="text-xs tabular-nums text-neutral-400">
                + {COP.format(ingresosParqueadero)} parqueadero
              </span>
            </div>
            <div className="mt-2 flex h-2.5 w-full overflow-hidden rounded-full bg-neutral-100">
              {totalMetodos > 0
                ? metodos
                    .filter((m) => m.valor > 0)
                    .map((m) => (
                      <div key={m.label} className={m.clase} style={{ width: `${(m.valor / totalMetodos) * 100}%` }} />
                    ))
                : null}
            </div>
            <ul className="mt-3 grid grid-cols-1 gap-2 min-[420px]:grid-cols-3">
              {metodos.map((m) => (
                <li key={m.label} className="flex items-center justify-between gap-2 rounded-xl bg-neutral-50 px-3 py-2 min-[420px]:flex-col min-[420px]:items-start min-[420px]:gap-0.5">
                  <span className="flex items-center gap-1.5 text-[11px] text-neutral-500">
                    <span className={`size-2 rounded-full ${m.clase}`} />
                    {m.label}
                  </span>
                  <span className="text-sm font-semibold tabular-nums text-neutral-900">{COP.format(m.valor)}</span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <span className="text-xs font-medium text-neutral-500">Resultado por línea de negocio</span>
            <ul className="mt-2 divide-y divide-neutral-100 rounded-xl border border-neutral-100">
              {lineas.map(({ nombre, icon: Icon, r }) => (
                <li key={nombre} className="flex items-center gap-3 px-3 py-2.5">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-neutral-500">
                    <Icon size={15} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-neutral-800">{nombre}</span>
                    <span className="block text-[11px] tabular-nums text-neutral-400">
                      ingresos {COP.format(r.ingresos)}
                    </span>
                  </span>
                  <span className="text-right">
                    <span
                      className={`block text-sm font-semibold tabular-nums ${
                        r.ingresos === 0 ? 'text-neutral-400' : r.utilidad >= 0 ? 'text-success-700' : 'text-danger-600'
                      }`}
                    >
                      {COP.format(r.utilidad)}
                    </span>
                    {r.ingresos > 0 ? (
                      <span className="block text-[11px] tabular-nums text-neutral-400">margen {PCT(r.margen)}</span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div
            className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 ${
              utilidadNetaHoy >= 0 ? 'border-success-600/25 bg-success-50' : 'border-danger-600/25 bg-danger-50'
            }`}
          >
            <div>
              <p className="text-xs font-medium text-neutral-600">Queda hoy, tras gastos generales</p>
              <p
                className={`text-2xl font-semibold tracking-tight tabular-nums ${
                  utilidadNetaHoy >= 0 ? 'text-success-700' : 'text-danger-600'
                }`}
              >
                {COP.format(utilidadNetaHoy)}
              </p>
            </div>
            <span className="rounded-lg bg-white/70 px-2 py-1 text-xs font-semibold tabular-nums text-neutral-600">
              margen {PCT(margenHoy)}
            </span>
          </div>

          <div className="mt-auto flex flex-col gap-2 sm:flex-row">
            <Button icon={PieChart} className="flex-1" onClick={() => setModal('resultado')}>
              Ver cascada del día
            </Button>
            <Button icon={Banknote} className="flex-1" onClick={() => setModal('metodos')}>
              Línea × método de pago
            </Button>
          </div>
        </Card>
      </div>

      {/* Tendencia */}
      <Card className="p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-neutral-900">Últimos 7 días</h3>
            <p className="text-xs text-neutral-500">
              {serieTendencia === 'ingresos' ? 'Ingresos' : 'Utilidad'} de la semana:{' '}
              <span className="font-semibold tabular-nums text-neutral-700">{COP.format(totalSemana)}</span>
            </p>
          </div>
          <div className="flex w-full rounded-xl bg-neutral-100 p-1 sm:w-auto">
            {(['ingresos', 'utilidad'] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setSerieTendencia(k)}
                className={`flex-1 rounded-lg px-4 py-1.5 text-sm font-medium capitalize transition-colors sm:flex-none ${
                  serieTendencia === k ? 'bg-white text-primary-700 shadow-sm' : 'text-neutral-500 hover:text-neutral-800'
                }`}
              >
                {k}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-4">
          <BarChart
            horizontal={false}
            labels={serie7.map((d) => DIA_CORTO.format(dateFromISO(d.fecha)))}
            data={serieValores}
            colors={serie7.map((d, i) =>
              serieTendencia === 'utilidad'
                ? serieValores[i] >= 0
                  ? CHART_COLORS.success
                  : CHART_COLORS.danger
                : d.esHoy
                  ? CHART_COLORS.primary
                  : CHART_COLORS.primarySoft,
            )}
            valueFormatter={COP.format}
            axisFormatter={copCompacto}
            height={220}
          />
        </div>
        {ritmo.length > 2 && horaPico ? (
          <p className="mt-3 flex items-center gap-1.5 text-xs text-neutral-500">
            <Clock size={13} className="text-neutral-400" />
            Hora pico de hoy: <span className="font-medium text-neutral-700">{horaPico.hora}:00</span> ·{' '}
            {COP.format(horaPico.valor)} en lavados entregados
          </p>
        ) : null}
      </Card>

      {/* Por pagar y gastos */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3 lg:gap-6">
        <AccesoCifra
          to="/admin/dinero/liquidaciones"
          icon={HandCoins}
          label="Comisiones de lavadores sin liquidar"
          valor={COP.format(totalComisionesPendientes)}
          hint={`${COP.format(comisionesHoy)} generadas hoy`}
        />
        <AccesoCifra
          to="/admin/dinero/liquidaciones"
          icon={ShieldCheck}
          label="Comisión de jefe de patio sin liquidar"
          valor={COP.format(totalComisionesPendientesJefeZona)}
          hint={`${COP.format(comisionesJefeZonaHoy)} generadas hoy`}
        />
        <AccesoCifra
          to="/admin/dinero/gastos"
          icon={Receipt}
          label="Gastos de hoy"
          valor={COP.format(totalGastosHoy)}
          hint={
            totalesPorCategoria.length === 0
              ? 'Sin gastos cargados hoy'
              : totalesPorCategoria
                  .slice(0, 2)
                  .map((t) => t.categoriaNombre)
                  .join(', ') + (totalesPorCategoria.length > 2 ? '…' : '')
          }
          tono={totalGastosHoy > 0 ? 'danger' : 'neutro'}
        />
      </div>

      {modal === 'resultado' ? (
        <Modal
          title="Resultado del día"
          subtitle="Cada línea contra sus propios ingresos"
          icon={PieChart}
          size="md"
          flush
          onClose={() => setModal(null)}
        >
          <div className="pb-2">
            <EtiquetaLinea texto="Lavadero" margen={lineaHoy.lavadero.ingresos > 0 ? lineaHoy.lavadero.margen : undefined} />
            <FilaResultado label="Ingresos de lavado" valor={ingresosLavadero} pct={100} tipo="ingreso" />
            <FilaResultado label="Comisión de lavadores" valor={comisionesHoy} pct={pctDe(comisionesHoy, lineaHoy.lavadero.ingresos)} tipo="egreso" />
            <FilaResultado
              label="Comisión de jefe de patio"
              valor={comisionesJefeZonaHoy}
              pct={pctDe(comisionesJefeZonaHoy, lineaHoy.lavadero.ingresos)}
              tipo="egreso"
            />
            {lineaHoy.lavadero.gastos > 0 ? (
              <FilaResultado
                label="Gastos del lavadero"
                valor={lineaHoy.lavadero.gastos}
                pct={pctDe(lineaHoy.lavadero.gastos, lineaHoy.lavadero.ingresos)}
                tipo="egreso"
              />
            ) : null}
            <SubtotalLinea label="Margen del lavadero" valor={lineaHoy.lavadero.utilidad} margen={lineaHoy.lavadero.margen} vacio={lineaHoy.lavadero.ingresos === 0} />

            <EtiquetaLinea texto="Productos" margen={lineaHoy.productos.ingresos > 0 ? lineaHoy.productos.margen : undefined} />
            <FilaResultado label="Venta de productos" valor={ingresosVentas} pct={100} tipo="ingreso" />
            <FilaResultado
              label="Costo de la mercancía"
              valor={costoMercancia.costo}
              pct={pctDe(costoMercancia.costo, lineaHoy.productos.ingresos)}
              tipo="egreso"
            />
            {lineaHoy.productos.gastos > 0 ? (
              <FilaResultado
                label="Gastos de productos"
                valor={lineaHoy.productos.gastos}
                pct={pctDe(lineaHoy.productos.gastos, lineaHoy.productos.ingresos)}
                tipo="egreso"
              />
            ) : null}
            <SubtotalLinea label="Margen de productos" valor={lineaHoy.productos.utilidad} margen={lineaHoy.productos.margen} vacio={lineaHoy.productos.ingresos === 0} />

            <EtiquetaLinea texto="Parqueadero" margen={lineaHoy.parqueadero.ingresos > 0 ? lineaHoy.parqueadero.margen : undefined} />
            <FilaResultado label="Cobros de salida" valor={ingresosParqueadero} pct={100} tipo="ingreso" />
            {lineaHoy.parqueadero.gastos > 0 ? (
              <FilaResultado
                label="Gastos del parqueadero"
                valor={lineaHoy.parqueadero.gastos}
                pct={pctDe(lineaHoy.parqueadero.gastos, lineaHoy.parqueadero.ingresos)}
                tipo="egreso"
              />
            ) : null}
            <SubtotalLinea label="Margen del parqueadero" valor={lineaHoy.parqueadero.utilidad} margen={lineaHoy.parqueadero.margen} vacio={lineaHoy.parqueadero.ingresos === 0} />

            {ingresosOtros > 0 ? (
              <>
                <EtiquetaLinea texto="Otros ingresos" margen={100} />
                <FilaResultado label="Alquileres, patrocinios…" valor={ingresosOtros} pct={100} tipo="ingreso" />
                <SubtotalLinea label="Margen de otros ingresos" valor={lineaHoy.otros.utilidad} margen={lineaHoy.otros.margen} vacio={false} />
              </>
            ) : null}

            <div className="mt-2 flex flex-col gap-1.5 px-5 py-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-neutral-500">Margen bruto{ingresosOtros > 0 ? ' de las líneas' : ' de las 3 líneas'}</span>
                <span className="font-medium tabular-nums text-neutral-900">{COP.format(lineaHoy.margenBrutoTotal)}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-neutral-500">Gastos generales</span>
                <span className="font-medium tabular-nums text-danger-600">− {COP.format(lineaHoy.gastosGenerales)}</span>
              </div>
              <div className="mt-1 flex items-center justify-between gap-3 border-t border-neutral-100 pt-2.5">
                <span className="font-semibold text-neutral-900">Utilidad neta</span>
                <span className={`text-lg font-semibold tabular-nums ${utilidadNetaHoy >= 0 ? 'text-success-700' : 'text-danger-600'}`}>
                  {COP.format(utilidadNetaHoy)}
                </span>
              </div>
            </div>
            <p className="px-5 pb-3 text-xs leading-relaxed text-neutral-400">
              Aproximado: no descuenta insumos de lavado ni refleja el arqueo real de caja.
              {descuentosHoy > 0 ? ` Incluye ${COP.format(descuentosHoy)} en descuentos absorbidos por el negocio.` : ''}
              {costoMercancia.ventasSinCosto > 0 ? (
                <span className="text-warning-600">
                  {' '}
                  {costoMercancia.ventasSinCosto === 1
                    ? '1 venta no tiene costo registrado'
                    : `${costoMercancia.ventasSinCosto} ventas no tienen costo registrado`}
                  , así que la utilidad sale algo más alta de lo real.
                </span>
              ) : null}
            </p>
          </div>
        </Modal>
      ) : null}

      {modal === 'metodos' ? (
        <Modal
          title="Ingresos por línea y método"
          subtitle="Lo cobrado hoy, según las líneas de pago registradas"
          icon={Banknote}
          size="lg"
          flush
          onClose={() => setModal(null)}
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[32rem] text-sm">
              <thead>
                <tr className="border-b border-neutral-200 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
                  <th className="px-5 py-3 text-left">Línea</th>
                  <th className="px-3 py-3 text-right">Efectivo</th>
                  <th className="px-3 py-3 text-right">Transfer.</th>
                  <th className="px-3 py-3 text-right">Datáfono</th>
                  <th className="px-5 py-3 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {filasIngresos.map((fila) => (
                  <tr key={fila.linea} className="border-b border-neutral-100">
                    <td className="px-5 py-3 text-neutral-600">{fila.linea}</td>
                    {[fila.efectivo, fila.transferencia, fila.datafono].map((v, i) => (
                      <td key={i} className="px-3 py-3 text-right tabular-nums text-neutral-700">
                        {v === undefined ? <span className="text-neutral-300">—</span> : COP.format(v)}
                      </td>
                    ))}
                    <td className="px-5 py-3 text-right font-medium tabular-nums text-neutral-900">{COP.format(fila.total)}</td>
                  </tr>
                ))}
                <tr className="bg-neutral-50 font-semibold">
                  <td className="px-5 py-3 text-neutral-700">Total</td>
                  <td className="px-3 py-3 text-right tabular-nums text-neutral-900">{COP.format(totalEfectivo)}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-neutral-900">{COP.format(totalTransferencia)}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-neutral-900">{COP.format(totalDatafono)}</td>
                  <td className="px-5 py-3 text-right tabular-nums text-neutral-900">{COP.format(ingresosTotales)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="px-5 py-4 text-xs leading-relaxed text-neutral-400">
            El parqueadero no registra método de pago todavía, por eso su valor solo aparece en Total. Datáfono es el
            monto bruto cobrado.
          </p>
        </Modal>
      ) : null}
    </div>
  )
}

// --- Piezas locales del dashboard ---

// Estado de una caja: verde con responsable si hay turno abierto, gris si no. Solo informativo
// (no es un enlace ni un botón).
function ChipCaja({ label, turno }: { label: string; turno: TurnoCaja | undefined }) {
  const abierta = Boolean(turno)
  return (
    <div
      className={`inline-flex min-w-0 items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-medium ${
        abierta ? 'border-success-600/25 bg-success-50 text-success-700' : 'border-neutral-200 bg-white text-neutral-500'
      }`}
      title={
        turno
          ? `${turno.responsableActual} · abierta ${HORA.format(new Date(turno.abiertoEn))}`
          : 'No hay turno de caja abierto'
      }
    >
      {abierta ? <LockOpen size={13} className="shrink-0" /> : <Lock size={13} className="shrink-0" />}
      <span className="shrink-0">{label}</span>
      <span className="truncate font-normal opacity-80">{turno ? `· ${turno.responsableActual}` : '· cerrada'}</span>
    </div>
  )
}

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
          alerta ? 'bg-danger-50 text-danger-600' : 'bg-white text-neutral-500'
        }`}
      >
        <Icon size={15} strokeWidth={2} />
      </span>
      <span className="min-w-0">
        <span className={`block text-base font-semibold tabular-nums ${alerta ? 'text-danger-600' : 'text-neutral-900'}`}>
          {valor}
        </span>
        <span className="block truncate text-[11px] text-neutral-500">{label}</span>
      </span>
    </>
  )
  const clases = 'flex items-center gap-2.5 rounded-xl bg-neutral-50 px-3 py-2.5'
  if (to) {
    return (
      <Link to={to} className={`${clases} transition-colors hover:bg-primary-50`}>
        {contenido}
      </Link>
    )
  }
  return <div className={clases}>{contenido}</div>
}

// Cifra de "por pagar / gastado" que lleva a su pantalla — toda la tarjeta es el enlace.
function AccesoCifra({
  to,
  icon: Icon,
  label,
  valor,
  hint,
  tono = 'neutro',
}: {
  to: string
  icon: ComponentType<{ size?: number; strokeWidth?: number }>
  label: string
  valor: string
  hint: string
  tono?: 'neutro' | 'danger'
}) {
  return (
    <Link
      to={to}
      className="group flex items-center gap-4 rounded-2xl border border-neutral-200 bg-white p-4 shadow-card transition-shadow hover:shadow-card-hover"
    >
      <span
        className={`flex size-11 shrink-0 items-center justify-center rounded-xl ${
          tono === 'danger' ? 'bg-danger-50 text-danger-600' : 'bg-primary-50 text-primary-600'
        }`}
      >
        <Icon size={20} strokeWidth={2} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-medium text-neutral-500">{label}</span>
        <span className="block text-lg font-semibold tabular-nums text-neutral-900">{valor}</span>
        <span className="block truncate text-xs text-neutral-400">{hint}</span>
      </span>
      <ChevronRight size={18} className="shrink-0 text-neutral-300 transition-colors group-hover:text-primary-600" />
    </Link>
  )
}

/** Peso de una cifra sobre el denominador de SU línea (0–100). */
function pctDe(parte: number, total: number): number {
  return total > 0 ? (parte / total) * 100 : 0
}

/** Encabezado de una línea de negocio dentro del resultado, con su margen al lado. */
function EtiquetaLinea({ texto, margen }: { texto: string; margen?: number }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 pb-1 pt-4">
      <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-400">{texto}</span>
      <span className="h-px min-w-4 flex-1 bg-neutral-100" />
      {margen !== undefined ? (
        <span
          className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${
            margen >= 0 ? 'bg-success-600/10 text-success-700' : 'bg-danger-600/10 text-danger-700'
          }`}
        >
          {PCT(margen)}
        </span>
      ) : null}
    </div>
  )
}

/** Lo que queda de una línea de negocio, antes de los gastos generales. */
function SubtotalLinea({
  label,
  valor,
  margen,
  vacio,
}: {
  label: string
  valor: number
  margen: number
  vacio: boolean
}) {
  const negativo = valor < 0
  return (
    <div
      className={`mt-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-y px-5 py-2 ${
        vacio
          ? 'border-neutral-100 bg-neutral-50'
          : negativo
            ? 'border-danger-600/25 bg-danger-50/60'
            : 'border-success-600/25 bg-success-600/10'
      }`}
    >
      <span className="text-sm font-medium text-neutral-700">{label}</span>
      <div className="flex items-baseline gap-2">
        {!vacio ? <span className="text-[11px] tabular-nums text-neutral-400">{PCT(margen)}</span> : null}
        <span
          className={`text-sm font-semibold tabular-nums ${
            vacio ? 'text-neutral-400' : negativo ? 'text-danger-700' : 'text-success-700'
          }`}
        >
          {COP.format(valor)}
        </span>
      </div>
    </div>
  )
}

// Fila de la cascada del "Resultado del día" — barra cuyo ancho es el peso sobre los ingresos de
// SU línea, mismo recurso visual que /admin/rentabilidad.
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
