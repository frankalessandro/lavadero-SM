import { useMemo, useRef, useState, type FormEvent } from 'react'
import { HandCoins, Plus, X } from 'lucide-react'
import { registrarPrestamo, type DeudaLavador } from '../../data/deudasLavador'
import { prestamoLavadorInputSchema } from '../../schemas/deudaLavador'
import type { Lavador } from '../../schemas/lavador'
import type { TurnoCaja } from '../../schemas/turnoCaja'
import { Card } from './Card'
import { CustomSelect } from './CustomSelect'
import { CurrencyInput } from './CurrencyInput'
import { toast } from '../../lib/toast'

const COP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })

function formatHora(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })
}

interface PrestamosDeTurnoProps {
  turno: TurnoCaja
  lavadores: Lavador[]
  prestamos: DeudaLavador[]
  onRegistrado: (prestamo: DeudaLavador) => void
  /** 'sm' = escritorio (jefe de zona) · 'md' = mobile-first. Ver CLAUDE.md §escalas. */
  size?: 'sm' | 'md'
}

// Préstamo en efectivo a un lavador desde la caja de este turno (0065): sale del cajón AHORA
// (mismo mecanismo que GastosDeTurno — turno_id + tipo='prestamo' es lo que
// calcularValorEsperado resta del arqueo) y además queda como deuda a descontar en su próxima
// liquidación (real, diaria o semanal). No confundir con "colilla del día": eso es informativo,
// esto sí mueve plata de verdad.
export function PrestamosDeTurno({ turno, lavadores, prestamos, onRegistrado, size = 'sm' }: PrestamosDeTurnoProps) {
  const [abierto, setAbierto] = useState(false)
  const [lavadorId, setLavadorId] = useState('')
  const [monto, setMonto] = useState('')
  const [motivo, setMotivo] = useState('')
  const [registradoPor, setRegistradoPor] = useState(turno.responsableActual ?? turno.responsable)
  const [errores, setErrores] = useState<Record<string, string>>({})
  const [guardando, setGuardando] = useState(false)
  const enVueloRef = useRef(false)

  const activos = useMemo(() => lavadores.filter((l) => l.activo), [lavadores])
  const total = useMemo(() => prestamos.reduce((suma, p) => suma + p.monto, 0), [prestamos])
  const lavadorNombre = (id: string) => lavadores.find((l) => l.id === id)?.nombre ?? '—'

  const inputClass =
    size === 'sm'
      ? 'rounded-lg border border-neutral-300 px-3 py-2.5 text-sm outline-none transition-colors focus:border-primary-500 focus:ring-1 focus:ring-primary-500'
      : 'rounded-lg border border-neutral-300 px-3 py-3 text-base outline-none transition-colors focus:border-primary-500 focus:ring-1 focus:ring-primary-500'

  function resetForm() {
    setLavadorId('')
    setMonto('')
    setMotivo('')
    setRegistradoPor(turno.responsableActual ?? turno.responsable)
    setErrores({})
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (enVueloRef.current) return

    const parsed = prestamoLavadorInputSchema.safeParse({
      lavadorId,
      monto: Number(monto || 0),
      motivo: motivo || undefined,
      turnoId: turno.id,
      registradoPor,
    })
    if (!parsed.success) {
      const mapa: Record<string, string> = {}
      for (const issue of parsed.error.issues) {
        const campo = issue.path[0]
        if (typeof campo === 'string' && !mapa[campo]) mapa[campo] = issue.message
      }
      setErrores(mapa)
      return
    }

    enVueloRef.current = true
    setGuardando(true)
    try {
      const creado = await registrarPrestamo(parsed.data)
      onRegistrado(creado)
      resetForm()
      setAbierto(false)
      toast.exito('Préstamo registrado')
    } catch (error) {
      setErrores({ general: error instanceof Error ? error.message : 'No se pudo registrar el préstamo' })
      toast.desdeError(error, 'No se pudo registrar el préstamo')
    } finally {
      enVueloRef.current = false
      setGuardando(false)
    }
  }

  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-warning-50 text-warning-700">
            <HandCoins size={18} />
          </span>
          <div className="flex flex-col">
            <h2 className="text-sm font-semibold text-neutral-900">Préstamos a lavadores</h2>
            <p className="text-xs text-neutral-500">Sale del cajón — se descuenta de su liquidación</p>
          </div>
        </div>
        <div className="text-right">
          <p className="font-mono text-lg font-bold text-warning-700">{COP.format(total)}</p>
          <p className="text-xs text-neutral-500">
            {prestamos.length} {prestamos.length === 1 ? 'préstamo' : 'préstamos'}
          </p>
        </div>
      </div>

      {prestamos.length > 0 ? (
        <ul className="flex flex-col gap-1.5">
          {prestamos.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 rounded-lg bg-neutral-50 px-3 py-2.5">
              <div className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-medium text-neutral-800">{lavadorNombre(p.lavadorId)}</span>
                <span className="truncate text-xs text-neutral-500">
                  {p.motivo ?? 'Sin motivo'} · {p.registradoPor} · {formatHora(p.creadoEn)}
                </span>
              </div>
              <span className="shrink-0 font-mono text-sm font-semibold text-neutral-800">−{COP.format(p.monto)}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {abierto ? (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 border-t border-neutral-100 pt-4">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-neutral-700">Lavador</span>
            <CustomSelect
              size={size}
              value={lavadorId}
              onChange={setLavadorId}
              placeholder="Selecciona un lavador"
              options={activos.map((l) => ({ value: l.id, label: l.nombre }))}
            />
            {errores.lavadorId ? <span className="text-xs text-danger-600">{errores.lavadorId}</span> : null}
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-neutral-700">Monto</span>
              <CurrencyInput value={monto} onChange={setMonto} size={size} />
              {errores.monto ? <span className="text-xs text-danger-600">{errores.monto}</span> : null}
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-neutral-700">Quién presta</span>
              <input value={registradoPor} onChange={(e) => setRegistradoPor(e.target.value)} className={inputClass} />
              {errores.registradoPor ? <span className="text-xs text-danger-600">{errores.registradoPor}</span> : null}
            </label>
          </div>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-neutral-700">
              Motivo <span className="font-normal text-neutral-400">(opcional)</span>
            </span>
            <input
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ej. le urgía plata para el transporte"
              className={inputClass}
            />
          </label>

          {errores.general ? (
            <p className="rounded-lg bg-danger-50 px-3 py-2.5 text-sm text-danger-700">{errores.general}</p>
          ) : null}

          <div className="flex justify-end gap-2 border-t border-neutral-100 pt-4">
            <button
              type="button"
              onClick={() => {
                resetForm()
                setAbierto(false)
              }}
              className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-neutral-600 transition-colors hover:bg-neutral-100"
            >
              <X size={16} />
              Cancelar
            </button>
            <button
              type="submit"
              disabled={guardando}
              className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white shadow-nav-active transition-colors hover:bg-primary-700 disabled:opacity-60"
            >
              {guardando ? 'Guardando…' : 'Registrar préstamo'}
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setAbierto(true)}
          className="flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-neutral-300 px-3 py-2.5 text-sm font-medium text-neutral-600 transition-colors hover:border-primary-400 hover:bg-primary-50/40 hover:text-primary-700"
        >
          <Plus size={16} />
          Registrar préstamo
        </button>
      )}
    </Card>
  )
}
