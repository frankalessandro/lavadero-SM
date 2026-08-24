import { useState, type FormEvent } from 'react'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { X, CheckCircle2, ClipboardCheck } from 'lucide-react'
import { fetchTurnoAbierto, fetchTurnos, desgloseEsperado, cerrarTurno, type DesgloseEsperado } from '../../../data/turnos'
import type { TurnoCaja } from '../../../schemas/turnoCaja'
import { Card } from '../../../components/layout/Card'
import { CurrencyInput } from '../../../components/layout/CurrencyInput'
import { AbrirTurnoPrompt, TurnoResponsableBanner } from '../../../components/layout/TurnoResponsableBanner'

async function loadCaja() {
  const [turnoAbierto, turnosRecientes] = await Promise.all([
    fetchTurnoAbierto('jefe_zona'),
    fetchTurnos('jefe_zona'),
  ])
  return { turnoAbierto, turnosRecientes: turnosRecientes.slice(0, 5) }
}

export const Route = createFileRoute('/jefe-zona/caja/')({
  loader: loadCaja,
  component: CajaJefeZona,
})

const COP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })

function formatFecha(iso: string | undefined) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })
}

function CajaJefeZona() {
  const data = Route.useLoaderData()
  const router = useRouter()
  const [turnoAbierto, setTurnoAbierto] = useState(data.turnoAbierto)
  const [turnosRecientes, setTurnosRecientes] = useState(data.turnosRecientes)
  const [cerrando, setCerrando] = useState(false)

  async function refresh() {
    const [nuevoAbierto, nuevosRecientes] = await Promise.all([
      fetchTurnoAbierto('jefe_zona'),
      fetchTurnos('jefe_zona'),
    ])
    setTurnoAbierto(nuevoAbierto)
    setTurnosRecientes(nuevosRecientes.slice(0, 5))
    router.invalidate()
  }

  return (
    <div className="flex flex-col gap-6">
      {turnoAbierto ? (
        <TurnoResponsableBanner turno={turnoAbierto} onTransferido={setTurnoAbierto}>
          <button
            type="button"
            onClick={() => setCerrando(true)}
            className="flex items-center justify-center gap-2 rounded-lg bg-primary-600 py-3 text-sm font-semibold text-white shadow-nav-active transition-colors hover:bg-primary-700"
          >
            <ClipboardCheck size={16} />
            Cerrar turno
          </button>
        </TurnoResponsableBanner>
      ) : (
        <AbrirTurnoPrompt onAbierto={refresh} />
      )}

      <div>
        <h2 className="mb-2 text-sm font-semibold text-neutral-900">Turnos recientes</h2>
        <div className="flex flex-col gap-2">
          {turnosRecientes.map((turno) => (
            <TurnoRecienteRow key={turno.id} turno={turno} />
          ))}
          {turnosRecientes.length === 0 ? (
            <Card className="py-10 text-center text-sm text-neutral-400">Todavía no hay turnos registrados.</Card>
          ) : null}
        </div>
      </div>

      {cerrando && turnoAbierto ? (
        <CerrarTurnoModal
          turno={turnoAbierto}
          onClose={() => setCerrando(false)}
          onCerrado={async () => {
            setCerrando(false)
            await refresh()
          }}
        />
      ) : null}
    </div>
  )
}

function TurnoRecienteRow({ turno }: { turno: TurnoCaja }) {
  const diferencia = turno.diferencia ?? 0
  const tieneDiferencia = turno.cerrado && diferencia !== 0

  return (
    <Card className="flex flex-col gap-2 p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-neutral-900">{turno.responsable}</p>
          <p className="text-xs text-neutral-500">
            {formatFecha(turno.abiertoEn)} → {turno.cerrado ? formatFecha(turno.cerradoEn) : 'abierto'}
          </p>
        </div>
        <span
          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
            turno.cerrado ? 'bg-neutral-100 text-neutral-600' : 'bg-success-50 text-success-700'
          }`}
        >
          {turno.cerrado ? 'Cerrado' : 'En curso'}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        <div>
          <p className="text-neutral-400">Base</p>
          <p className="font-medium text-neutral-700">{COP.format(turno.baseInicial)}</p>
        </div>
        <div>
          <p className="text-neutral-400">Esperado</p>
          <p className="font-medium text-neutral-700">{turno.valorEsperado != null ? COP.format(turno.valorEsperado) : '—'}</p>
        </div>
        <div>
          <p className="text-neutral-400">Conteo</p>
          <p className="font-medium text-neutral-700">{turno.conteoFisico != null ? COP.format(turno.conteoFisico) : '—'}</p>
        </div>
        <div>
          <p className="text-neutral-400">Diferencia</p>
          <p className={`font-medium ${tieneDiferencia ? 'text-danger-600' : 'text-neutral-700'}`}>
            {turno.cerrado ? COP.format(diferencia) : '—'}
          </p>
        </div>
      </div>
      {turno.justificacionDiferencia ? (
        <p className="text-xs text-neutral-500">Justificación: {turno.justificacionDiferencia}</p>
      ) : null}
    </Card>
  )
}

function CerrarTurnoModal({
  turno,
  onClose,
  onCerrado,
}: {
  turno: TurnoCaja
  onClose: () => void
  onCerrado: () => Promise<void>
}) {
  const [paso, setPaso] = useState<'conteo' | 'revelado'>('conteo')
  const [conteoFisico, setConteoFisico] = useState('')
  const [valorEsperado, setValorEsperado] = useState<number | null>(null)
  const [desglose, setDesglose] = useState<DesgloseEsperado | null>(null)
  const [justificacion, setJustificacion] = useState('')
  const [cerradoPor, setCerradoPor] = useState(turno.responsableActual)
  const [recibidoPor, setRecibidoPor] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleContinuar(event: FormEvent) {
    event.preventDefault()
    setError(null)
    const conteo = Number(conteoFisico)
    if (!Number.isFinite(conteo) || conteo < 0) {
      setError('El conteo debe ser un valor válido')
      return
    }
    setLoading(true)
    try {
      const detalle = await desgloseEsperado(turno)
      setDesglose(detalle)
      setValorEsperado(detalle.total)
      setPaso('revelado')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo calcular el valor esperado')
    } finally {
      setLoading(false)
    }
  }

  async function handleCerrar(event: FormEvent) {
    event.preventDefault()
    setError(null)
    if (valorEsperado == null) return
    const conteo = Math.round(Number(conteoFisico))
    const diferencia = conteo - valorEsperado
    if (diferencia !== 0 && !justificacion.trim()) {
      setError('Hay una diferencia en el arqueo — la justificación es obligatoria')
      return
    }
    if (!cerradoPor.trim()) {
      setError('Indica quién cierra el turno')
      return
    }
    setLoading(true)
    try {
      await cerrarTurno(
        turno,
        conteo,
        cerradoPor.trim(),
        justificacion.trim() || undefined,
        recibidoPor.trim() || undefined,
      )
      await onCerrado()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cerrar el turno')
    } finally {
      setLoading(false)
    }
  }

  const conteoNum = Math.round(Number(conteoFisico) || 0)
  const diferencia = valorEsperado != null ? conteoNum - valorEsperado : 0
  const hayDiferencia = valorEsperado != null && diferencia !== 0

  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center bg-neutral-900/40 backdrop-blur-[2px] sm:items-center sm:p-4">
      <div className="w-full max-w-sm rounded-t-2xl bg-white p-5 shadow-card-hover sm:rounded-2xl">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-neutral-900">Cerrar turno</h3>
            <p className="text-xs text-neutral-500">Responsable: {turno.responsable}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex size-8 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-neutral-100"
          >
            <X size={18} />
          </button>
        </div>

        {paso === 'conteo' ? (
          <form onSubmit={handleContinuar} className="flex flex-col gap-4">
            <p className="text-xs text-neutral-500">
              Cuenta el dinero físico en caja antes de ver el valor esperado del sistema (arqueo ciego).
            </p>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-neutral-700">Conteo físico</span>
              <CurrencyInput autoFocus size="sm" prefix="$" value={conteoFisico} onChange={setConteoFisico} />
            </label>

            {error ? <p className="text-xs text-danger-600">{error}</p> : null}

            <button
              type="submit"
              disabled={loading}
              className="flex items-center justify-center gap-2 rounded-lg bg-primary-600 py-3 text-sm font-semibold text-white shadow-nav-active transition-colors hover:bg-primary-700 disabled:opacity-60"
            >
              {loading ? 'Calculando…' : 'Continuar'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleCerrar} className="flex flex-col gap-4">
            {desglose && turno.rol === 'jefe_zona' ? (
              <div className="rounded-lg border border-neutral-200 p-3 text-xs text-neutral-600">
                <p className="mb-1.5 font-medium text-neutral-500">Cómo se llega al esperado</p>
                <div className="flex items-center justify-between">
                  <span>Base inicial</span>
                  <span className="font-medium text-neutral-900">{COP.format(desglose.base)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>+ Lavados en efectivo</span>
                  <span className="font-medium text-neutral-900">{COP.format(desglose.ingresosLavados)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>+ Ventas de productos en efectivo</span>
                  <span className="font-medium text-neutral-900">{COP.format(desglose.ingresosVentas)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>− Gastos de caja</span>
                  <span className="font-medium text-neutral-900">{COP.format(desglose.gastos)}</span>
                </div>
              </div>
            ) : null}
            <div
              className={`rounded-lg p-3 text-sm ${
                hayDiferencia ? 'bg-danger-50 text-danger-700' : 'bg-success-50 text-success-700'
              }`}
            >
              <div className="flex items-center justify-between">
                <span>Valor esperado</span>
                <span className="font-semibold">{COP.format(valorEsperado ?? 0)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Conteo físico</span>
                <span className="font-semibold">{COP.format(conteoNum)}</span>
              </div>
              <div className="mt-1 flex items-center justify-between border-t border-current/20 pt-1">
                <span className="font-medium">Diferencia</span>
                <span className="font-semibold">{COP.format(diferencia)}</span>
              </div>
            </div>

            {hayDiferencia ? (
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="font-medium text-neutral-700">Justificación (obligatoria)</span>
                <textarea
                  autoFocus
                  value={justificacion}
                  onChange={(e) => setJustificacion(e.target.value)}
                  placeholder="Motivo de la diferencia"
                  rows={2}
                  className="rounded-lg border border-neutral-300 px-3 py-3 text-base outline-none transition-colors focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
                />
              </label>
            ) : null}

            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-neutral-700">Quién cierra</span>
              <input
                value={cerradoPor}
                onChange={(e) => setCerradoPor(e.target.value)}
                placeholder="Nombre"
                className="rounded-lg border border-neutral-300 px-3 py-3 text-base outline-none transition-colors focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
              />
            </label>

            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-neutral-700">Recibido por (opcional)</span>
              <input
                value={recibidoPor}
                onChange={(e) => setRecibidoPor(e.target.value)}
                placeholder="Nombre de quien recibe"
                className="rounded-lg border border-neutral-300 px-3 py-3 text-base outline-none transition-colors focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
              />
            </label>

            {error ? <p className="text-xs text-danger-600">{error}</p> : null}

            <button
              type="submit"
              disabled={loading}
              className="flex items-center justify-center gap-2 rounded-lg bg-primary-600 py-3 text-sm font-semibold text-white shadow-nav-active transition-colors hover:bg-primary-700 disabled:opacity-60"
            >
              <CheckCircle2 size={16} />
              {loading ? 'Cerrando…' : 'Cerrar turno'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
