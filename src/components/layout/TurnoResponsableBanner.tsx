import { useState, type FormEvent, type ReactNode } from 'react'
import { LockOpen, Lock, ArrowLeftRight, History, X, UserCheck } from 'lucide-react'
import { abrirTurno, aceptarTraspaso, cancelarTraspaso, fetchTraspasos, solicitarTraspaso } from '../../data/turnos'
import type { RolCaja, TurnoCaja, TraspasoTurno } from '../../schemas/turnoCaja'
import { usePersonalElegible, nombreDe } from '../../lib/personalElegible'
import { Card } from './Card'
import { CustomSelect } from './CustomSelect'
import { CurrencyInput } from './CurrencyInput'
import { toast } from '../../lib/toast'

const COP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })

function formatFecha(iso: string | undefined) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })
}

// Compartido entre /jefe-zona/caja y /jefe-zona/asistencia: un solo turno de jefe_zona es la
// fuente de "quién es responsable ahora" para las dos pantallas — abrirlo desde cualquiera de
// las dos habilita ambas, y transferir la responsabilidad se refleja igual en las dos.
//
// El responsable ya NO se elige (0072): siempre es la cuenta con la que se inició sesión — la RPC
// `abrir_turno` lo deriva de auth.uid() en el servidor, así que ni hay dropdown que mostrar acá.
// `miNombre` es solo para mostrar "vas a abrir como...", no viaja al servidor.
export function AbrirTurnoPrompt({
  rol = 'jefe_zona',
  miNombre,
  onAbierto,
}: {
  rol?: RolCaja
  miNombre: string
  onAbierto: () => Promise<void>
}) {
  const [baseInicial, setBaseInicial] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    const base = Number(baseInicial)
    if (!Number.isFinite(base) || base < 0) {
      setError('La base inicial no puede ser negativa')
      return
    }
    setSaving(true)
    try {
      await abrirTurno({ rol, baseInicial: Math.round(base) })
      await onAbierto()
      toast.exito('Turno abierto')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo abrir el turno')
      toast.desdeError(err, 'No se pudo abrir el turno')
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
            Vas a abrirlo como <span className="font-medium text-neutral-700">{miNombre}</span> — queda a tu cargo
            hasta que se cierre o lo transfieras.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
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
  miPersonaId,
  onTransferido,
  onSolicitarTraspaso,
  avisoTraspaso,
  children,
}: {
  turno: TurnoCaja
  // Cuenta con la sesión abierta (0072) — decide qué botones se muestran: solo quien está a
  // cargo puede iniciar un traspaso, y solo la cuenta destino puede aceptar/rechazar el pendiente.
  miPersonaId: string
  onTransferido: (turno: TurnoCaja) => void
  /** Turno de jefe de zona (0068): el traspaso va por `solicitar_traspaso_turno`, con conteo de
   *  inventario si el turno lo tiene a cargo. Quien lo pasa decide el flujo (Caja). Sin esto, en
   *  un turno de jefe de zona el banner no ofrece transferir y manda a hacerlo desde Caja. */
  onSolicitarTraspaso?: (destino: { id: string; nombre: string }) => Promise<void>
  avisoTraspaso?: string
  children?: ReactNode
}) {
  const traspasoDesdeCaja = turno.rol === 'jefe_zona' && !onSolicitarTraspaso
  const soyResponsable = turno.responsableActualPersonaId === miPersonaId
  const traspasoPendiente = Boolean(turno.traspasoPendienteAPersonaId)
  const traspasoPendienteParaMi = turno.traspasoPendienteAPersonaId === miPersonaId
  const [transfiriendo, setTransfiriendo] = useState(false)
  const [nuevoPersonaId, setNuevoPersonaId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [historial, setHistorial] = useState<TraspasoTurno[] | null>(null)
  const [cargandoHistorial, setCargandoHistorial] = useState(false)
  const { elegibles, cargando } = usePersonalElegible(turno.rol)

  const fueTransferido = turno.responsableActual !== turno.responsable
  // Quien ya está a cargo no se ofrece como destino del traspaso.
  const destinos = elegibles.filter((p) => p.id !== turno.responsableActualPersonaId)

  async function handleTransferir(event: FormEvent) {
    event.preventDefault()
    setError(null)
    const persona = destinos.find((p) => p.id === nuevoPersonaId)
    if (!persona) {
      setError('Indica a quién le pasas la responsabilidad')
      return
    }
    setSaving(true)
    if (onSolicitarTraspaso) {
      try {
        await onSolicitarTraspaso({ id: persona.id, nombre: nombreDe(persona) })
        setTransfiriendo(false)
        setNuevoPersonaId('')
        setHistorial(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'No se pudo transferir la responsabilidad')
        toast.desdeError(err, 'No se pudo transferir la responsabilidad')
      } finally {
        setSaving(false)
      }
      return
    }
    try {
      const actualizado = await solicitarTraspaso(turno.id, persona.id)
      onTransferido(actualizado)
      setTransfiriendo(false)
      setNuevoPersonaId('')
      setHistorial(null)
      toast.exito(`Traspaso solicitado a ${nombreDe(persona)} — queda pendiente hasta que inicie sesión y lo acepte.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo solicitar el traspaso')
      toast.desdeError(err, 'No se pudo solicitar el traspaso')
    } finally {
      setSaving(false)
    }
  }

  async function handleAceptar() {
    setSaving(true)
    try {
      const actualizado = await aceptarTraspaso(turno.id)
      onTransferido(actualizado)
      toast.exito('Aceptaste la responsabilidad del turno')
    } catch (err) {
      toast.desdeError(err, 'No se pudo aceptar el traspaso')
    } finally {
      setSaving(false)
    }
  }

  async function handleCancelar() {
    setSaving(true)
    try {
      const actualizado = await cancelarTraspaso(turno.id)
      onTransferido(actualizado)
      toast.exito('Traspaso cancelado')
    } catch (err) {
      toast.desdeError(err, 'No se pudo cancelar el traspaso')
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

      {traspasoPendienteParaMi ? (
        // Candado de identidad (0072): solo la cuenta destino, con su propia sesión, puede
        // aceptar — nadie puede tomar la responsabilidad en nombre de otra persona.
        <div className="flex flex-col gap-2 rounded-lg border border-primary-200 bg-primary-50 p-3">
          <p className="flex items-center gap-2 text-sm font-medium text-primary-800">
            <UserCheck size={16} className="shrink-0" />
            {turno.responsableActual} te transfirió el turno
          </p>
          <p className="text-xs text-primary-700">Acéptalo para quedar a cargo — hasta entonces sigue siendo de {turno.responsableActual}.</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleAceptar}
              disabled={saving}
              className="flex-1 rounded-lg bg-primary-600 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-700 disabled:opacity-60"
            >
              {saving ? 'Aceptando…' : 'Aceptar responsabilidad'}
            </button>
            <button
              type="button"
              onClick={handleCancelar}
              disabled={saving}
              className="rounded-lg border border-neutral-200 px-3 text-sm text-neutral-500 transition-colors hover:bg-neutral-100"
            >
              Rechazar
            </button>
          </div>
        </div>
      ) : traspasoPendiente ? (
        <div className="flex flex-col gap-2 rounded-lg border border-warning-600/25 bg-warning-50 p-3">
          <p className="text-xs text-warning-700">
            Traspaso pendiente hacia <span className="font-medium">{turno.traspasoPendienteANombre}</span> — sigue a
            tu nombre hasta que esa cuenta inicie sesión y lo acepte.
          </p>
          {soyResponsable ? (
            <button
              type="button"
              onClick={handleCancelar}
              disabled={saving}
              className="self-start rounded-lg border border-neutral-200 px-3 py-1.5 text-xs text-neutral-600 transition-colors hover:bg-neutral-100"
            >
              Cancelar traspaso
            </button>
          ) : null}
        </div>
      ) : transfiriendo ? (
        <form onSubmit={handleTransferir} className="flex flex-col gap-2 rounded-lg border border-primary-100 bg-primary-50/40 p-3">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-neutral-700">Transferir responsabilidad a</span>
            <CustomSelect
              size="sm"
              value={nuevoPersonaId}
              onChange={setNuevoPersonaId}
              options={destinos.map((p) => ({ value: p.id, label: nombreDe(p) }))}
              placeholder={cargando ? 'Cargando…' : 'Selecciona quién queda a cargo'}
              disabled={cargando || destinos.length === 0}
              emptyLabel="No hay otra cuenta habilitada para esta caja"
            />
          </label>
          <p className="text-xs text-neutral-500">
            Queda pendiente hasta que esa cuenta inicie sesión y acepte — no cambia de responsable todavía.
          </p>
          {avisoTraspaso ? <p className="text-xs text-primary-800">{avisoTraspaso}</p> : null}
          {error ? <p className="text-xs text-danger-600">{error}</p> : null}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 rounded-lg bg-primary-600 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-700 disabled:opacity-60"
            >
              {saving ? 'Solicitando…' : avisoTraspaso ? 'Contar y solicitar traspaso' : 'Solicitar traspaso'}
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
      ) : !soyResponsable ? (
        <p className="rounded-lg bg-neutral-50 px-3 py-2.5 text-xs text-neutral-500">
          Solo {turno.responsableActual} puede transferir este turno.
        </p>
      ) : traspasoDesdeCaja ? (
        <p className="flex items-center gap-2 rounded-lg bg-neutral-50 px-3 py-2.5 text-xs text-neutral-500">
          <ArrowLeftRight size={14} className="shrink-0" />
          Para transferir la responsabilidad ve a Caja — el traspaso incluye el conteo de inventario.
        </p>
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
