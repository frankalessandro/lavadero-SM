import { useMemo, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { ClipboardCheck, ClipboardList, Repeat2, Scale, TrendingDown, UserRound } from 'lucide-react'
import { fetchTurnos } from '../../../../data/turnos'
import { fetchCorreccionesEnRango, type CorreccionReparto } from '../../../../data/pagos'
import { fetchCombos } from '../../../../data/combos'
import { fetchLavadores } from '../../../../data/lavadores'
import { fetchProductos } from '../../../../data/productos'
import type { RolCaja, TurnoCaja } from '../../../../schemas/turnoCaja'
import { Card } from '../../../../components/layout/Card'
import { StatCard } from '../../../../components/layout/StatCard'
import { BarChart } from '../../../../components/layout/BarChart'
import { TurnoExpedienteModal } from '../../../../components/layout/TurnoExpedienteModal'
import { Modal } from '../../../../components/layout/Modal'
import { BarraFiltros, FiltroCombo, FiltroMenu } from '../../../../components/layout/Filtros'
import { Button } from '../../../../components/layout/Button'
import { PageHeader, SectionHeader } from '../../../../components/layout/PageHeader'
import { CHART_COLORS } from '../../../../lib/chartTheme'
import { copCompacto } from '../../../../lib/formato'
import { coincide } from '../../../../lib/tableFilters'
import { toast } from '../../../../lib/toast'
import { METODO_PAGO_LABEL } from '../../../../lib/metodoPago'
import type { MetodoPago } from '../../../../schemas/orden'

type FiltroKey = 'todos' | 'jefe_zona' | 'vigilante'

const FILTROS: { key: FiltroKey; label: string }[] = [
  { key: 'todos', label: 'Todos' },
  { key: 'jefe_zona', label: 'Jefe de patio' },
  { key: 'vigilante', label: 'Vigilante' },
]

const ROL_LABEL: Record<RolCaja, string> = {
  jefe_zona: 'Jefe de patio',
  vigilante: 'Vigilante',
}

const ROL_CLASSNAME: Record<RolCaja, string> = {
  jefe_zona: 'bg-primary-50 text-primary-700',
  vigilante: 'bg-neutral-100 text-neutral-700',
}

const COP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })
const FECHA_HORA = new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short' })

function fetchByFiltro(filtro: FiltroKey): Promise<TurnoCaja[]> {
  if (filtro === 'todos') return fetchTurnos()
  return fetchTurnos(filtro)
}

function ultimosNDias(dias: number): { desdeISO: string; hastaISO: string } {
  const ahora = new Date()
  const hoy = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate())
  const desde = new Date(hoy)
  desde.setDate(desde.getDate() - (dias - 1))
  const hasta = new Date(hoy)
  hasta.setDate(hasta.getDate() + 1)
  return { desdeISO: desde.toISOString(), hastaISO: hasta.toISOString() }
}

export const Route = createFileRoute('/admin/operacion/turnos/')({
  loader: async () => {
    const { desdeISO, hastaISO } = ultimosNDias(30)
    const [turnos, correcciones, combos, lavadores, productos] = await Promise.all([
      fetchByFiltro('todos'),
      fetchCorreccionesEnRango(desdeISO, hastaISO),
      fetchCombos(),
      fetchLavadores(),
      fetchProductos(),
    ])
    return { turnos, correcciones, combos, lavadores, productos }
  },
  component: TurnosPage,
})

function repartoTexto(lineas: { metodoPago: string; monto: number }[]): string {
  return lineas
    .map((l) => `${METODO_PAGO_LABEL[l.metodoPago as MetodoPago] ?? l.metodoPago} ${COP.format(l.monto)}`)
    .join(' + ')
}

function diferenciaClassName(diferencia: number | undefined): string {
  if (diferencia === undefined) return 'text-neutral-400'
  if (diferencia === 0) return 'text-success-700'
  if (diferencia < 0) return 'text-danger-700'
  return 'text-warning-700'
}

function formatDiferencia(diferencia: number | undefined): string {
  if (diferencia === undefined) return '—'
  const signo = diferencia > 0 ? '+' : ''
  return `${signo}${COP.format(diferencia)}`
}

function TurnosPage() {
  const initial = Route.useLoaderData()
  const [filtro, setFiltro] = useState<FiltroKey>('todos')
  const [turnos, setTurnos] = useState(initial.turnos)
  const correcciones: CorreccionReparto[] = initial.correcciones
  const [loading, setLoading] = useState(false)
  const [expedienteDe, setExpedienteDe] = useState<TurnoCaja | null>(null)
  const [filtroResponsable, setFiltroResponsable] = useState('')
  const [filtroEstado, setFiltroEstado] = useState('')
  const [verCorrecciones, setVerCorrecciones] = useState(false)

  const comboNombrePorId = new Map(initial.combos.map((c) => [c.id, c.nombre]))
  const lavadorNombrePorId = new Map(initial.lavadores.map((l) => [l.id, l.nombre]))
  const productoNombrePorId = new Map(initial.productos.map((p) => [p.id, p.nombre]))

  async function cambiarFiltro(key: FiltroKey) {
    setFiltro(key)
    setLoading(true)
    try {
      setTurnos(await fetchByFiltro(key))
    } catch (err) {
      toast.desdeError(err, 'No se pudieron cargar los turnos')
    } finally {
      setLoading(false)
    }
  }

  const cerrados = turnos.filter((t) => t.cerrado)
  const conDiferencia = cerrados.filter((t) => (t.diferencia ?? 0) !== 0)
  const sumaDiferencias = cerrados.reduce((total, t) => total + (t.diferencia ?? 0), 0)

  // Diferencia de arqueo por turno cerrado, del más viejo al más nuevo — para ver si hay patrón.
  const serieDiferencias = useMemo(() => {
    const ordenados = turnos
      .filter((t) => t.cerrado)
      .sort((a, b) => new Date(a.abiertoEn).getTime() - new Date(b.abiertoEn).getTime())
    return {
      labels: ordenados.map(
        (t) => `${ROL_LABEL[t.rol].slice(0, 4)} ${new Date(t.abiertoEn).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })}`,
      ),
      data: ordenados.map((t) => t.diferencia ?? 0),
    }
  }, [turnos])

  const visibles = turnos.filter((t) => {
    if (!coincide(t.responsableActual, filtroResponsable) && !coincide(t.responsable, filtroResponsable)) return false
    if (filtroEstado === 'abierto' && t.cerrado) return false
    if (filtroEstado === 'cerrado' && !t.cerrado) return false
    if (filtroEstado === 'diferencia' && (!t.cerrado || (t.diferencia ?? 0) === 0)) return false
    return true
  })

  // Tendencia de diferencias por persona (Plan M11, control): se agrupa por quien abrió el turno.
  const porResponsable = Array.from(
    cerrados.reduce((m, t) => {
      const r = m.get(t.responsable) ?? { nombre: t.responsable, turnos: 0, conDiferencia: 0, faltantes: 0, sobrantes: 0 }
      const d = t.diferencia ?? 0
      r.turnos += 1
      if (d !== 0) r.conDiferencia += 1
      if (d < 0) r.faltantes += d
      if (d > 0) r.sobrantes += d
      m.set(t.responsable, r)
      return m
    }, new Map<string, { nombre: string; turnos: number; conDiferencia: number; faltantes: number; sobrantes: number }>()).values(),
  ).sort((a, b) => a.faltantes - b.faltantes)
  const faltantes = cerrados.filter((t) => (t.diferencia ?? 0) < 0)
  const totalFaltantes = faltantes.reduce((s, t) => s + (t.diferencia ?? 0), 0)

  return (
    <div className="flex flex-col gap-6 text-left">
      <PageHeader
        title="Turnos y arqueos"
        description="Cada caja abierta y cerrada, con su diferencia de arqueo. Toca un turno para ver su expediente."
        help={{
          body:
            'Histórico de turnos de caja de jefe de patio y vigilante. Solo lectura: un turno cerrado es inmodificable (regla 14).\n\n' +
            'Diferencia = conteo físico − valor esperado por el sistema. Negativa = faltó plata (rojo); positiva = sobró (ámbar). Toda diferencia exige justificación al cerrar.\n\n' +
            'Las correcciones de reparto de pago (cambiar cuánto fue efectivo, transferencia o datáfono sin cambiar el total) se ven en su propio botón.',
        }}
        actions={
          <>
            <div className="flex rounded-xl bg-neutral-200/60 p-1">
              {FILTROS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => cambiarFiltro(f.key)}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                    filtro === f.key ? 'bg-white text-primary-700 shadow-sm' : 'text-neutral-500 hover:text-neutral-900'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <Button icon={Repeat2} onClick={() => setVerCorrecciones(true)}>
              Correcciones de pago
              {correcciones.length > 0 ? (
                <span className="rounded-full bg-warning-50 px-1.5 text-[11px] font-semibold text-warning-700">{correcciones.length}</span>
              ) : null}
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Turnos" value={String(turnos.length)} hint={`${turnos.length - cerrados.length} abierto(s)`} icon={ClipboardList} />
        <StatCard label="Con diferencia" value={String(conDiferencia.length)} hint={`de ${cerrados.length} cerrados`} icon={ClipboardCheck} />
        <StatCard label="Faltantes de caja" value={COP.format(Math.abs(totalFaltantes))} hint={`${faltantes.length} turno(s)`} icon={TrendingDown} />
        <StatCard label="Neto de diferencias" value={formatDiferencia(sumaDiferencias)} hint="+ sobrante · − faltante" icon={Scale} />
      </div>

      {serieDiferencias.data.filter((d) => d !== 0).length > 2 ? (
        <Card className="flex flex-col gap-2 p-5">
          <SectionHeader title="Diferencia por turno" hint="Del más antiguo al más reciente. Rojo = faltante, ámbar = sobrante." />
          <BarChart
            horizontal={false}
            labels={serieDiferencias.labels}
            data={serieDiferencias.data}
            colors={serieDiferencias.data.map((d) => (d < 0 ? CHART_COLORS.danger : d > 0 ? CHART_COLORS.warning : CHART_COLORS.primarySoft))}
            valueFormatter={(v) => COP.format(v)}
            axisFormatter={copCompacto}
            height={200}
          />
        </Card>
      ) : null}

      {porResponsable.length > 0 ? (
        <section className="flex flex-col gap-3">
          <SectionHeader
            title="Diferencias acumuladas por responsable"
            hint="Turnos cerrados de cada persona. Un faltante que se repite en la misma persona es la señal a revisar."
          />
          <Card className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[36rem] text-sm">
                <thead>
                  <tr className="border-b border-neutral-200 text-left text-xs font-medium uppercase tracking-wide text-neutral-500">
                    <th className="px-4 py-3">Responsable</th>
                    <th className="px-4 py-3 text-right">Turnos</th>
                    <th className="px-4 py-3 text-right">Con diferencia</th>
                    <th className="px-4 py-3 text-right">Faltantes</th>
                    <th className="px-4 py-3 text-right">Sobrantes</th>
                    <th className="px-4 py-3 text-right">Neto</th>
                  </tr>
                </thead>
                <tbody>
                  {porResponsable.map((r) => (
                    <tr
                      key={r.nombre}
                      onClick={() => setFiltroResponsable(r.nombre)}
                      className="cursor-pointer border-b border-neutral-100 transition-colors last:border-0 hover:bg-primary-50/40"
                    >
                      <td className="px-4 py-3 font-medium text-neutral-900">{r.nombre}</td>
                      <td className="px-4 py-3 text-right text-neutral-600">{r.turnos}</td>
                      <td className="px-4 py-3 text-right text-neutral-600">
                        {r.conDiferencia} <span className="text-xs text-neutral-400">({Math.round((r.conDiferencia / r.turnos) * 100)}%)</span>
                      </td>
                      <td className={`px-4 py-3 text-right ${r.faltantes < 0 ? 'text-danger-700' : 'text-neutral-400'}`}>
                        {COP.format(Math.abs(r.faltantes))}
                      </td>
                      <td className={`px-4 py-3 text-right ${r.sobrantes > 0 ? 'text-warning-700' : 'text-neutral-400'}`}>
                        {COP.format(r.sobrantes)}
                      </td>
                      <td className={`px-4 py-3 text-right font-semibold ${diferenciaClassName(r.faltantes + r.sobrantes)}`}>
                        {formatDiferencia(r.faltantes + r.sobrantes)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </section>
      ) : null}

      <BarraFiltros
        activos={[filtroResponsable, filtroEstado].filter(Boolean).length}
        onLimpiar={() => {
          setFiltroResponsable('')
          setFiltroEstado('')
        }}
        resultado={`${visibles.length} de ${turnos.length} turnos`}
      >
        <FiltroCombo
          value={filtroResponsable}
          onChange={setFiltroResponsable}
          options={turnos.flatMap((t) => [t.responsable, t.responsableActual])}
          placeholder="Responsable"
          icon={UserRound}
          ancho="sm:w-60"
        />
        <FiltroMenu
          label="Estado"
          value={filtroEstado}
          onChange={setFiltroEstado}
          options={[
            { value: 'abierto', label: 'Abiertos' },
            { value: 'cerrado', label: 'Cerrados' },
            { value: 'diferencia', label: 'Con diferencia' },
          ]}
        />
      </BarraFiltros>

      {visibles.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-neutral-200 bg-white px-4 py-10 text-center text-sm text-neutral-400">
          {loading ? 'Cargando…' : turnos.length === 0 ? 'No hay turnos registrados.' : 'Ningún turno coincide con el filtro.'}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {visibles.map((turno) => (
            <li key={turno.id}>
              <button
                type="button"
                onClick={() => setExpedienteDe(turno)}
                className="flex w-full flex-col gap-3 rounded-2xl border border-neutral-200 bg-white px-4 py-3.5 text-left shadow-card transition-all hover:border-primary-200 hover:shadow-card-hover md:flex-row md:items-center"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${ROL_CLASSNAME[turno.rol]}`}>
                      {ROL_LABEL[turno.rol]}
                    </span>
                    <span className="truncate text-sm font-semibold text-neutral-900">{turno.responsable}</span>
                    {!turno.cerrado ? (
                      <span className="rounded-full bg-success-50 px-2 py-0.5 text-[11px] font-medium text-success-700">Abierto ahora</span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 text-xs text-neutral-500">
                    {FECHA_HORA.format(new Date(turno.abiertoEn))}
                    {turno.cerradoEn ? ` → ${FECHA_HORA.format(new Date(turno.cerradoEn))}` : ''}
                    {turno.cerradoPor ? ` · cerró ${turno.cerradoPor}` : ''}
                    {turno.recibidoPor ? ` · recibió ${turno.recibidoPor}` : ''}
                  </p>
                  {turno.justificacionDiferencia ? (
                    <p className="mt-1 line-clamp-2 text-xs text-neutral-600">“{turno.justificacionDiferencia}”</p>
                  ) : null}
                </div>
                <div className="grid grid-cols-3 gap-3 text-right md:w-[26rem] md:shrink-0">
                  <Dato label="Esperado" valor={turno.cerrado && turno.valorEsperado !== undefined ? COP.format(turno.valorEsperado) : '—'} />
                  <Dato label="Contado" valor={turno.cerrado && turno.conteoFisico !== undefined ? COP.format(turno.conteoFisico) : '—'} />
                  <div>
                    <span className="block text-[11px] text-neutral-400">Diferencia</span>
                    <span className={`block text-sm font-semibold tabular-nums ${turno.cerrado ? diferenciaClassName(turno.diferencia) : 'text-neutral-300'}`}>
                      {turno.cerrado ? formatDiferencia(turno.diferencia) : '—'}
                    </span>
                  </div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      {verCorrecciones ? (
        <Modal
          title="Correcciones de reparto de pago"
          subtitle="Últimos 30 días. El total nunca cambia, solo cómo se repartió entre métodos."
          icon={Repeat2}
          size="xl"
          flush
          onClose={() => setVerCorrecciones(false)}
        >
          {correcciones.length === 0 ? (
            <p className="px-6 py-10 text-center text-sm text-neutral-400">Sin correcciones de reparto en los últimos 30 días.</p>
          ) : (
            <ul className="divide-y divide-neutral-100">
              {correcciones.map((c, i) => (
                <li key={i} className="flex flex-col gap-1.5 px-5 py-3.5 sm:px-6">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-medium text-neutral-900">
                      {c.ordenId ? 'Orden de lavado' : 'Venta de mostrador'}
                    </span>
                    <span className="text-xs text-neutral-400">
                      {FECHA_HORA.format(new Date(c.fecha))} · {c.corregidoPor}
                    </span>
                  </div>
                  <p className="text-sm">
                    <span className="text-neutral-400 line-through">{repartoTexto(c.antes)}</span>
                    <span className="mx-2 text-neutral-300">→</span>
                    <span className="font-medium text-neutral-900">{repartoTexto(c.despues)}</span>
                  </p>
                  <p className="text-xs text-neutral-500">Motivo: {c.motivo}</p>
                </li>
              ))}
            </ul>
          )}
          <p className="border-t border-neutral-100 px-6 py-3 text-xs text-neutral-400">
            Si el turno de ese cobro ya estaba cerrado, su arqueo quedó congelado y esta es la única traza del ajuste.
          </p>
        </Modal>
      ) : null}

      {expedienteDe ? (
        <TurnoExpedienteModal
          turno={expedienteDe}
          comboNombre={(id) => (id ? comboNombrePorId.get(id) ?? '—' : 'Sin combo')}
          lavadorNombre={(id) => (id ? lavadorNombrePorId.get(id) : undefined)}
          productoNombre={(id) => productoNombrePorId.get(id) ?? 'Producto'}
          onClose={() => setExpedienteDe(null)}
        />
      ) : null}
    </div>
  )
}

function Dato({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="min-w-0">
      <span className="block text-[11px] text-neutral-400">{label}</span>
      <span className="block truncate text-sm font-medium tabular-nums text-neutral-700">{valor}</span>
    </div>
  )
}
