import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { ChevronLeft, ChevronRight, ClipboardCheck, ClipboardList, Repeat2, Scale, TrendingDown, UserRound } from 'lucide-react'
import { fetchTurnos } from '../../../../data/turnos'
import { fetchCorreccionesEnRango, type CorreccionReparto } from '../../../../data/pagos'
import { fetchCombos } from '../../../../data/combos'
import { fetchLavadores } from '../../../../data/lavadores'
import { fetchProductos } from '../../../../data/productos'
import type { RolCaja, TurnoCaja } from '../../../../schemas/turnoCaja'
import { Card } from '../../../../components/layout/Card'
import { StatCard } from '../../../../components/layout/StatCard'
import { CalendarioDiferencias, type ResumenDia } from '../../../../components/layout/CalendarioDiferencias'
import { TurnoExpedienteModal } from '../../../../components/layout/TurnoExpedienteModal'
import { Modal } from '../../../../components/layout/Modal'
import { BarraFiltros, FiltroCombo, FiltroMenu } from '../../../../components/layout/Filtros'
import { Button } from '../../../../components/layout/Button'
import { PageHeader, SectionHeader } from '../../../../components/layout/PageHeader'
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

const POR_PAGINA = 25

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
  const [turnosTodos, setTurnos] = useState(initial.turnos)
  const correcciones: CorreccionReparto[] = initial.correcciones
  const [loading, setLoading] = useState(false)
  const [expedienteDe, setExpedienteDe] = useState<TurnoCaja | null>(null)
  const [filtroResponsable, setFiltroResponsable] = useState('')
  const [filtroEstado, setFiltroEstado] = useState('')
  const [mesElegido, setMesElegido] = useState('') // '' = General (todo el historial)
  const [dia, setDia] = useState('')
  const [limite, setLimite] = useState(POR_PAGINA)
  const [verCorrecciones, setVerCorrecciones] = useState(false)

  const comboNombrePorId = new Map(initial.combos.map((c) => [c.id, c.nombre]))
  const lavadorNombrePorId = new Map(initial.lavadores.map((l) => [l.id, l.nombre]))
  const productoNombrePorId = new Map(initial.productos.map((p) => [p.id, p.nombre]))

  // Cualquier cambio de alcance vuelve a la primera página y suelta el día elegido.
  function reiniciar() {
    setDia('')
    setLimite(POR_PAGINA)
  }

  async function cambiarFiltro(key: FiltroKey) {
    setFiltro(key)
    reiniciar()
    setLoading(true)
    try {
      setTurnos(await fetchByFiltro(key))
    } catch (err) {
      toast.desdeError(err, 'No se pudieron cargar los turnos')
    } finally {
      setLoading(false)
    }
  }

  // Un mismo nombre por cuenta: los turnos guardan el texto de cuando se abrieron ("Laura" /
  // "Laura Montealegre"), así que se toma el más reciente de cada cuenta para no verla duplicada.
  const nombrePorPersona = new Map<string, string>()
  for (const t of turnosTodos) {
    if (t.responsableActualPersonaId && !nombrePorPersona.has(t.responsableActualPersonaId)) {
      nombrePorPersona.set(t.responsableActualPersonaId, t.responsableActual)
    }
  }
  const nombreDe = (t: TurnoCaja) =>
    (t.responsableActualPersonaId && nombrePorPersona.get(t.responsableActualPersonaId)) || t.responsableActual

  // Fecha del turno = la de apertura (regla 11), en hora local.
  const fechaDeTurno = (t: TurnoCaja) => {
    const d = new Date(t.abiertoEn)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }

  // Filtros de la barra (responsable, estado): definen el universo de meses, calendario, cifras y lista.
  const base = turnosTodos.filter((t) => {
    if (!coincide(nombreDe(t), filtroResponsable)) return false
    if (filtroEstado === 'abierto' && t.cerrado) return false
    if (filtroEstado === 'cerrado' && !t.cerrado) return false
    if (filtroEstado === 'diferencia' && (!t.cerrado || (t.diferencia ?? 0) === 0)) return false
    return true
  })

  // Resumen por mes, del más reciente al más viejo: ~12 filas por año aunque haya 700 turnos.
  const meses = Array.from(
    base.reduce((m, t) => {
      const clave = fechaDeTurno(t).slice(0, 7)
      const r = m.get(clave) ?? { clave, turnos: 0, cerrados: 0, conDiferencia: 0, faltantes: 0, sobrantes: 0 }
      r.turnos += 1
      if (t.cerrado) {
        const d = t.diferencia ?? 0
        r.cerrados += 1
        if (d !== 0) r.conDiferencia += 1
        if (d < 0) r.faltantes += d
        if (d > 0) r.sobrantes += d
      }
      m.set(clave, r)
      return m
    }, new Map<string, { clave: string; turnos: number; cerrados: number; conDiferencia: number; faltantes: number; sobrantes: number }>()).values(),
  ).sort((a, b) => b.clave.localeCompare(a.clave))

  const idxMes = meses.findIndex((m) => m.clave === mesElegido)
  const mes = idxMes >= 0 ? mesElegido : '' // '' = General
  const etiquetaMes = (clave: string) => {
    const [y, mm] = clave.split('-').map(Number)
    const texto = new Date(y, mm - 1, 1).toLocaleDateString('es-CO', { month: 'long', year: 'numeric' })
    return texto.charAt(0).toUpperCase() + texto.slice(1)
  }
  const delMes = mes ? base.filter((t) => fechaDeTurno(t).startsWith(mes)) : base
  const diaActivo = mes && dia.startsWith(mes) ? dia : ''
  const visibles = diaActivo ? delMes.filter((t) => fechaDeTurno(t) === diaActivo) : delMes

  const resumenPorDia = new Map<string, ResumenDia>()
  if (mes) {
    for (const t of delMes) {
      const clave = fechaDeTurno(t)
      const r = resumenPorDia.get(clave) ?? { neto: 0, turnos: 0, conDiferencia: 0 }
      r.turnos += 1
      if (t.cerrado) {
        const d = t.diferencia ?? 0
        r.neto += d
        if (d !== 0) r.conDiferencia += 1
      }
      resumenPorDia.set(clave, r)
    }
  }

  const cerrados = visibles.filter((t) => t.cerrado)
  const conDiferencia = cerrados.filter((t) => (t.diferencia ?? 0) !== 0)
  const sumaDiferencias = cerrados.reduce((total, t) => total + (t.diferencia ?? 0), 0)
  const faltantes = cerrados.filter((t) => (t.diferencia ?? 0) < 0)
  const totalFaltantes = faltantes.reduce((s, t) => s + (t.diferencia ?? 0), 0)
  const alcance = diaActivo
    ? new Date(`${diaActivo}T00:00:00`).toLocaleDateString('es-CO', { day: 'numeric', month: 'long' })
    : mes
      ? etiquetaMes(mes)
      : 'Todo el historial'

  function irAMes(clave: string) {
    setMesElegido(clave)
    reiniciar()
  }

  return (
    <div className="flex flex-col gap-6 text-left">
      <PageHeader
        title="Turnos y arqueos"
        description="Cada caja abierta y cerrada, con su diferencia de arqueo. Toca un turno para ver su expediente."
        help={{
          body:
            'Histórico de turnos de caja de jefe de patio y vigilante. Un turno cerrado es inmodificable (regla 14); solo gerencia puede corregir su arqueo desde el expediente, con causa justificada y registro en Auditoría.\n\n' +
            'Diferencia = conteo físico − valor esperado por el sistema. Negativa = faltó plata (rojo); positiva = sobró (ámbar). Toda diferencia exige justificación al cerrar.\n\n' +
            '"General" resume todo el historial mes a mes; al elegir un mes aparece su calendario, donde cada día muestra el neto de diferencias de sus turnos (la fecha del turno es la de su apertura). Toca un día para ver solo sus turnos.\n\n' +
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
            <div className="flex items-center gap-2">
              <div className="flex rounded-xl bg-neutral-200/60 p-1">
                <button
                  type="button"
                  onClick={() => irAMes('')}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                    !mes ? 'bg-white text-primary-700 shadow-sm' : 'text-neutral-500 hover:text-neutral-900'
                  }`}
                >
                  General
                </button>
                <button
                  type="button"
                  onClick={() => meses[0] && irAMes(mes || meses[0].clave)}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                    mes ? 'bg-white text-primary-700 shadow-sm' : 'text-neutral-500 hover:text-neutral-900'
                  }`}
                >
                  Mes
                </button>
              </div>
              {mes ? (
                <div className="flex items-center gap-1 rounded-xl border border-neutral-200 bg-white p-1">
                  <button
                    type="button"
                    disabled={idxMes >= meses.length - 1}
                    onClick={() => irAMes(meses[idxMes + 1].clave)}
                    aria-label="Mes anterior"
                    className="flex size-7 items-center justify-center rounded-md text-neutral-500 transition-colors hover:bg-neutral-100 disabled:opacity-30 disabled:hover:bg-transparent"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <span className="min-w-[8.5rem] px-1 text-center text-sm font-medium text-neutral-700">{etiquetaMes(mes)}</span>
                  <button
                    type="button"
                    disabled={idxMes <= 0}
                    onClick={() => irAMes(meses[idxMes - 1].clave)}
                    aria-label="Mes siguiente"
                    className="flex size-7 items-center justify-center rounded-md text-neutral-500 transition-colors hover:bg-neutral-100 disabled:opacity-30 disabled:hover:bg-transparent"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              ) : null}
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

      <BarraFiltros
        activos={[filtroResponsable, filtroEstado].filter(Boolean).length}
        onLimpiar={() => {
          setFiltroResponsable('')
          setFiltroEstado('')
          reiniciar()
        }}
        resultado={`${visibles.length} de ${turnosTodos.length} turnos`}
      >
        <FiltroCombo
          value={filtroResponsable}
          onChange={(v) => {
            setFiltroResponsable(v)
            reiniciar()
          }}
          options={turnosTodos.map(nombreDe)}
          placeholder="Responsable"
          icon={UserRound}
          ancho="sm:w-60"
        />
        <FiltroMenu
          label="Estado"
          value={filtroEstado}
          onChange={(v) => {
            setFiltroEstado(v)
            reiniciar()
          }}
          options={[
            { value: 'abierto', label: 'Abiertos' },
            { value: 'cerrado', label: 'Cerrados' },
            { value: 'diferencia', label: 'Con diferencia' },
          ]}
        />
      </BarraFiltros>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Turnos" value={String(visibles.length)} hint={`${alcance} · ${visibles.length - cerrados.length} abierto(s)`} icon={ClipboardList} />
        <StatCard label="Con diferencia" value={String(conDiferencia.length)} hint={`de ${cerrados.length} cerrados`} icon={ClipboardCheck} />
        <StatCard label="Faltantes de caja" value={COP.format(Math.abs(totalFaltantes))} hint={`${faltantes.length} turno(s)`} icon={TrendingDown} />
        <StatCard label="Neto de diferencias" value={formatDiferencia(sumaDiferencias)} hint="+ sobrante · − faltante" icon={Scale} />
      </div>

      {!mes ? (
        <section className="flex flex-col gap-3">
          <SectionHeader title="Mes a mes" hint="Toca un mes para ver su calendario y sus turnos." />
          {meses.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-neutral-200 bg-white px-4 py-10 text-center text-sm text-neutral-400">
              {loading ? 'Cargando…' : 'Ningún turno coincide con el filtro.'}
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {meses.map((m) => {
                const neto = m.faltantes + m.sobrantes
                return (
                  <li key={m.clave}>
                    <button
                      type="button"
                      onClick={() => irAMes(m.clave)}
                      className="flex w-full flex-col gap-2 rounded-2xl border border-neutral-200 bg-white px-4 py-3.5 text-left shadow-card transition-all hover:border-primary-200 hover:shadow-card-hover sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <span className="block text-sm font-semibold text-neutral-900">{etiquetaMes(m.clave)}</span>
                        <span className="text-xs text-neutral-500">
                          {m.turnos} turno(s) · {m.conDiferencia} con diferencia
                          {m.cerrados > 0 ? ` (${Math.round((m.conDiferencia / m.cerrados) * 100)}%)` : ''}
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-4 text-right sm:w-[22rem] sm:shrink-0">
                        <Dato label="Faltó" valor={COP.format(Math.abs(m.faltantes))} />
                        <Dato label="Sobró" valor={COP.format(m.sobrantes)} />
                        <div>
                          <span className="block text-[11px] text-neutral-400">Neto</span>
                          <span className={`block text-sm font-semibold tabular-nums ${diferenciaClassName(neto)}`}>{formatDiferencia(neto)}</span>
                        </div>
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      ) : (
        <Card className="flex flex-col gap-4 p-5 sm:p-6">
          <SectionHeader
            title={etiquetaMes(mes)}
            hint={diaActivo ? 'Toca el día otra vez, o "Ver todo el mes", para soltarlo.' : 'Toca un día para ver solo sus turnos.'}
          />
          <CalendarioDiferencias mes={mes} resumenPorDia={resumenPorDia} seleccionado={diaActivo} onSeleccionar={(d) => { setDia(d); setLimite(POR_PAGINA) }} />
        </Card>
      )}

      {mes || visibles.length > 0 ? (
        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <SectionHeader title={mes ? `Turnos · ${alcance}` : 'Últimos turnos'} />
            {diaActivo ? (
              <button type="button" onClick={() => setDia('')} className="text-xs font-medium text-primary-600 transition-colors hover:text-primary-700">
                Ver todo el mes
              </button>
            ) : null}
          </div>

          {visibles.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-neutral-200 bg-white px-4 py-10 text-center text-sm text-neutral-400">
              {loading ? 'Cargando…' : turnosTodos.length === 0 ? 'No hay turnos registrados.' : 'Ningún turno coincide con el filtro.'}
            </p>
          ) : (
            <>
              <ul className="flex flex-col gap-2">
                {visibles.slice(0, limite).map((turno) => (
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
                          <span className="truncate text-sm font-semibold text-neutral-900">{nombreDe(turno)}</span>
                          {!turno.cerrado ? (
                            <span className="rounded-full bg-success-50 px-2 py-0.5 text-[11px] font-medium text-success-700">Abierto ahora</span>
                          ) : null}
                        </div>
                        <p className="mt-0.5 text-xs text-neutral-500">
                          {turno.responsableActual !== turno.responsable ? `Abrió ${turno.responsable} · ` : ''}
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
              {visibles.length > limite ? (
                <Button onClick={() => setLimite((l) => l + POR_PAGINA)}>
                  Mostrar más ({Math.min(POR_PAGINA, visibles.length - limite)} de {visibles.length - limite} restantes)
                </Button>
              ) : null}
            </>
          )}
        </section>
      ) : null}

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
          onCorregido={(t) => {
            setTurnos((prev) => prev.map((x) => (x.id === t.id ? t : x)))
            setExpedienteDe(t)
          }}
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
