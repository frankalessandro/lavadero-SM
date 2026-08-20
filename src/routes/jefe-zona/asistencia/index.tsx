import { useState } from 'react'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { UserCheck, Clock, BedDouble, ChevronLeft, ChevronRight, Moon, History } from 'lucide-react'
import { fetchLavadores } from '../../../data/lavadores'
import { fetchTurnoAbierto } from '../../../data/turnos'
import {
  fetchDiasDescanso,
  fetchAsistenciasDelDia,
  ensureDiasDescansoGenerados,
  cambiarDescanso,
  marcarAsistencia,
} from '../../../data/asistenciaLavadores'
import type { DiaDescanso, AsistenciaLavador } from '../../../schemas/asistencia'
import type { TurnoCaja } from '../../../schemas/turnoCaja'
import type { Lavador } from '../../../schemas/lavador'
import { Card } from '../../../components/layout/Card'
import { AbrirTurnoPrompt, TurnoResponsableBanner } from '../../../components/layout/TurnoResponsableBanner'

const SEMANAS_A_GENERAR_ADELANTE = 8
const DIAS_DESCANSABLES = ['Lunes', 'Martes', 'Miércoles', 'Jueves']
const DIAS_TRABAJO = ['Viernes', 'Sábado', 'Domingo']
const DRAG_MIME = 'application/x-descanso-card'

function fechaLocalISO(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dia = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dia}`
}

// Lunes de la semana calendario a la que pertenece `d` (domingo cuenta como el último día de
// la semana que empezó el lunes anterior, no como inicio de una nueva).
function lunesDeLaSemana(d: Date): Date {
  const copia = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const diaSemana = copia.getDay() // 0 = domingo ... 6 = sábado
  const offset = diaSemana === 0 ? -6 : 1 - diaSemana
  copia.setDate(copia.getDate() + offset)
  return copia
}

function sumarDias(iso: string, dias: number): Date {
  const [y, m, d] = iso.split('-').map(Number)
  const fecha = new Date(y, m - 1, d)
  fecha.setDate(fecha.getDate() + dias)
  return fecha
}

async function cargarSemana(inicioSemanaISO: string) {
  const hastaGenerar = fechaLocalISO(sumarDias(inicioSemanaISO, 7 * SEMANAS_A_GENERAR_ADELANTE))
  await ensureDiasDescansoGenerados(hastaGenerar)
  const finSemanaISO = fechaLocalISO(sumarDias(inicioSemanaISO, 6))
  return fetchDiasDescanso(inicioSemanaISO, finSemanaISO)
}

async function loadAsistencia() {
  const hoy = new Date()
  const hoyISO = fechaLocalISO(hoy)
  const inicioSemanaISO = fechaLocalISO(lunesDeLaSemana(hoy))
  const [turno, lavadores, descansos, asistenciasHoy] = await Promise.all([
    fetchTurnoAbierto('jefe_zona'),
    fetchLavadores(),
    cargarSemana(inicioSemanaISO),
    fetchAsistenciasDelDia(hoyISO),
  ])
  return {
    turno,
    lavadores: lavadores.filter((l) => l.activo),
    inicioSemanaISO,
    descansos,
    asistenciasHoy,
    hoyISO,
  }
}

export const Route = createFileRoute('/jefe-zona/asistencia/')({
  loader: loadAsistencia,
  component: AsistenciaJefeZona,
})

function formatEncabezadoSemana(inicioSemanaISO: string): string {
  const inicio = sumarDias(inicioSemanaISO, 0)
  const fin = sumarDias(inicioSemanaISO, 6)
  const fmt = (d: Date) => d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })
  return `${fmt(inicio)} — ${fmt(fin)}`
}

function AsistenciaJefeZona() {
  const data = Route.useLoaderData()
  const router = useRouter()
  const [turno, setTurno] = useState(data.turno)
  const [lavadores] = useState(data.lavadores)
  const [inicioSemanaISO, setInicioSemanaISO] = useState(data.inicioSemanaISO)
  const [descansos, setDescansos] = useState<DiaDescanso[]>(data.descansos)
  const [asistenciasHoy, setAsistenciasHoy] = useState<AsistenciaLavador[]>(data.asistenciasHoy)
  const [cargandoSemana, setCargandoSemana] = useState(false)
  const [guardandoFecha, setGuardandoFecha] = useState<string | null>(null)
  const [flashFecha, setFlashFecha] = useState<string | null>(null)
  const [marcandoLavadorId, setMarcandoLavadorId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function refresh() {
    setTurno(await fetchTurnoAbierto('jefe_zona'))
    router.invalidate()
  }

  if (!turno) {
    return <AbrirTurnoPrompt onAbierto={refresh} />
  }

  async function irASemana(deltaSemanas: number) {
    const nuevoInicio = fechaLocalISO(sumarDias(inicioSemanaISO, deltaSemanas * 7))
    setCargandoSemana(true)
    setError(null)
    try {
      const nuevosDescansos = await cargarSemana(nuevoInicio)
      setInicioSemanaISO(nuevoInicio)
      setDescansos(nuevosDescansos)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar esa semana')
    } finally {
      setCargandoSemana(false)
    }
  }

  async function handleCambiarDescanso(fecha: string, lavadorId: string) {
    if (!turno) return
    setError(null)
    setGuardandoFecha(fecha)
    try {
      const actualizado = await cambiarDescanso(fecha, { lavadorId, actualizadoPor: turno.responsableActual })
      setDescansos((prev) => prev.map((d) => (d.fecha === fecha ? actualizado : d)))
      setFlashFecha(fecha)
      setTimeout(() => setFlashFecha((f) => (f === fecha ? null : f)), 650)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar el descanso')
    } finally {
      setGuardandoFecha(null)
    }
  }

  async function handleMarcarAsistencia(lavadorId: string) {
    if (!turno) return
    setError(null)
    setMarcandoLavadorId(lavadorId)
    try {
      const nueva = await marcarAsistencia(data.hoyISO, { lavadorId, registradoPor: turno.responsableActual })
      setAsistenciasHoy((prev) => [...prev, nueva])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo marcar la asistencia')
    } finally {
      setMarcandoLavadorId(null)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <TurnoResponsableBanner turno={turno} onTransferido={(t: TurnoCaja) => setTurno(t)} />

      {error ? (
        <p className="text-xs text-danger-600">{error}</p>
      ) : null}

      <div>
        <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-neutral-900">
          <UserCheck size={15} className="text-primary-600" />
          Asistencia de hoy
          <span className="font-normal text-neutral-400">
            ·{' '}
            {new Date(data.hoyISO).toLocaleDateString('es-CO', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              timeZone: 'UTC',
            })}
          </span>
        </h2>
        <div className="flex flex-col gap-2">
          {lavadores.map((lavador) => {
            const asistencia = asistenciasHoy.find((a) => a.lavadorId === lavador.id)
            const descansaHoy = descansos.find((d) => d.fecha === data.hoyISO)?.lavadorId === lavador.id
            return (
              <Card key={lavador.id} className="flex items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="truncate font-medium text-neutral-900">{lavador.nombre}</p>
                  {descansaHoy ? (
                    <p className="flex items-center gap-1 text-xs text-neutral-500">
                      <BedDouble size={12} /> Descansa hoy
                    </p>
                  ) : null}
                </div>
                {asistencia ? (
                  <span className="flex shrink-0 items-center gap-1.5 rounded-lg bg-success-50 px-3 py-2 text-sm font-medium text-success-700">
                    <Clock size={14} />
                    {new Date(asistencia.horaEntrada).toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' })}
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleMarcarAsistencia(lavador.id)}
                    disabled={marcandoLavadorId === lavador.id}
                    className="shrink-0 rounded-lg bg-primary-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-700 disabled:opacity-60"
                  >
                    {marcandoLavadorId === lavador.id ? 'Marcando…' : 'Marcar entrada'}
                  </button>
                )}
              </Card>
            )
          })}
          {lavadores.length === 0 ? (
            <Card className="py-8 text-center text-sm text-neutral-400">No hay lavadores activos.</Card>
          ) : null}
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-neutral-900">
            <BedDouble size={15} className="text-primary-600" />
            Cronograma de descanso
          </h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => irASemana(-1)}
              disabled={cargandoSemana}
              className="flex size-8 items-center justify-center rounded-lg border border-neutral-200 text-neutral-500 transition-colors hover:bg-neutral-50 disabled:opacity-50"
              aria-label="Semana anterior"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-xs font-medium text-neutral-600">{formatEncabezadoSemana(inicioSemanaISO)}</span>
            <button
              type="button"
              onClick={() => irASemana(1)}
              disabled={cargandoSemana}
              className="flex size-8 items-center justify-center rounded-lg border border-neutral-200 text-neutral-500 transition-colors hover:bg-neutral-50 disabled:opacity-50"
              aria-label="Semana siguiente"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,7fr)_minmax(0,3fr)]">
          <Card className="overflow-x-auto p-2.5">
            <div className="grid min-w-[420px] grid-cols-[92px_repeat(4,1fr)] gap-1">
              {/* Encabezado de días — misma columna 0 vacía para alinear con los nombres de abajo. */}
              <div />
              {DIAS_DESCANSABLES.map((nombreDia, i) => (
                <div key={nombreDia} className="px-1 py-1 text-center">
                  <p className="text-[11px] font-semibold text-neutral-700">{nombreDia.slice(0, 3)}</p>
                  <p className="text-[10px] text-neutral-400">
                    {sumarDias(inicioSemanaISO, i).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })}
                  </p>
                </div>
              ))}

              {/* Una fila por lavador (carril tipo Trello) — la tarjeta "Descansa" vive en la
                  celda de su día; el resto de celdas de esa fila son zonas de drop/clic vacías. */}
              {lavadores.map((lavador) => (
                <FilaLavador
                  key={lavador.id}
                  lavador={lavador}
                  inicioSemanaISO={inicioSemanaISO}
                  descansos={descansos}
                  guardandoFecha={guardandoFecha}
                  flashFecha={flashFecha}
                  onAsignar={handleCambiarDescanso}
                />
              ))}

              {lavadores.length === 0 ? (
                <p className="col-span-5 py-6 text-center text-sm text-neutral-400">No hay lavadores activos.</p>
              ) : null}
            </div>

            <div className="mt-3 flex flex-wrap gap-2 border-t border-neutral-100 pt-3">
              {DIAS_TRABAJO.map((nombreDia, i) => {
                const fecha = sumarDias(inicioSemanaISO, 4 + i)
                return (
                  <span key={nombreDia} className="rounded-lg bg-neutral-50 px-3 py-1.5 text-xs text-neutral-400">
                    {nombreDia} {fecha.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })} · todos trabajan
                  </span>
                )
              })}
            </div>
          </Card>

          <PanelCambiosRecientes descansos={descansos} lavadores={lavadores} />
        </div>
        <p className="mt-2 text-xs text-neutral-400">
          Rotación fija: cada lavador descansa un día distinto lunes-jueves y la posición rota
          semana a semana. Arrastra la tarjeta "Descansa" a otro día o a otra fila (o toca una
          celda vacía) si hay un intercambio entre trabajadores.
        </p>
      </div>
    </div>
  )
}

function inicialesDe(nombre: string): string {
  return nombre.trim().slice(0, 1).toUpperCase()
}

// Una fila del tablero: nombre del lavador a la izquierda + una celda por día. La tarjeta
// arrastrable vive en la celda donde `dias_descanso` dice que ese lavador descansa esa fecha;
// el resto son zonas de drop/clic para reasignarle el descanso de ese día.
function FilaLavador({
  lavador,
  inicioSemanaISO,
  descansos,
  guardandoFecha,
  flashFecha,
  onAsignar,
}: {
  lavador: Lavador
  inicioSemanaISO: string
  descansos: DiaDescanso[]
  guardandoFecha: string | null
  flashFecha: string | null
  onAsignar: (fecha: string, lavadorId: string) => void
}) {
  return (
    <>
      <div className="flex items-center gap-1.5 py-1">
        <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary-100 text-[10px] font-semibold text-primary-700">
          {inicialesDe(lavador.nombre)}
        </span>
        <span className="truncate text-xs font-medium text-neutral-700">{lavador.nombre}</span>
      </div>
      {DIAS_DESCANSABLES.map((_, i) => {
        const fecha = fechaLocalISO(sumarDias(inicioSemanaISO, i))
        const descanso = descansos.find((d) => d.fecha === fecha)
        const esElQueDescansa = descanso?.lavadorId === lavador.id
        return (
          <CeldaDescanso
            key={fecha}
            lavador={lavador}
            esElQueDescansa={esElQueDescansa}
            actualizadoPor={esElQueDescansa ? descanso?.actualizadoPor : undefined}
            guardando={guardandoFecha === fecha}
            flash={flashFecha === fecha && esElQueDescansa}
            onAsignar={() => onAsignar(fecha, lavador.id)}
          />
        )
      })}
    </>
  )
}

function CeldaDescanso({
  lavador,
  esElQueDescansa,
  actualizadoPor,
  guardando,
  flash,
  onAsignar,
}: {
  lavador: Lavador
  esElQueDescansa: boolean
  actualizadoPor: string | undefined
  guardando: boolean
  flash: boolean
  onAsignar: () => void
}) {
  const [sobreDrop, setSobreDrop] = useState(false)

  return (
    <div
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes(DRAG_MIME) && !esElQueDescansa) {
          e.preventDefault()
          setSobreDrop(true)
        }
      }}
      onDragLeave={() => setSobreDrop(false)}
      onDrop={(e) => {
        e.preventDefault()
        setSobreDrop(false)
        if (!esElQueDescansa) onAsignar()
      }}
      onClick={() => !esElQueDescansa && !guardando && onAsignar()}
      role={esElQueDescansa ? undefined : 'button'}
      className={`flex h-16 items-center justify-center rounded-lg border-2 border-dashed p-1 transition-all duration-300 ${
        esElQueDescansa
          ? 'border-transparent p-0'
          : sobreDrop
            ? 'cursor-pointer border-primary-400 bg-primary-50'
            : 'cursor-pointer border-neutral-200 bg-neutral-50/60 hover:border-primary-200 hover:bg-primary-50/40'
      }`}
    >
      {esElQueDescansa ? (
        <div
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData(DRAG_MIME, lavador.id)
            e.dataTransfer.effectAllowed = 'move'
          }}
          className={`flex h-full w-full cursor-grab flex-col justify-center gap-1 rounded-lg border border-primary-200 bg-primary-50 px-2.5 text-primary-800 shadow-card transition-all duration-300 active:cursor-grabbing ${
            flash ? 'ring-2 ring-primary-400' : ''
          } ${guardando ? 'opacity-60' : ''}`}
        >
          <span className="flex items-center gap-1 text-xs font-semibold">
            <Moon size={12} /> Descansa
          </span>
          {/* Reserva siempre la misma línea (visible u oculta) para que la tarjeta mida igual
              tenga o no "por {responsable}" — si no, las tarjetas quedaban de alturas distintas. */}
          <span className={`truncate text-[11px] text-primary-600/80 ${actualizadoPor ? '' : 'invisible'}`}>
            por {actualizadoPor ?? '—'}
          </span>
        </div>
      ) : null}
    </div>
  )
}

// Análogo a la "waiting list" de un tablero Trello, pero para lo que sí tiene sentido acá:
// no hay tareas pendientes que asignar, hay cambios manuales que auditar — quién movió qué
// tarjeta y cuándo, dentro de la semana visible.
function PanelCambiosRecientes({ descansos, lavadores }: { descansos: DiaDescanso[]; lavadores: Lavador[] }) {
  const cambios = descansos
    .filter((d) => d.actualizadoPor)
    .slice()
    .sort((a, b) => (b.actualizadoEn ?? '').localeCompare(a.actualizadoEn ?? ''))

  return (
    <Card className="flex flex-col gap-4 p-5">
      <h3 className="flex items-center gap-2 text-base font-semibold text-neutral-900">
        <History size={17} className="text-primary-600" />
        Cambios recientes
      </h3>
      {cambios.length === 0 ? (
        <p className="text-sm text-neutral-400">Sin cambios manuales esta semana — el cronograma está tal como rota por defecto.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-neutral-100">
          {cambios.map((d) => (
            <li key={d.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary-100 text-xs font-semibold text-primary-700">
                {(lavadores.find((l) => l.id === d.lavadorId)?.nombre ?? '—').slice(0, 1).toUpperCase()}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-neutral-800">
                  {lavadores.find((l) => l.id === d.lavadorId)?.nombre ?? '—'} ahora descansa el{' '}
                  {new Date(d.fecha).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', timeZone: 'UTC' })}
                </p>
                <p className="text-xs text-neutral-400">
                  Cambiado por {d.actualizadoPor} ·{' '}
                  {d.actualizadoEn ? new Date(d.actualizadoEn).toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' }) : ''}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
