import { useState, type FormEvent, type ReactNode } from 'react'
import { LockOpen, Lock, ArrowLeftRight, History, X } from 'lucide-react'
import { abrirTurno, fetchTraspasos, transferirResponsable } from '../../data/turnos'
import type { RolCaja, TurnoCaja, TraspasoTurno } from '../../schemas/turnoCaja'
import { Card } from './Card'
import { CurrencyInput } from './CurrencyInput'

const COP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })

function formatFecha(iso: string | undefined) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })
}

// Compartido entre /jefe-zona/caja y /jefe-zona/asistencia: un solo turno de jefe_zona es la
// fuente de "quién es responsable ahora" para las dos pantallas — abrirlo desde cualquiera de
// las dos habilita ambas, y transferir la responsabilidad se refleja igual en las dos.
export function AbrirTurnoPrompt({ rol = 'jefe_zona', onAbierto }: { rol?: RolCaja; onAbierto: () => Promise<void> }) {
  const [responsable, setResponsable] = useState('')
  const [baseInicial, setBaseInicial] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    const base = Number(baseInicial)
    if (!responsable.trim()) {
      setError('El responsable es obligatorio')
      return
    }
    if (!Number.isFinite(base) || base < 0) {
      setError('La base inicial no puede ser negativa')
      return
    }
    setSaving(true)
    try {
      await abrirTurno({ rol, responsable: responsable.trim(), baseInicial: Math.round(base) })
      await onAbierto()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo abrir el turno')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-warning-50 text-warning-600">
          <Lock size={20} strokeWidth={2} />
        </span>
        <div>
          <h2 className="text-base font-semibold text-neutral-900">No hay turno abierto</h2>
          <p className="text-xs text-neutral-500">
            Ábrelo para empezar — caja y asistencia quedan a cargo de quien lo abra hasta que se cierre o se transfiera.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-neutral-700">Responsable</span>
          <input
            autoFocus
            value={responsable}
            onChange={(e) => setResponsable(e.target.value)}
            placeholder="Nombre de quien abre el turno"
            className="rounded-lg border border-neutral-300 px-3 py-3 text-base outline-none transition-colors focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
          />
        </label>

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-neutral-700">Base inicial</span>
          <CurrencyInput size="sm" prefix="$" value={baseInicial} onChange={setBaseInicial} />
        </label>

        {error ? <p className="text-xs text-danger-600">{error}</p> : null}

        <button
          type="submit"
          disabled={saving}
          className="flex items-center justify-center gap-2 rounded-lg bg-primary-600 py-3 text-sm font-semibold text-white shadow-nav-active transition-colors hover:bg-primary-700 disabled:opacity-60"
        >
          {saving ? 'Abriendo…' : 'Abrir turno'}
        </button>
      </form>
    </Card>
  )
}

export function TurnoResponsableBanner({
  turno,
  onTransferido,
  children,
}: {
  turno: TurnoCaja
  onTransferido: (turno: TurnoCaja) => void
  children?: ReactNode
}) {
  const [transfiriendo, setTransfiriendo] = useState(false)
  const [nuevoResponsable, setNuevoResponsable] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [historial, setHistorial] = useState<TraspasoTurno[] | null>(null)
  const [cargandoHistorial, setCargandoHistorial] = useState(false)

  const fueTransferido = turno.responsableActual !== turno.responsable

  async function handleTransferir(event: FormEvent) {
    event.preventDefault()
    setError(null)
    if (!nuevoResponsable.trim()) {
      setError('Indica a quién le pasas la responsabilidad')
      return
    }
    setSaving(true)
    try {
      const actualizado = await transferirResponsable(turno.id, turno.responsableActual, nuevoResponsable.trim())
      onTransferido(actualizado)
      setTransfiriendo(false)
      setNuevoResponsable('')
      setHistorial(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo transferir la responsabilidad')
    } finally {
      setSaving(false)
    }
  }

  async function toggleHistorial() {
    if (historial !== null) {
      setHistorial(null)
      return
    }
    setCargandoHistorial(true)
    try {
      setHistorial(await fetchTraspasos(turno.id))
    } catch {
      setHistorial([])
    } finally {
      setCargandoHistorial(false)
    }
  }

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-success-50 text-success-600">
            <LockOpen size={20} strokeWidth={2} />
          </span>
          <div>
            <h2 className="text-base font-semibold text-neutral-900">Turno abierto</h2>
            <p className="text-xs text-neutral-500">Abierto por: {turno.responsable}</p>
            {fueTransferido ? (
              <p className="text-xs font-medium text-primary-700">A cargo ahora: {turno.responsableActual}</p>
            ) : null}
          </div>
        </div>
        <span className="inline-flex shrink-0 rounded-full bg-success-50 px-2.5 py-1 text-xs font-medium text-success-700">
          En curso
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg bg-neutral-50 p-3">
          <p className="text-xs text-neutral-500">Apertura</p>
          <p className="text-sm font-semibold text-neutral-900">{formatFecha(turno.abiertoEn)}</p>
        </div>
        <div className="rounded-lg bg-neutral-50 p-3">
          <p className="text-xs text-neutral-500">Base inicial</p>
          <p className="text-sm font-semibold text-neutral-900">{COP.format(turno.baseInicial)}</p>
        </div>
      </div>

      {transfiriendo ? (
        <form onSubmit={handleTransferir} className="flex flex-col gap-2 rounded-lg border border-primary-100 bg-primary-50/40 p-3">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-neutral-700">Transferir responsabilidad a</span>
            <input
              autoFocus
              value={nuevoResponsable}
              onChange={(e) => setNuevoResponsable(e.target.value)}
              placeholder="Nombre de quien queda a cargo"
              className="rounded-lg border border-neutral-300 px-3 py-2.5 text-sm outline-none transition-colors focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
            />
          </label>
          {error ? <p className="text-xs text-danger-600">{error}</p> : null}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 rounded-lg bg-primary-600 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-700 disabled:opacity-60"
            >
              {saving ? 'Transfiriendo…' : 'Confirmar traspaso'}
            </button>
            <button
              type="button"
              onClick={() => {
                setTransfiriendo(false)
                setError(null)
              }}
              className="flex items-center justify-center rounded-lg border border-neutral-200 px-3 text-neutral-500 transition-colors hover:bg-neutral-100"
            >
              <X size={16} />
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setTransfiriendo(true)}
          className="flex items-center justify-center gap-2 rounded-lg border border-neutral-200 py-2.5 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
        >
          <ArrowLeftRight size={15} />
          Transferir responsabilidad
        </button>
      )}

      <button
        type="button"
        onClick={toggleHistorial}
        className="flex items-center gap-1.5 self-start text-xs text-neutral-400 transition-colors hover:text-neutral-600"
      >
        <History size={13} />
        {cargandoHistorial ? 'Cargando…' : historial !== null ? 'Ocultar historial de traspasos' : 'Ver historial de traspasos'}
      </button>

      {historial !== null && historial.length > 0 ? (
        <ul className="flex flex-col gap-1 border-t border-neutral-100 pt-2 text-xs text-neutral-500">
          {historial.map((t) => (
            <li key={t.id}>
              {t.de} → {t.a} · {formatFecha(t.hechoEn)}
            </li>
          ))}
        </ul>
      ) : null}
      {historial !== null && historial.length === 0 ? (
        <p className="border-t border-neutral-100 pt-2 text-xs text-neutral-400">Sin traspasos en este turno.</p>
      ) : null}

      {children}
    </Card>
  )
}
