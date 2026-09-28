// Indicadores de M11 que complementan el panel de rentabilidad (2026-09-28). Viven aparte de
// index.tsx para no inflar más esa página; el prefijo "-" hace que TanStack Router ignore el
// archivo como ruta. Todo se calcula a partir del mismo `RentabilidadReporte` (src/data/rentabilidad.ts).
import type { ComponentType, ReactNode } from 'react'
import { Banknote, CalendarRange, CreditCard, Landmark, Scale, TrendingDown, TrendingUp } from 'lucide-react'
import type { AcumuladoAnual, RentabilidadReporte } from '../../../data/rentabilidad'
import { resultadoPorLinea } from '../../../data/rentabilidad'
import { CLASE_VEHICULO_LABEL } from '../../../schemas/estanciaParqueadero'
import { Card } from '../../../components/layout/Card'
import { BarChart } from '../../../components/layout/BarChart'
import { KpiCard } from '../../../components/layout/KpiCard'
import { SectionHeader } from '../../../components/layout/PageHeader'
import { calcularDelta } from '../../../lib/kpi'
import { CHART_COLORS } from '../../../lib/chartTheme'
import { COP, copCompacto, pct } from '../../../lib/formato'

type Icono = ComponentType<{ size?: number; strokeWidth?: number; className?: string }>

const MODALIDAD_LABEL = { noche: 'Noche', mensualidad: 'Mensualidad', fijo: 'Fijo 24h' } as const
const DIAS_SEMANA = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

export function Vacio({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-2xl border border-dashed border-neutral-200 bg-white px-4 py-8 text-center text-sm text-neutral-400">
      {children}
    </p>
  )
}

function Tabla({ encabezados, children, derecha = [] }: { encabezados: string[]; children: ReactNode; derecha?: number[] }) {
  return (
    <Card className="p-0">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[34rem] text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-left text-xs font-medium uppercase tracking-wide text-neutral-500">
              {encabezados.map((e, i) => (
                <th key={e} className={`px-4 py-3 ${derecha.includes(i) ? 'text-right' : ''}`}>
                  {e}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
      </div>
    </Card>
  )
}

function ChipMargen({ valor }: { valor: number }) {
  return (
    <span
      className={`rounded-md px-1.5 py-0.5 text-xs font-semibold tabular-nums ${
        valor >= 0 ? 'bg-success-600/10 text-success-700' : 'bg-danger-600/10 text-danger-700'
      }`}
    >
      {pct(valor)}
    </span>
  )
}

// ── Resumen ──────────────────────────────────────────────────────────────────────────────────

export function IngresosPorMetodo({ reporte }: { reporte: RentabilidadReporte }) {
  const m = reporte.ingresosPorMetodo
  const filas: { label: string; valor: number; icon: Icono; clase: string }[] = [
    { label: 'Efectivo', valor: m.efectivo, icon: Banknote, clase: 'bg-success-600' },
    { label: 'Transferencia', valor: m.transferencia, icon: Landmark, clase: 'bg-primary-500' },
    { label: 'Datáfono', valor: m.datafono, icon: CreditCard, clase: 'bg-warning-600' },
  ]
  const total = m.efectivo + m.transferencia + m.datafono
  return (
    <Card className="flex flex-col gap-4 p-5">
      <SectionHeader title="Cobrado por método de pago" hint="Lavados y productos. El parqueadero va aparte." />
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-neutral-100">
        {total > 0
          ? filas.filter((f) => f.valor > 0).map((f) => <div key={f.label} className={f.clase} style={{ width: `${(f.valor / total) * 100}%` }} />)
          : null}
      </div>
      <ul className="flex flex-col gap-2.5 text-sm">
        {filas.map(({ label, valor, icon: Icon, clase }) => (
          <li key={label} className="flex items-center gap-3">
            <span className={`size-2.5 shrink-0 rounded-full ${clase}`} />
            <Icon size={15} className="shrink-0 text-neutral-400" />
            <span className="flex-1 text-neutral-600">{label}</span>
            <span className="text-xs tabular-nums text-neutral-400">{total > 0 ? pct((valor / total) * 100) : '—'}</span>
            <span className="w-28 text-right font-semibold tabular-nums text-neutral-900">{COP.format(valor)}</span>
          </li>
        ))}
        <li className="flex items-center gap-3 border-t border-neutral-100 pt-2.5">
          <span className="size-2.5 shrink-0" />
          <span className="flex-1 text-neutral-500">Parqueadero</span>
          <span className="w-28 text-right font-medium tabular-nums text-neutral-700">
            {COP.format(reporte.totales.ingresosParqueadero)}
          </span>
        </li>
      </ul>
    </Card>
  )
}

export function AcumuladoAnualCard({ anual }: { anual: AcumuladoAnual | null }) {
  if (!anual) {
    return (
      <Card className="flex items-center justify-center p-5 text-sm text-neutral-400">Calculando el acumulado del año…</Card>
    )
  }
  const ingresos = (t: AcumuladoAnual['actual']) => t.ingresosLavadero + t.ingresosParqueadero + t.ingresosVentas
  const sinAnterior = ingresos(anual.anterior) === 0 && anual.anterior.lavados === 0
  const sufijo = `vs. ${anual.anio - 1}`
  return (
    <Card className="flex flex-col gap-4 p-5">
      <SectionHeader
        title={`Acumulado del año ${anual.anio}`}
        hint={sinAnterior ? `Del 1 de enero a hoy. Sin datos de ${anual.anio - 1} para comparar.` : `Del 1 de enero a hoy, contra el mismo tramo de ${anual.anio - 1}.`}
      />
      <div className="grid grid-cols-2 gap-3">
        <KpiCard
          label="Ingresos"
          valor={copCompacto(ingresos(anual.actual))}
          tono="neutro"
          icon={TrendingUp}
          delta={sinAnterior ? null : calcularDelta(ingresos(anual.actual), ingresos(anual.anterior), 'mayor-mejor', copCompacto, sufijo)}
          sinComparacionLabel={`${anual.actual.lavados} lavados`}
        />
        <KpiCard
          label="Utilidad neta"
          valor={copCompacto(anual.actual.utilidadNeta)}
          tono={anual.actual.utilidadNeta >= 0 ? 'verde' : 'rojo'}
          icon={anual.actual.utilidadNeta >= 0 ? TrendingUp : TrendingDown}
          delta={sinAnterior ? null : calcularDelta(anual.actual.utilidadNeta, anual.anterior.utilidadNeta, 'mayor-mejor', copCompacto, sufijo)}
          sinComparacionLabel={`margen ${pct(anual.actual.margen)}`}
        />
      </div>
    </Card>
  )
}

// ── Servicios ────────────────────────────────────────────────────────────────────────────────

export function MargenPorTipo({ reporte }: { reporte: RentabilidadReporte }) {
  return (
    <section className="flex flex-col gap-3">
      <SectionHeader
        title="Margen por tipo de vehículo"
        hint="Margen de contribución: lo cobrado menos comisiones de lavador y jefe de patio. Los gastos no se reparten por tipo."
      />
      {reporte.porTipoVehiculo.length === 0 ? (
        <Vacio>Sin lavados entregados en el periodo.</Vacio>
      ) : (
        <Tabla encabezados={['Tipo', 'Lavados', 'Ingreso', 'Comisiones', 'Margen', '%']} derecha={[1, 2, 3, 4, 5]}>
          {reporte.porTipoVehiculo.map((t) => (
            <tr key={t.tipoId} className="border-b border-neutral-100 last:border-0">
              <td className="px-4 py-3 font-medium text-neutral-900">{t.nombre}</td>
              <td className="px-4 py-3 text-right text-neutral-600">{t.cantidad}</td>
              <td className="px-4 py-3 text-right text-neutral-700">{COP.format(t.ingreso)}</td>
              <td className="px-4 py-3 text-right text-danger-600">{COP.format(t.comisiones)}</td>
              <td className="px-4 py-3 text-right font-semibold text-neutral-900">{COP.format(t.margen)}</td>
              <td className="px-4 py-3 text-right">
                <ChipMargen valor={t.margenPct} />
              </td>
            </tr>
          ))}
        </Tabla>
      )}
    </section>
  )
}

// ── Personal ─────────────────────────────────────────────────────────────────────────────────

export function PicosDemanda({ reporte }: { reporte: RentabilidadReporte }) {
  const horas = reporte.demandaPorHora
    .map((n, h) => ({ h, n }))
    .filter(({ h, n }) => n > 0 || (h >= 7 && h <= 18))
  const maxHora = horas.reduce((a, b) => (b.n > a.n ? b : a), { h: 0, n: 0 })
  const maxDia = reporte.demandaPorDiaSemana.reduce((a, n, i) => (n > a.n ? { i, n } : a), { i: 0, n: 0 })
  if (reporte.cantidadLavados === 0) return null
  return (
    <section className="flex flex-col gap-3">
      <SectionHeader
        title="Horas y días pico"
        hint="Vehículos que llegaron, por hora y por día. Sirve para dimensionar cuántos lavadores hacen falta y cuándo."
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <p className="mb-3 text-xs text-neutral-500">
            Hora más fuerte: <span className="font-semibold text-neutral-900">{maxHora.h}:00</span> ({maxHora.n} vehículos)
          </p>
          <BarChart
            horizontal={false}
            labels={horas.map(({ h }) => `${h}h`)}
            data={horas.map(({ n }) => n)}
            colors={horas.map(({ h }) => (h === maxHora.h ? CHART_COLORS.primary : CHART_COLORS.primarySoft))}
            valueFormatter={(n) => `${n} vehículos`}
            axisFormatter={(n) => `${n}`}
            height={200}
          />
        </Card>
        <Card className="p-5">
          <p className="mb-3 text-xs text-neutral-500">
            Día más fuerte: <span className="font-semibold text-neutral-900">{DIAS_SEMANA[maxDia.i]}</span> ({maxDia.n} vehículos)
          </p>
          <BarChart
            horizontal={false}
            labels={DIAS_SEMANA}
            data={reporte.demandaPorDiaSemana}
            colors={reporte.demandaPorDiaSemana.map((_, i) => (i === maxDia.i ? CHART_COLORS.primary : CHART_COLORS.primarySoft))}
            valueFormatter={(n) => `${n} vehículos`}
            axisFormatter={(n) => `${n}`}
            height={200}
          />
        </Card>
      </div>
    </section>
  )
}

// ── Parqueadero ──────────────────────────────────────────────────────────────────────────────

export function ParqueaderoDetalle({ reporte }: { reporte: RentabilidadReporte }) {
  const filas = reporte.parqueadero
  const total = filas.reduce((s, f) => s + f.total, 0)
  const multas = filas.reduce((s, f) => s + f.multas, 0)
  const salidas = filas.reduce((s, f) => s + f.salidas, 0)
  const porModalidad = (['noche', 'mensualidad', 'fijo'] as const).map((m) => ({
    modalidad: m,
    total: filas.filter((f) => f.modalidad === m).reduce((s, f) => s + f.total, 0),
    salidas: filas.filter((f) => f.modalidad === m).reduce((s, f) => s + f.salidas, 0),
  }))
  return (
    <section className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Cobrado" valor={COP.format(total)} tono="neutro" icon={TrendingUp} sinComparacionLabel={`${salidas} salidas`} />
        <KpiCard label="De eso, multas" valor={COP.format(multas)} tono={multas > 0 ? 'rojo-suave' : 'neutro'} icon={Scale} sinComparacionLabel="salidas después de las 8:00 am" />
        {porModalidad
          .filter((m) => m.modalidad !== 'mensualidad' || m.salidas > 0)
          .slice(0, 2)
          .map((m) => (
            <KpiCard
              key={m.modalidad}
              label={MODALIDAD_LABEL[m.modalidad]}
              valor={COP.format(m.total)}
              tono="neutro"
              icon={CalendarRange}
              sinComparacionLabel={`${m.salidas} salidas`}
            />
          ))}
      </div>
      <SectionHeader
        title="Por modalidad y vehículo"
        hint="Solo la noche cobra en cada salida. Mensualidad y fijo se cobran aparte a cada suscriptor, así que aquí cuentan movimientos."
      />
      {filas.length === 0 ? (
        <Vacio>Sin salidas del parqueadero en el periodo.</Vacio>
      ) : (
        <Tabla encabezados={['Modalidad', 'Vehículo', 'Salidas', 'Tarifas', 'Multas', 'Total']} derecha={[2, 3, 4, 5]}>
          {filas.map((f) => (
            <tr key={`${f.modalidad}:${f.clase}`} className="border-b border-neutral-100 last:border-0">
              <td className="px-4 py-3 font-medium text-neutral-900">{MODALIDAD_LABEL[f.modalidad]}</td>
              <td className="px-4 py-3 text-neutral-600">{CLASE_VEHICULO_LABEL[f.clase]}</td>
              <td className="px-4 py-3 text-right text-neutral-600">{f.salidas}</td>
              <td className="px-4 py-3 text-right text-neutral-700">{COP.format(f.tarifas)}</td>
              <td className={`px-4 py-3 text-right ${f.multas > 0 ? 'text-warning-700' : 'text-neutral-400'}`}>{COP.format(f.multas)}</td>
              <td className="px-4 py-3 text-right font-semibold text-neutral-900">{COP.format(f.total)}</td>
            </tr>
          ))}
        </Tabla>
      )}
    </section>
  )
}

// ── Productos ────────────────────────────────────────────────────────────────────────────────

export function ProductosRotacion({ reporte }: { reporte: RentabilidadReporte }) {
  const porUnidades = [...reporte.productos].sort((a, b) => b.cantidad - a.cantidad)
  return (
    <section className="flex flex-col gap-3">
      <SectionHeader title="Productos de mayor rotación" hint="Ordenados por unidades vendidas. El margen es venta menos costo de la mercancía." />
      {porUnidades.length === 0 ? (
        <Vacio>Sin ventas de productos en el periodo.</Vacio>
      ) : (
        <>
          {porUnidades.length > 2 ? (
            <Card className="p-5">
              <BarChart
                labels={porUnidades.slice(0, 10).map((p) => p.nombre)}
                data={porUnidades.slice(0, 10).map((p) => p.cantidad)}
                valueFormatter={(n) => `${n} unid.`}
                axisFormatter={(n) => `${n}`}
                height={Math.max(140, Math.min(10, porUnidades.length) * 34)}
              />
            </Card>
          ) : null}
          <Tabla encabezados={['Producto', 'Unidades', 'Venta', 'Costo', 'Margen', '%']} derecha={[1, 2, 3, 4, 5]}>
            {porUnidades.map((p) => (
              <tr key={p.productoId} className="border-b border-neutral-100 last:border-0">
                <td className="px-4 py-3 font-medium text-neutral-900">{p.nombre}</td>
                <td className="px-4 py-3 text-right text-neutral-600">{p.cantidad}</td>
                <td className="px-4 py-3 text-right text-neutral-700">{COP.format(p.ingreso)}</td>
                <td className="px-4 py-3 text-right text-danger-600">{COP.format(p.costo)}</td>
                <td className="px-4 py-3 text-right font-semibold text-neutral-900">{COP.format(p.margen)}</td>
                <td className="px-4 py-3 text-right">
                  <ChipMargen valor={p.ingreso > 0 ? (p.margen / p.ingreso) * 100 : 0} />
                </td>
              </tr>
            ))}
          </Tabla>
        </>
      )}
    </section>
  )
}

export function ConsumoInsumos({ reporte }: { reporte: RentabilidadReporte }) {
  const filas = reporte.consumoInsumos
  return (
    <section className="flex flex-col gap-3">
      <SectionHeader
        title="Consumo de insumos vs. lavados"
        hint={`Cuánto insumo se gastó por lavado (${reporte.cantidadLavados} lavados en el periodo, ${reporte.lavadosPrevio} en el anterior). Un salto grande contra el periodo anterior es un desvío a revisar.`}
      />
      {filas.length === 0 ? (
        <Vacio>
          No hay consumo de insumos registrado en el periodo. Para que este cruce funcione, el jefe de patio debe registrar
          las salidas de jabón, cera, etc. en Inventario › Movimiento.
        </Vacio>
      ) : (
        <Tabla encabezados={['Insumo', 'Consumido', 'Por lavado', 'Periodo anterior', 'Variación']} derecha={[1, 2, 3, 4]}>
          {filas.map((f) => {
            const alerta = f.variacionPct !== null && Math.abs(f.variacionPct) >= 25
            return (
              <tr key={f.productoId} className="border-b border-neutral-100 last:border-0">
                <td className="px-4 py-3 font-medium text-neutral-900">{f.nombre}</td>
                <td className="px-4 py-3 text-right text-neutral-600">
                  {f.cantidad} {f.unidad}
                </td>
                <td className="px-4 py-3 text-right font-medium text-neutral-900">{f.porLavado.toFixed(2)}</td>
                <td className="px-4 py-3 text-right text-neutral-500">{f.porLavadoPrevio !== null ? f.porLavadoPrevio.toFixed(2) : '—'}</td>
                <td className={`px-4 py-3 text-right font-semibold ${alerta ? 'text-danger-600' : 'text-neutral-500'}`}>
                  {f.variacionPct !== null ? `${f.variacionPct > 0 ? '+' : ''}${f.variacionPct.toFixed(0)}%` : '—'}
                </td>
              </tr>
            )
          })}
        </Tabla>
      )}
    </section>
  )
}

// ── Gastos ───────────────────────────────────────────────────────────────────────────────────

// Punto de equilibrio (Plan M11): cuántos lavados al día hacen falta para cubrir los gastos del
// periodo, después de lo que ya aportan productos y parqueadero. Se usa el margen de contribución
// promedio por lavado (cobrado − comisiones) del mismo periodo.
export function PuntoEquilibrio({ reporte }: { reporte: RentabilidadReporte }) {
  const linea = resultadoPorLinea(reporte.totales)
  const lavados = reporte.cantidadLavados
  const contribucionLavado = lavados > 0 ? (linea.lavadero.ingresos - linea.lavadero.costosDirectos) / lavados : 0
  const aporteOtras = linea.productos.utilidad + linea.parqueadero.utilidad
  const porCubrir = Math.max(0, reporte.totales.gastos - linea.productos.gastos - linea.parqueadero.gastos - aporteOtras)
  const lavadosNecesarios = contribucionLavado > 0 ? porCubrir / contribucionLavado : null
  const porDiaNecesarios = lavadosNecesarios !== null ? lavadosNecesarios / reporte.diasPeriodo : null
  const porDiaReales = lavados / reporte.diasPeriodo
  const cubre = porDiaNecesarios !== null && porDiaReales >= porDiaNecesarios
  return (
    <Card className="flex flex-col gap-4 p-5">
      <SectionHeader
        title="Punto de equilibrio"
        hint={`Lavados diarios necesarios para cubrir los gastos del periodo (${reporte.diasPeriodo} día${reporte.diasPeriodo === 1 ? '' : 's'}), descontando lo que ya aportan productos y parqueadero.`}
      />
      {reporte.totales.gastos === 0 ? (
        <Vacio>Sin gastos cargados en el periodo: no hay punto de equilibrio que calcular todavía.</Vacio>
      ) : porDiaNecesarios === null ? (
        <Vacio>Sin lavados en el periodo para calcular el aporte por lavado.</Vacio>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <KpiCard label="Necesarios por día" valor={porDiaNecesarios.toFixed(1)} tono="neutro" icon={Scale} sinComparacionLabel={`aporte por lavado ${COP.format(Math.round(contribucionLavado))}`} />
            <KpiCard
              label="Reales por día"
              valor={porDiaReales.toFixed(1)}
              tono={cubre ? 'verde' : 'rojo'}
              icon={cubre ? TrendingUp : TrendingDown}
              sinComparacionLabel={cubre ? 'por encima del equilibrio' : 'por debajo del equilibrio'}
            />
          </div>
          <p className="text-xs leading-relaxed text-neutral-500">
            Gastos por cubrir con lavados: <span className="font-medium text-neutral-700">{COP.format(porCubrir)}</span>. Si la
            cifra es 0, productos y parqueadero ya cubren solos los gastos del periodo.
          </p>
        </>
      )}
    </Card>
  )
}

export function TendenciaGastos({ reporte }: { reporte: RentabilidadReporte }) {
  const dias = reporte.porDia.filter((d) => d.gastos > 0 || d.ingresosLavadero > 0)
  if (reporte.gastos.length === 0 || dias.length < 3) return null
  const FECHA = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short' })
  return (
    <Card className="p-5">
      <SectionHeader title="Tendencia de gastos" hint="Gasto registrado por día en el periodo." />
      <div className="mt-3">
        <BarChart
          horizontal={false}
          labels={dias.map((d) => {
            const [y, m, dd] = d.fecha.split('-').map(Number)
            return FECHA.format(new Date(y, m - 1, dd))
          })}
          data={dias.map((d) => d.gastos)}
          color={CHART_COLORS.danger}
          valueFormatter={COP.format}
          axisFormatter={copCompacto}
          height={200}
        />
      </div>
    </Card>
  )
}

