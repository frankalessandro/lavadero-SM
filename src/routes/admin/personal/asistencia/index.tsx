import { useMemo, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Clock, DoorOpen, Timer, UserCheck } from 'lucide-react'
import { fetchTurnosEnRango } from '../../../../data/turnos'
import type { RolCaja, TurnoCaja } from '../../../../schemas/turnoCaja'
import { Card } from '../../../../components/layout/Card'
import { CargandoContenido } from '../../../../components/layout/PantallaCarga'
import { PageHeader } from '../../../../components/layout/PageHeader'
import { PeriodoSelector } from '../../../../components/layout/PeriodoSelector'
import { StatCard } from '../../../../components/layout/StatCard'
import { calcularRango, fechaLocalISO, rangoAISO, type ModoPeriodo } from '../../../../lib/periodo'

export const Route = createFileRoute('/admin/personal/asistencia/')({
  component: AsistenciaCajaPage,
})

const ROL_LABEL: Record<RolCaja, string> = { jefe_zona: 'Jefe de patio', vigilante: 'Vigilante' }

const HORA = new Intl.DateTimeFormat('es-CO', { hour: 'numeric', minute: '2-digit' })
const FECHA_CORTA = new Intl.DateTimeFormat('es-CO', { weekday: 'short', day: 'numeric', month: 'short' })

function duracionMs(t: TurnoCaja, ahora: number): number {
  return (t.cerradoEn ? new Date(t.cerradoEn).getTime() : ahora) - new Date(t.abiertoEn).getTime()
}

function textoDuracion(ms: number): string {
  const min = Math.max(0, Math.round(ms / 60_000))
  const h = Math.floor(min / 60)
  const m = min % 60
  return h > 0 ? `${h} h ${m} min` : `${m} min`
}

interface ResumenPersona {
  clave: string
  nombre: string
  rol: RolCaja
  dias: Set<string>
  turnos: number
  horasMs: number
  abiertos: number
}

// Asistencia del jefe de patio y del vigilante, sin registro aparte: su marcación ES abrir el turno
// de caja (quién abrió, a qué hora, cuánto duró). Un día cuenta para quien abrió el turno ese día
// (regla 11). Los lavadores sí marcan su llegada aparte, en Asistencia del jefe de patio.
function AsistenciaCajaPage() {
  const [modo, setModo] = useState<ModoPeriodo>('mes')
  const [ancla, setAncla] = useState(() => new Date())
  const rango = calcularRango(modo, ancla)
  const { desdeISO, hastaISO } = rangoAISO(rango)

  const { data: turnos, isPending, error } = useQuery({
    queryKey: ['turnos', 'rango', desdeISO, hastaISO],
    queryFn: () => fetchTurnosEnRango(desdeISO, hastaISO),
  })

  // Solo para la duración de un turno que sigue abierto; no hace falta que corra en vivo.
  const [ahora] = useState(() => Date.now())
  const personas = useMemo(() => {
    const mapa = new Map<string, ResumenPersona>()
    for (const t of turnos ?? []) {
      // La persona que abrió: el id es la clave estable; sin id (turnos viejos) cuenta el nombre.
      const clave = `${t.rol}|${t.responsablePersonaId ?? t.responsable}`
      let r = mapa.get(clave)
      if (!r) {
        r = { clave, nombre: t.responsable, rol: t.rol, dias: new Set(), turnos: 0, horasMs: 0, abiertos: 0 }
        mapa.set(clave, r)
      }
      r.dias.add(fechaLocalISO(new Date(t.abiertoEn)))
      r.turnos += 1
      r.horasMs += duracionMs(t, ahora)
      if (!t.cerrado) r.abiertos += 1
    }
    return [...mapa.values()].sort((a, b) => b.dias.size - a.dias.size || a.nombre.localeCompare(b.nombre))
  }, [turnos, ahora])

  const diasConTurno = useMemo(() => new Set((turnos ?? []).map((t) => fechaLocalISO(new Date(t.abiertoEn)))).size, [turnos])

  return (
    <div className="flex flex-col gap-6 text-left">
      <PageHeader
        title="Asistencia del jefe de patio y el vigilante"
        description="Quién abrió caja, a qué hora y cuánto duró cada turno — su asistencia sale de ahí, sin marcar nada aparte."
        help={{
          body: 'La marcación del jefe de patio y del vigilante es abrir su turno de caja: quedan registrados quién lo abrió, la hora de apertura, la de cierre y la duración. Un turno que cruza la medianoche cuenta completo en la fecha en que se abrió (regla 11).\n\nLa asistencia de los lavadores se marca aparte, en el panel del jefe de patio.',
        }}
        actions={
          <PeriodoSelector modo={modo} onModoChange={setModo} ancla={ancla} onAnclaChange={setAncla} rango={rango} />
        }
      />

      {error ? (
        <p className="rounded-lg bg-danger-50 px-3 py-2.5 text-sm text-danger-700">{error.message}</p>
      ) : isPending ? (
        <CargandoContenido mensaje="Cargando turnos…" />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            <StatCard label="Turnos abiertos" value={String(turnos.length)} hint={`${diasConTurno} días con turno`} icon={DoorOpen} />
            <StatCard label="Personas" value={String(personas.length)} icon={UserCheck} />
            <StatCard
              label="Horas de turno"
              value={textoDuracion(personas.reduce((suma, p) => suma + p.horasMs, 0))}
              icon={Timer}
            />
          </div>

          <Card className="flex flex-col gap-3 p-5">
            <h2 className="text-sm font-semibold text-neutral-900">Por persona</h2>
            {personas.length === 0 ? (
              <p className="text-sm text-neutral-400">No hubo turnos abiertos en este periodo.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-neutral-100">
                {personas.map((p) => (
                  <li key={p.clave} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 py-3 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-neutral-900">{p.nombre}</p>
                      <p className="text-xs text-neutral-400">{ROL_LABEL[p.rol]}</p>
                    </div>
                    <p className="flex flex-wrap gap-x-4 text-xs text-neutral-600">
                      <span>
                        <strong className="text-sm text-neutral-900">{p.dias.size}</strong> {p.dias.size === 1 ? 'día' : 'días'}
                      </span>
                      <span>{p.turnos} {p.turnos === 1 ? 'turno' : 'turnos'}</span>
                      <span>{textoDuracion(p.horasMs)}</span>
                      {p.abiertos > 0 ? <span className="font-medium text-primary-700">turno en curso</span> : null}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="flex flex-col gap-3 p-5">
            <h2 className="text-sm font-semibold text-neutral-900">Detalle de turnos</h2>
            {turnos.length === 0 ? (
              <p className="text-sm text-neutral-400">Sin turnos en este periodo.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-neutral-100">
                {turnos.map((t) => (
                  <li key={t.id} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 py-3 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-neutral-900">
                        {t.responsable} <span className="font-normal text-neutral-400">· {ROL_LABEL[t.rol]}</span>
                      </p>
                      <p className="text-xs capitalize text-neutral-400">{FECHA_CORTA.format(new Date(t.abiertoEn))}</p>
                    </div>
                    <p className="flex items-center gap-1.5 text-xs text-neutral-600">
                      <Clock size={13} className="text-neutral-400" />
                      {HORA.format(new Date(t.abiertoEn))} → {t.cerradoEn ? HORA.format(new Date(t.cerradoEn)) : 'sigue abierto'}
                      <span className="text-neutral-400">· {textoDuracion(duracionMs(t, ahora))}</span>
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </div>
  )
}
