import { useMemo, useState } from 'react'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { UserCheck, Clock, BedDouble, Droplets, LogOut, CalendarOff, CheckCircle2, CalendarDays } from 'lucide-react'
import { fetchLavadores } from '../../../data/lavadores'
import { fetchTurnoAbierto } from '../../../data/turnos'
import { fetchAsistenciasDelDia, marcarAsistencia } from '../../../data/asistenciaLavadores'
import { fetchCronogramaMes, marcarBano } from '../../../data/cronograma'
import { armarDias } from '../../../lib/cronograma'
import { fechaLocalISO } from '../../../lib/periodo'
import type { AsistenciaLavador } from '../../../schemas/asistencia'
import type { TurnoCaja } from '../../../schemas/turnoCaja'
import { Card } from '../../../components/layout/Card'
import { CronogramaPanel } from '../../../components/cronograma/CronogramaPanel'
import { AbrirTurnoPrompt, TurnoResponsableBanner } from '../../../components/layout/TurnoResponsableBanner'
import { toast } from '../../../lib/toast'
import { PageHeader } from '../../../components/layout/PageHeader'

async function loadAsistencia() {
  const hoyISO = fechaLocalISO(new Date())
  // El cronograma de hoy (descanso, entra/sale, permisos) sale del mismo cálculo del mes completo.
  const [turno, lavadores, asistenciasHoy, cronogramaHoy] = await Promise.all([
    fetchTurnoAbierto('jefe_zona'),
    fetchLavadores(),
    fetchAsistenciasDelDia(hoyISO),
    fetchCronogramaMes(hoyISO, hoyISO),
  ])
  return {
    turno,
    lavadores: lavadores.filter((l) => l.activo),
    asistenciasHoy,
    cronogramaHoy,
    hoyISO,
  }
}

export const Route = createFileRoute('/jefe-zona/asistencia/')({
  loader: loadAsistencia,
  component: AsistenciaJefeZona,
})

function AsistenciaJefeZona() {
  const data = Route.useLoaderData()
  const { auth } = Route.useRouteContext()
  const router = useRouter()
  const [turno, setTurno] = useState(data.turno)
  const [lavadores] = useState(data.lavadores)
  const [asistenciasHoy, setAsistenciasHoy] = useState<AsistenciaLavador[]>(data.asistenciasHoy)
  const [cronogramaHoy, setCronogramaHoy] = useState(data.cronogramaHoy)
  const [marcandoLavadorId, setMarcandoLavadorId] = useState<string | null>(null)
  const [marcandoBano, setMarcandoBano] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const diaHoy = useMemo(
    () => armarDias(data.hoyISO, data.hoyISO, cronogramaHoy.descansos, cronogramaHoy.extras, cronogramaHoy.permisos)[0],
    [data.hoyISO, cronogramaHoy],
  )

  async function refresh() {
    setTurno(await fetchTurnoAbierto('jefe_zona'))
    router.invalidate()
  }

  async function refrescarHoy() {
    setCronogramaHoy(await fetchCronogramaMes(data.hoyISO, data.hoyISO))
  }

  if (!turno) {
    return <AbrirTurnoPrompt miNombre={auth?.perfil.nombre?.trim() || 'tu cuenta'} onAbierto={refresh} />
  }

  async function handleMarcarAsistencia(lavadorId: string) {
    if (!turno) return
    setError(null)
    setMarcandoLavadorId(lavadorId)
    try {
      const nueva = await marcarAsistencia(data.hoyISO, { lavadorId, registradoPor: turno.responsableActual })
      setAsistenciasHoy((prev) => [...prev, nueva])
      toast.exito('Asistencia marcada')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo marcar la asistencia')
      toast.desdeError(err, 'No se pudo marcar la asistencia')
    } finally {
      setMarcandoLavadorId(null)
    }
  }

  async function handleMarcarBano(hecho: boolean) {
    if (!turno) return
    setMarcandoBano(true)
    try {
      await marcarBano(data.hoyISO, hecho, turno.responsableActual)
      await refrescarHoy()
      toast.exito(hecho ? 'Baño marcado como hecho' : 'Marca del baño deshecha')
    } catch (err) {
      toast.desdeError(err, 'No se pudo marcar el baño')
    } finally {
      setMarcandoBano(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Asistencia"
        description="Quién llegó hoy y el cronograma del mes."
        help={{
          body: 'Marca la llegada de cada lavador: la rotación del día se arma por orden de llegada.\n\nEl cronograma rota solo: un lavador descansa cada día de lunes a jueves, el que descansó entra a las 7am y lava el baño, y el que descansa mañana sale a las 7pm. Toca un día para cambiarlo a mano, marcar el baño como hecho o registrar un permiso (con permiso no se marca asistencia). Todo queda en la bitácora.',
        }}
      />
      <TurnoResponsableBanner
        turno={turno}
        miPersonaId={auth?.perfil.id ?? ''}
        onTransferido={(t: TurnoCaja) => setTurno(t)}
      />

      {error ? <p className="text-xs text-danger-600">{error}</p> : null}

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
            const descansaHoy = diaHoy?.descansaId === lavador.id
            const entraHoy = diaHoy?.banoId === lavador.id
            const saleHoy = diaHoy?.saleId === lavador.id
            const permiso = diaHoy?.permisos.find((p) => p.lavadorId === lavador.id)
            return (
              <Card key={lavador.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="truncate font-medium text-neutral-900">{lavador.nombre}</p>
                  <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-neutral-500">
                    {descansaHoy ? (
                      <span className="flex items-center gap-1">
                        <BedDouble size={12} /> Descansa hoy
                      </span>
                    ) : null}
                    {entraHoy ? (
                      <span className="flex items-center gap-1 text-warning-700">
                        <Droplets size={12} /> Entra 7am + lava baño
                      </span>
                    ) : null}
                    {saleHoy ? (
                      <span className="flex items-center gap-1">
                        <LogOut size={12} /> Sale 7pm
                      </span>
                    ) : null}
                    {permiso ? (
                      <span className="flex items-center gap-1">
                        <CalendarOff size={12} /> Permiso · {permiso.motivo}
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  {entraHoy ? (
                    diaHoy?.banoHecho ? (
                      <button
                        type="button"
                        onClick={() => handleMarcarBano(false)}
                        disabled={marcandoBano}
                        title="Deshacer la marca del baño"
                        className="flex items-center gap-1.5 rounded-lg bg-success-50 px-3 py-2 text-sm font-medium text-success-700 transition-colors hover:bg-success-600/10 disabled:opacity-60"
                      >
                        <CheckCircle2 size={14} /> Baño hecho
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleMarcarBano(true)}
                        disabled={marcandoBano}
                        className="flex items-center gap-1.5 rounded-lg border border-warning-600/30 bg-warning-50 px-3 py-2 text-sm font-medium text-warning-700 transition-colors hover:bg-warning-600/10 disabled:opacity-60"
                      >
                        <Droplets size={14} /> Marcar baño hecho
                      </button>
                    )
                  ) : null}
                  {permiso ? (
                    <span className="rounded-lg bg-neutral-100 px-3 py-2 text-sm font-medium text-neutral-500">
                      Sin asistencia
                    </span>
                  ) : asistencia ? (
                    <span className="flex items-center gap-1.5 rounded-lg bg-success-50 px-3 py-2 text-sm font-medium text-success-700">
                      <Clock size={14} />
                      {new Date(asistencia.horaEntrada).toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' })}
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleMarcarAsistencia(lavador.id)}
                      disabled={marcandoLavadorId === lavador.id}
                      className="rounded-xl bg-primary-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-700 disabled:opacity-60"
                    >
                      {marcandoLavadorId === lavador.id ? 'Marcando…' : 'Marcar entrada'}
                    </button>
                  )}
                </div>
              </Card>
            )
          })}
          {lavadores.length === 0 ? (
            <Card className="py-8 text-center text-sm text-neutral-400">No hay lavadores activos.</Card>
          ) : null}
        </div>
      </div>

      <div>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-neutral-900">
          <CalendarDays size={15} className="text-primary-600" />
          Cronograma del mes
        </h2>
        <CronogramaPanel
          actor={turno.responsableActual}
          hoyISO={data.hoyISO}
          onCambio={() => {
            refrescarHoy().catch((err) => toast.desdeError(err, 'No se pudo refrescar el cronograma de hoy'))
          }}
        />
      </div>
    </div>
  )
}
