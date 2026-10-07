import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  CalendarOff,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Droplets,
  LogOut,
  Moon,
  Pencil,
  RotateCcw,
  Undo2,
} from 'lucide-react'
import { fetchLavadores } from '../../data/lavadores'
import { cambiarDescanso } from '../../data/asistenciaLavadores'
import {
  anularPermiso,
  crearPermiso,
  fetchCronogramaMes,
  guardarTurnoDia,
  marcarBano,
  restablecerMes,
  type CronogramaMes,
} from '../../data/cronograma'
import {
  armarDias,
  DIAS_SEMANA,
  limitesDeMes,
  parseISO,
  resumirMes,
  type DiaCronograma,
} from '../../lib/cronograma'
import type { Lavador } from '../../schemas/lavador'
import { toast } from '../../lib/toast'
import { Button } from '../layout/Button'
import { Card } from '../layout/Card'
import { ConfirmModal } from '../layout/ConfirmModal'
import { CustomSelect } from '../layout/CustomSelect'
import { Modal } from '../layout/Modal'

interface Props {
  /** Quién opera: queda como autor de cada cambio (el responsable del turno, o la cuenta de gerencia). */
  actor: string
  hoyISO: string
  /** Se llama después de guardar algo, para que la pantalla que contiene el panel se refresque. */
  onCambio?: () => void
}

const INPUT_CLASS =
  'rounded-lg border border-neutral-300 px-3 py-2.5 text-sm outline-none transition-colors focus:border-primary-500 focus:ring-1 focus:ring-primary-500'

function capitalizar(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

function fechaLarga(iso: string): string {
  return capitalizar(
    parseISO(iso).toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' }),
  )
}

function hora(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' })
}

// Cronograma mensual compartido por el jefe de patio (dentro de Asistencia) y gerencia (Personal ›
// Cronograma): misma rejilla del Excel de la jefa — quién descansa, quién entra a las 7am y lava el
// baño, quién sale a las 7pm — editable día por día, con permisos y seguimiento del baño.
export function CronogramaPanel({ actor, hoyISO, onCambio }: Props) {
  const hoy = parseISO(hoyISO)
  const [anio, setAnio] = useState(hoy.getFullYear())
  const [mes0, setMes0] = useState(hoy.getMonth())
  const [lavadores, setLavadores] = useState<Lavador[]>([])
  const [datos, setDatos] = useState<{ desde: string; mes: CronogramaMes } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [fechaAbierta, setFechaAbierta] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [confirmandoReset, setConfirmandoReset] = useState(false)

  const { desde, hasta } = limitesDeMes(anio, mes0)

  const cargar = useCallback(async (d: string, h: string) => {
    const mes = await fetchCronogramaMes(d, h)
    setDatos({ desde: d, mes })
  }, [])

  useEffect(() => {
    fetchLavadores()
      .then(setLavadores)
      .catch((err) => setError(err instanceof Error ? err.message : 'No se pudieron cargar los lavadores'))
  }, [])

  // Carga al cambiar de mes. `activo` descarta la respuesta de un mes que el usuario ya dejó atrás.
  useEffect(() => {
    let activo = true
    fetchCronogramaMes(desde, hasta)
      .then((mes) => {
        if (!activo) return
        setDatos({ desde, mes })
        setError(null)
      })
      .catch((err) => {
        if (activo) setError(err instanceof Error ? err.message : 'No se pudo cargar el cronograma')
      })
    return () => {
      activo = false
    }
  }, [desde, hasta])

  const cargando = datos?.desde !== desde
  const dias = useMemo(
    () => (datos && datos.desde === desde ? armarDias(desde, hasta, datos.mes.descansos, datos.mes.extras, datos.mes.permisos) : []),
    [datos, desde, hasta],
  )
  const resumen = useMemo(() => resumirMes(dias, hoyISO), [dias, hoyISO])
  const activos = useMemo(() => lavadores.filter((l) => l.activo), [lavadores])
  // Lugares de la rotación (0-3) sin lavador activo: ese día de la semana nadie descansa hasta que
  // alguien lo ocupe (se asigna en Personal › Lavadores).
  const lugaresLibres =
    lavadores.length === 0
      ? 0
      : 4 - new Set(activos.filter((l) => l.posicionCronograma !== undefined).map((l) => l.posicionCronograma)).size
  const nombreDe = useCallback(
    (id?: string) => (id ? (lavadores.find((l) => l.id === id)?.nombre ?? '—') : undefined),
    [lavadores],
  )

  function irAMes(delta: number) {
    const d = new Date(anio, mes0 + delta, 1)
    setAnio(d.getFullYear())
    setMes0(d.getMonth())
  }

  async function ejecutar(accion: () => Promise<void>, exito?: string) {
    setGuardando(true)
    try {
      await accion()
      await cargar(desde, hasta)
      onCambio?.()
      if (exito) toast.exito(exito)
    } catch (err) {
      toast.desdeError(err, 'No se pudo guardar el cambio')
    } finally {
      setGuardando(false)
    }
  }

  const desdeReset = hoyISO > desde ? hoyISO : desde
  const sePuedeRestablecer = desdeReset <= hasta
  const diaAbierto = dias.find((d) => d.fecha === fechaAbierta)
  const offsetInicial = dias[0]?.diaSemana ?? 0
  const tituloMes = capitalizar(new Date(anio, mes0, 1).toLocaleDateString('es-CO', { month: 'long', year: 'numeric' }))

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => irAMes(-1)}
            aria-label="Mes anterior"
            className="flex size-9 items-center justify-center rounded-lg border border-neutral-200 text-neutral-500 transition-colors hover:bg-neutral-50"
          >
            <ChevronLeft size={16} />
          </button>
          <h2 className="min-w-40 text-center text-base font-semibold text-neutral-900">{tituloMes}</h2>
          <button
            type="button"
            onClick={() => irAMes(1)}
            aria-label="Mes siguiente"
            className="flex size-9 items-center justify-center rounded-lg border border-neutral-200 text-neutral-500 transition-colors hover:bg-neutral-50"
          >
            <ChevronRight size={16} />
          </button>
          {anio !== hoy.getFullYear() || mes0 !== hoy.getMonth() ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setAnio(hoy.getFullYear())
                setMes0(hoy.getMonth())
              }}
            >
              Ir a hoy
            </Button>
          ) : null}
        </div>
        <Button size="sm" icon={RotateCcw} disabled={!sePuedeRestablecer || cargando} onClick={() => setConfirmandoReset(true)}>
          Restablecer a la rotación
        </Button>
      </div>

      {error ? <p className="rounded-lg bg-danger-50 px-3 py-2.5 text-sm text-danger-700">{error}</p> : null}
      {lugaresLibres > 0 ? (
        <p className="flex items-start gap-2 rounded-lg border border-warning-600/25 bg-warning-50 px-3 py-2.5 text-sm text-warning-700">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          {lugaresLibres === 1 ? 'Hay 1 lugar' : `Hay ${lugaresLibres} lugares`} de la rotación sin lavador: los días que le
          tocan nadie descansa. Asígnalo en Personal › Lavadores (Editar › Lugar en la rotación).
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Resumen
          etiqueta="Baño hecho"
          valor={`${resumen.banosHechos} de ${resumen.banosAsignados}`}
          tono="success"
        />
        <Resumen
          etiqueta="Baño sin marcar"
          valor={String(resumen.banosSinMarcar.length)}
          tono={resumen.banosSinMarcar.length > 0 ? 'danger' : 'neutral'}
        />
        <Resumen etiqueta="Permisos" valor={String(resumen.permisos)} tono="neutral" />
        <Resumen etiqueta="Días con cambios a mano" valor={String(resumen.cambiosAMano)} tono="neutral" />
      </div>

      <div className={`grid grid-cols-1 gap-2 md:grid-cols-7 ${cargando ? 'opacity-50' : ''}`}>
        {DIAS_SEMANA.map((nombre) => (
          <div key={nombre} className="hidden pb-1 text-center text-xs font-semibold text-neutral-500 md:block">
            {nombre}
          </div>
        ))}
        {Array.from({ length: offsetInicial }).map((_, i) => (
          <div key={`vacio-${i}`} className="hidden md:block" />
        ))}
        {dias.map((dia) => (
          <CeldaDia key={dia.fecha} dia={dia} hoyISO={hoyISO} nombreDe={nombreDe} onAbrir={() => setFechaAbierta(dia.fecha)} />
        ))}
      </div>
      {cargando && !error ? <p className="text-center text-xs text-neutral-400">Cargando el mes…</p> : null}

      <Leyenda />

      <Seguimiento
        resumen={resumen}
        nombreDe={nombreDe}
        onAbrir={(fecha) => setFechaAbierta(fecha)}
      />

      {diaAbierto ? (
        <DiaModal
          dia={diaAbierto}
          hoyISO={hoyISO}
          activos={activos}
          nombreDe={nombreDe}
          guardando={guardando}
          onClose={() => setFechaAbierta(null)}
          onDescanso={(lavadorId) =>
            ejecutar(async () => {
              await cambiarDescanso(diaAbierto.fecha, { lavadorId, actualizadoPor: actor })
            }, 'Descanso actualizado')
          }
          onTurno={(cambio) =>
            ejecutar(async () => {
              await guardarTurnoDia(diaAbierto.fecha, cambio, actor)
            }, 'Cronograma actualizado')
          }
          onBano={(hecho) =>
            ejecutar(async () => {
              await marcarBano(diaAbierto.fecha, hecho, actor)
            }, hecho ? 'Baño marcado como hecho' : 'Marca del baño deshecha')
          }
          onPermiso={(lavadorId, motivo) =>
            ejecutar(async () => {
              await crearPermiso(diaAbierto.fecha, { lavadorId, motivo }, actor)
            }, 'Permiso registrado')
          }
          onAnularPermiso={(id) =>
            ejecutar(async () => {
              await anularPermiso(id)
            }, 'Permiso anulado')
          }
        />
      ) : null}

      {confirmandoReset ? (
        <ConfirmModal
          title="Restablecer a la rotación"
          message={`Desde hoy hasta el fin de ${tituloMes}, quién descansa vuelve a la rotación fija y se borran los cambios a mano de quién entra y quién sale. Los días anteriores no se tocan y los cambios quedan en la bitácora.`}
          confirmLabel="Restablecer"
          variant="danger"
          successMessage="Cronograma restablecido"
          onCancel={() => setConfirmandoReset(false)}
          onConfirm={async () => {
            await restablecerMes(desdeReset, hasta)
            setConfirmandoReset(false)
            await cargar(desde, hasta)
            onCambio?.()
          }}
        />
      ) : null}
    </div>
  )
}

function Resumen({ etiqueta, valor, tono }: { etiqueta: string; valor: string; tono: 'success' | 'danger' | 'neutral' }) {
  const color = tono === 'success' ? 'text-success-700' : tono === 'danger' ? 'text-danger-700' : 'text-neutral-900'
  return (
    <Card className="flex flex-col gap-0.5 p-4">
      <span className="text-xs font-medium text-neutral-500">{etiqueta}</span>
      <span className={`text-xl font-semibold tabular-nums ${color}`}>{valor}</span>
    </Card>
  )
}

function Leyenda() {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-neutral-500">
      <span className="flex items-center gap-1.5">
        <Moon size={13} className="text-primary-600" /> Descansa
      </span>
      <span className="flex items-center gap-1.5">
        <Droplets size={13} className="text-warning-700" /> Entra 7am + lava baño
      </span>
      <span className="flex items-center gap-1.5">
        <LogOut size={13} className="text-neutral-500" /> Sale 7pm
      </span>
      <span className="flex items-center gap-1.5">
        <CalendarOff size={13} className="text-neutral-500" /> Permiso (no se le marca asistencia)
      </span>
      <span className="flex items-center gap-1.5">
        <Pencil size={13} className="text-neutral-500" /> Cambiado a mano
      </span>
    </div>
  )
}

function CeldaDia({
  dia,
  hoyISO,
  nombreDe,
  onAbrir,
}: {
  dia: DiaCronograma
  hoyISO: string
  nombreDe: (id?: string) => string | undefined
  onAbrir: () => void
}) {
  const esHoy = dia.fecha === hoyISO
  const finDeSemana = dia.diaSemana >= 5
  const banoSinMarcar = !!dia.banoId && !dia.banoHecho && dia.fecha < hoyISO
  const numero = Number(dia.fecha.slice(8))
  const hayContenido = !!(dia.descansaId || dia.banoId || dia.saleId || dia.permisos.length > 0)

  return (
    <button
      type="button"
      onClick={onAbrir}
      className={`flex flex-col gap-1.5 rounded-xl border p-2.5 text-left transition-colors hover:border-primary-300 hover:bg-primary-50/40 md:min-h-32 ${
        esHoy ? 'border-primary-400 bg-primary-50/40 ring-1 ring-primary-400' : 'border-neutral-200 bg-white'
      } ${finDeSemana && !hayContenido ? 'bg-neutral-50/70' : ''}`}
    >
      <span className="flex items-center justify-between gap-2 text-xs">
        <span className={`font-semibold ${esHoy ? 'text-primary-700' : 'text-neutral-700'}`}>
          <span className="md:hidden">{DIAS_SEMANA[dia.diaSemana]} </span>
          {numero}
        </span>
        {dia.descansoCambiadoPor || dia.banoManual || dia.saleManual ? (
          <Pencil size={11} className="text-neutral-400" aria-label="Cambiado a mano" />
        ) : null}
      </span>

      {dia.descansaId ? (
        <span className="flex items-start gap-1.5 rounded-md bg-primary-50 px-1.5 py-1 text-[11px] leading-tight text-primary-800">
          <Moon size={12} className="mt-px shrink-0" />
          <span className="min-w-0 break-words">{nombreDe(dia.descansaId)}</span>
        </span>
      ) : null}

      {dia.banoId ? (
        <span
          className={`flex items-start gap-1.5 rounded-md px-1.5 py-1 text-[11px] leading-tight ${
            dia.banoHecho
              ? 'bg-success-50 text-success-700'
              : banoSinMarcar
                ? 'bg-danger-50 text-danger-700'
                : 'bg-warning-50 text-warning-700'
          }`}
        >
          {dia.banoHecho ? (
            <CheckCircle2 size={12} className="mt-px shrink-0" />
          ) : banoSinMarcar ? (
            <AlertTriangle size={12} className="mt-px shrink-0" />
          ) : (
            <Droplets size={12} className="mt-px shrink-0" />
          )}
          <span className="min-w-0 break-words">{nombreDe(dia.banoId)}</span>
        </span>
      ) : null}

      {dia.saleId ? (
        <span className="flex items-start gap-1.5 px-1.5 text-[11px] leading-tight text-neutral-600">
          <LogOut size={12} className="mt-px shrink-0 text-neutral-400" />
          <span className="min-w-0 break-words">{nombreDe(dia.saleId)}</span>
        </span>
      ) : null}

      {dia.permisos.map((p) => (
        <span key={p.id} className="flex items-start gap-1.5 rounded-md bg-neutral-100 px-1.5 py-1 text-[11px] leading-tight text-neutral-600">
          <CalendarOff size={12} className="mt-px shrink-0" />
          <span className="min-w-0 break-words">{nombreDe(p.lavadorId)}</span>
        </span>
      ))}

      {finDeSemana && !hayContenido ? <span className="text-[11px] text-neutral-400">Todos trabajan</span> : null}
    </button>
  )
}

function Seguimiento({
  resumen,
  nombreDe,
  onAbrir,
}: {
  resumen: ReturnType<typeof resumirMes>
  nombreDe: (id?: string) => string | undefined
  onAbrir: (fecha: string) => void
}) {
  const filas = [...resumen.porLavador].sort((a, b) => (nombreDe(a.lavadorId) ?? '').localeCompare(nombreDe(b.lavadorId) ?? ''))
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card className="flex flex-col gap-3 p-5">
        <h3 className="text-sm font-semibold text-neutral-900">Seguimiento por lavador</h3>
        {filas.length === 0 ? (
          <p className="text-sm text-neutral-400">Todavía no hay datos este mes.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-neutral-100">
            {filas.map((f) => (
              <li key={f.lavadorId} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5 text-sm first:pt-0 last:pb-0">
                <span className="font-medium text-neutral-800">{nombreDe(f.lavadorId)}</span>
                <span className="flex flex-wrap gap-x-3 text-xs text-neutral-500">
                  <span>{f.descansos} descansos</span>
                  <span>
                    baño {f.banosHechos}/{f.banosAsignados}
                  </span>
                  {f.permisos > 0 ? <span>{f.permisos} permisos</span> : null}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="flex flex-col gap-3 p-5">
        <h3 className="text-sm font-semibold text-neutral-900">Baños sin marcar</h3>
        {resumen.banosSinMarcar.length === 0 ? (
          <p className="text-sm text-neutral-400">No hay baños pendientes de marcar en días anteriores.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-neutral-100">
            {resumen.banosSinMarcar.map((d) => (
              <li key={d.fecha}>
                <button
                  type="button"
                  onClick={() => onAbrir(d.fecha)}
                  className="flex w-full items-center justify-between gap-3 py-2.5 text-left text-sm transition-colors first:pt-0 last:pb-0 hover:text-primary-700"
                >
                  <span className="font-medium text-neutral-800">{nombreDe(d.banoId)}</span>
                  <span className="text-xs text-danger-700">{fechaLarga(d.fecha)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}

function DiaModal({
  dia,
  hoyISO,
  activos,
  nombreDe,
  guardando,
  onClose,
  onDescanso,
  onTurno,
  onBano,
  onPermiso,
  onAnularPermiso,
}: {
  dia: DiaCronograma
  hoyISO: string
  activos: Lavador[]
  nombreDe: (id?: string) => string | undefined
  guardando: boolean
  onClose: () => void
  onDescanso: (lavadorId: string) => void
  onTurno: (cambio: { banoLavadorId?: string | null; saleLavadorId?: string | null }) => void
  onBano: (hecho: boolean) => void
  onPermiso: (lavadorId: string, motivo: string) => void
  onAnularPermiso: (id: string) => void
}) {
  const [permisoLavador, setPermisoLavador] = useState('')
  const [permisoMotivo, setPermisoMotivo] = useState('')

  // Un lavador inactivo que quedó en una fecha vieja tiene que seguir apareciendo en su selector.
  const opciones = (actualId?: string) => {
    const base = activos.map((l) => ({ value: l.id, label: l.nombre }))
    if (actualId && !base.some((o) => o.value === actualId)) {
      base.push({ value: actualId, label: nombreDe(actualId) ?? '—' })
    }
    return base
  }
  const laboral = dia.diaSemana <= 4
  const puedeMarcarBano = !!dia.banoId && dia.fecha <= hoyISO
  const conPermiso = new Set(dia.permisos.map((p) => p.lavadorId))

  return (
    <Modal
      title={fechaLarga(dia.fecha)}
      subtitle={dia.fecha === hoyISO ? 'Hoy' : undefined}
      icon={Moon}
      size="md"
      onClose={onClose}
      footer={
        <Button variant="ghost" onClick={onClose}>
          Cerrar
        </Button>
      }
    >
      <div className="flex flex-col gap-6">
        <section className="flex flex-col gap-1.5">
          <h3 className="flex items-center gap-1.5 text-sm font-medium text-neutral-700">
            <Moon size={14} className="text-primary-600" /> Descansa
          </h3>
          {dia.descansaId ? (
            <CustomSelect
              size="sm"
              value={dia.descansaId}
              onChange={(id) => id !== dia.descansaId && onDescanso(id)}
              options={opciones(dia.descansaId)}
              placeholder="Selecciona…"
              disabled={guardando}
            />
          ) : (
            <p className="text-sm text-neutral-400">Nadie descansa este día — trabajan todos.</p>
          )}
          {dia.descansoCambiadoPor ? (
            <p className="text-xs text-neutral-400">Cambiado a mano por {dia.descansoCambiadoPor}.</p>
          ) : null}
        </section>

        {laboral || dia.banoId ? (
          <section className="flex flex-col gap-1.5">
            <h3 className="flex items-center gap-1.5 text-sm font-medium text-neutral-700">
              <Droplets size={14} className="text-warning-700" /> Entra 7am + lava baño
            </h3>
            <CustomSelect
              size="sm"
              value={dia.banoId ?? ''}
              onChange={(id) => id !== dia.banoId && onTurno({ banoLavadorId: id })}
              options={opciones(dia.banoId)}
              placeholder="Sin asignar"
              disabled={guardando}
            />
            {dia.banoManual ? (
              <button
                type="button"
                onClick={() => onTurno({ banoLavadorId: null })}
                className="flex w-fit items-center gap-1 text-xs font-medium text-primary-700 hover:underline"
              >
                <RotateCcw size={11} /> Cambiado a mano · volver a la rotación
              </button>
            ) : null}
            {dia.banoId ? (
              dia.banoHecho ? (
                <div className="mt-1 flex items-center justify-between gap-3 rounded-lg bg-success-50 px-3 py-2.5 text-sm text-success-700">
                  <span className="flex items-center gap-1.5">
                    <CheckCircle2 size={15} /> Baño hecho · {dia.banoHecho.por}, {hora(dia.banoHecho.en)}
                  </span>
                  <button
                    type="button"
                    onClick={() => onBano(false)}
                    disabled={guardando}
                    className="flex items-center gap-1 text-xs font-medium hover:underline disabled:opacity-60"
                  >
                    <Undo2 size={12} /> Deshacer
                  </button>
                </div>
              ) : (
                <Button
                  size="sm"
                  variant="primary"
                  icon={CheckCircle2}
                  disabled={!puedeMarcarBano || guardando}
                  onClick={() => onBano(true)}
                  className="mt-1 w-fit"
                >
                  {puedeMarcarBano ? 'Marcar baño hecho' : 'Todavía no es ese día'}
                </Button>
              )
            ) : null}
          </section>
        ) : null}

        {laboral || dia.saleId ? (
          <section className="flex flex-col gap-1.5">
            <h3 className="flex items-center gap-1.5 text-sm font-medium text-neutral-700">
              <LogOut size={14} className="text-neutral-500" /> Sale 7pm
            </h3>
            <CustomSelect
              size="sm"
              value={dia.saleId ?? ''}
              onChange={(id) => id !== dia.saleId && onTurno({ saleLavadorId: id })}
              options={opciones(dia.saleId)}
              placeholder="Nadie sale temprano"
              disabled={guardando}
            />
            {dia.saleManual ? (
              <button
                type="button"
                onClick={() => onTurno({ saleLavadorId: null })}
                className="flex w-fit items-center gap-1 text-xs font-medium text-primary-700 hover:underline"
              >
                <RotateCcw size={11} /> Cambiado a mano · volver a la rotación
              </button>
            ) : null}
          </section>
        ) : null}

        <section className="flex flex-col gap-2 border-t border-neutral-100 pt-5">
          <h3 className="flex items-center gap-1.5 text-sm font-medium text-neutral-700">
            <CalendarOff size={14} className="text-neutral-500" /> Permisos
          </h3>
          <p className="text-xs text-neutral-500">
            Con permiso el lavador no trabaja ese día y no se le marca asistencia (no cuenta como falta).
          </p>
          {dia.permisos.length > 0 ? (
            <ul className="flex flex-col divide-y divide-neutral-100 rounded-xl border border-neutral-100">
              {dia.permisos.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium text-neutral-800">{nombreDe(p.lavadorId)}</p>
                    <p className="text-xs text-neutral-500">
                      {p.motivo} · {p.registradoPor}
                    </p>
                  </div>
                  <Button size="sm" variant="danger-ghost" disabled={guardando} onClick={() => onAnularPermiso(p.id)}>
                    Anular
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-[1fr_1.4fr_auto]">
            <CustomSelect
              size="sm"
              value={permisoLavador}
              onChange={setPermisoLavador}
              options={activos.filter((l) => !conPermiso.has(l.id)).map((l) => ({ value: l.id, label: l.nombre }))}
              placeholder="Lavador"
              emptyLabel="Todos tienen permiso"
              disabled={guardando}
            />
            <input
              value={permisoMotivo}
              onChange={(e) => setPermisoMotivo(e.target.value)}
              placeholder="Motivo"
              className={INPUT_CLASS}
            />
            <Button
              variant="secondary"
              disabled={guardando || !permisoLavador || permisoMotivo.trim().length < 3}
              onClick={() => {
                onPermiso(permisoLavador, permisoMotivo.trim())
                setPermisoLavador('')
                setPermisoMotivo('')
              }}
            >
              Agregar
            </Button>
          </div>
        </section>
      </div>
    </Modal>
  )
}
