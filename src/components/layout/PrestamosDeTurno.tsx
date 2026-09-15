import { useMemo, useRef, useState, type FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { HandCoins, Plus, X } from 'lucide-react'
import {
  fetchDeudaPendiente,
  fetchPersonasDeudoras,
  registrarAbono,
  registrarPrestamo,
  type DeudaPersonal,
} from '../../data/deudasPersonal'
import { abonoInputSchema, prestamoInputSchema, type Deudor, type MetodoAbono } from '../../schemas/deudaPersonal'
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
  /** Préstamos y abonos en efectivo de esta caja (fetchPrestamosDeTurno). */
  prestamos: DeudaPersonal[]
  onRegistrado: (movimiento: DeudaPersonal) => void
  /** 'sm' = escritorio (jefe de zona) · 'md' = mobile-first. Ver CLAUDE.md §escalas. */
  size?: 'sm' | 'md'
}

// Deudas del personal que mueven efectivo de la caja del turno (0065 → 0070):
//   · Préstamo: sale del cajón AHORA (se resta del arqueo) y queda como deuda.
//   · Abono: la persona paga en efectivo (entra al cajón, suma al arqueo) o por fuera
//     (transferencia, nómina — no toca caja). Nunca deja saldo a favor.
// A lavadores, jefes de patio y gerencia. Queda a nombre del responsable del turno.
export function PrestamosDeTurno({ turno, lavadores, prestamos, onRegistrado, size = 'sm' }: PrestamosDeTurnoProps) {
  const [modo, setModo] = useState<'prestamo' | 'abono' | null>(null)
  const [deudorKey, setDeudorKey] = useState('')
  const [monto, setMonto] = useState('')
  const [metodo, setMetodo] = useState<MetodoAbono>('efectivo')
  const [motivo, setMotivo] = useState('')
  const [errores, setErrores] = useState<Record<string, string>>({})
  const [guardando, setGuardando] = useState(false)
  const enVueloRef = useRef(false)

  const personasQuery = useQuery({ queryKey: ['perfiles', 'deudores'], queryFn: fetchPersonasDeudoras })
  const personas = useMemo(() => personasQuery.data ?? [], [personasQuery.data])

  const deudor: Deudor | undefined = deudorKey
    ? { tipo: deudorKey.startsWith('l:') ? 'lavador' : 'persona', id: deudorKey.slice(2) }
    : undefined
  const saldoQuery = useQuery({
    queryKey: ['deudas', 'saldo', deudorKey],
    queryFn: () => fetchDeudaPendiente(deudor as Deudor),
    enabled: Boolean(deudor),
  })

  const opciones = useMemo(
    () => [
      ...lavadores.filter((l) => l.activo).map((l) => ({ value: `l:${l.id}`, label: `${l.nombre} · lavador` })),
      ...personas.map((p) => ({
        value: `p:${p.id}`,
        label: `${p.nombre?.trim() || 'Sin nombre'} · ${p.roles.includes('admin') ? 'gerencia' : 'jefe de patio'}`,
      })),
    ],
    [lavadores, personas],
  )

  const nombreDeudor = (m: DeudaPersonal) =>
    m.lavadorId
      ? (lavadores.find((l) => l.id === m.lavadorId)?.nombre ?? '—')
      : (personas.find((p) => p.id === m.personaId)?.nombre ?? '—')

  const activos = prestamos.filter((p) => p.estado === 'activo')
  const salio = activos.filter((p) => p.tipo === 'prestamo').reduce((s, p) => s + p.monto, 0)
  const entro = activos.filter((p) => p.tipo === 'abono').reduce((s, p) => s - p.monto, 0)

  const inputClass =
    size === 'sm'
      ? 'rounded-lg border border-neutral-300 px-3 py-2.5 text-sm outline-none transition-colors focus:border-primary-500 focus:ring-1 focus:ring-primary-500'
      : 'rounded-lg border border-neutral-300 px-3 py-3 text-base outline-none transition-colors focus:border-primary-500 focus:ring-1 focus:ring-primary-500'

  function cerrar() {
    setModo(null)
    setDeudorKey('')
    setMonto('')
    setMetodo('efectivo')
    setMotivo('')
    setErrores({})
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (enVueloRef.current || !modo) return

    const base = { deudor: deudor ?? { tipo: 'lavador' as const, id: '' }, monto: Number(monto || 0), motivo: motivo.trim() || undefined }
    const parsed = modo === 'prestamo' ? prestamoInputSchema.safeParse(base) : abonoInputSchema.safeParse({ ...base, metodo })
    if (!parsed.success) {
      const mapa: Record<string, string> = {}
      for (const issue of parsed.error.issues) {
        const campo = String(issue.path[0] ?? 'general')
        if (!mapa[campo]) mapa[campo] = issue.message
      }
      setErrores(mapa)
      return
    }

    enVueloRef.current = true
    setGuardando(true)
    try {
      const creado =
        modo === 'prestamo'
          ? await registrarPrestamo(prestamoInputSchema.parse(base))
          : await registrarAbono(abonoInputSchema.parse({ ...base, metodo }))
      // Un abono por fuera no toca esta caja: no se lista acá.
      if (creado.turnoId) onRegistrado(creado)
      toast.exito(modo === 'prestamo' ? 'Préstamo registrado' : 'Abono registrado')
      cerrar()
    } catch (error) {
      setErrores({ general: error instanceof Error ? error.message : 'No se pudo registrar' })
      toast.desdeError(error, 'No se pudo registrar')
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
            <h2 className="text-sm font-semibold text-neutral-900">Préstamos y abonos del personal</h2>
            <p className="text-xs text-neutral-500">Lavadores, jefes de patio y gerencia</p>
          </div>
        </div>
        <div className="text-right text-xs text-neutral-500">
          <p>
            Salió <span className="font-mono font-semibold text-warning-700">{COP.format(salio)}</span>
          </p>
          {entro > 0 ? (
            <p>
              Entró <span className="font-mono font-semibold text-success-700">{COP.format(entro)}</span>
            </p>
          ) : null}
        </div>
      </div>

      {prestamos.length > 0 ? (
        <ul className="flex flex-col gap-1.5">
          {prestamos.map((p) => (
            <li
              key={p.id}
              className={`flex items-center justify-between gap-3 rounded-lg bg-neutral-50 px-3 py-2.5 ${p.estado === 'anulado' ? 'opacity-60' : ''}`}
            >
              <div className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-medium text-neutral-800">
                  {p.tipo === 'abono' ? 'Abono · ' : 'Préstamo · '}
                  {nombreDeudor(p)}
                  {p.estado === 'anulado' ? <span className="text-danger-600"> · anulado</span> : null}
                </span>
                <span className="truncate text-xs text-neutral-500">
                  {p.motivo ?? 'Sin motivo'} · {p.registradoPor} · {formatHora(p.creadoEn)}
                </span>
              </div>
              <span
                className={`shrink-0 font-mono text-sm font-semibold ${p.tipo === 'abono' ? 'text-success-700' : 'text-neutral-800'}`}
              >
                {p.tipo === 'abono' ? `+${COP.format(-p.monto)}` : `−${COP.format(p.monto)}`}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {modo ? (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 border-t border-neutral-100 pt-4">
          <p className="text-sm font-semibold text-neutral-900">{modo === 'prestamo' ? 'Nuevo préstamo' : 'Nuevo abono'}</p>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-neutral-700">Persona</span>
            <CustomSelect
              size={size}
              value={deudorKey}
              onChange={setDeudorKey}
              placeholder={personasQuery.isPending ? 'Cargando…' : 'Selecciona a quién'}
              options={opciones}
            />
            {deudor ? (
              <span className="text-xs text-neutral-500">
                Debe hoy:{' '}
                <span className="font-semibold text-neutral-800">
                  {saldoQuery.data === undefined ? '…' : COP.format(saldoQuery.data)}
                </span>
              </span>
            ) : null}
            {errores.deudor ? <span className="text-xs text-danger-600">{errores.deudor}</span> : null}
          </label>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-neutral-700">Monto</span>
            <CurrencyInput value={monto} onChange={setMonto} size={size} />
            {errores.monto ? <span className="text-xs text-danger-600">{errores.monto}</span> : null}
          </label>

          {modo === 'abono' ? (
            <div className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-neutral-700">Cómo paga</span>
              <div className="grid grid-cols-2 gap-1 rounded-lg bg-neutral-100 p-1">
                {(
                  [
                    ['efectivo', 'Efectivo a la caja'],
                    ['fuera', 'Por fuera'],
                  ] as const
                ).map(([valor, label]) => (
                  <button
                    key={valor}
                    type="button"
                    onClick={() => setMetodo(valor)}
                    className={`rounded-md px-3 py-2.5 text-sm font-medium transition-colors ${
                      metodo === valor ? 'bg-white text-neutral-900 shadow-card' : 'text-neutral-500 hover:text-neutral-700'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <span className="text-xs text-neutral-500">
                {metodo === 'efectivo'
                  ? 'Entra al cajón de este turno y suma al arqueo.'
                  : 'Transferencia, nómina u otro — no toca la caja.'}
              </span>
            </div>
          ) : null}

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-neutral-700">
              {modo === 'abono' && metodo === 'fuera' ? 'Cómo se pagó' : 'Motivo'}{' '}
              {modo === 'abono' && metodo === 'fuera' ? (
                <span className="text-danger-600">*</span>
              ) : (
                <span className="font-normal text-neutral-400">(opcional)</span>
              )}
            </span>
            <input
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder={
                modo === 'prestamo'
                  ? 'Ej. le urgía plata para el transporte'
                  : metodo === 'fuera'
                    ? 'Ej. transferencia Nequi 15/09'
                    : 'Ej. abono semanal'
              }
              className={inputClass}
            />
            {errores.motivo ? <span className="text-xs text-danger-600">{errores.motivo}</span> : null}
          </label>

          <p className="text-xs text-neutral-500">
            Queda a nombre de <span className="font-medium text-neutral-700">{turno.responsableActual}</span>.
          </p>

          {errores.general ? (
            <p className="rounded-lg bg-danger-50 px-3 py-2.5 text-sm text-danger-700">{errores.general}</p>
          ) : null}

          <div className="flex justify-end gap-2 border-t border-neutral-100 pt-4">
            <button
              type="button"
              onClick={cerrar}
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
              {guardando ? 'Guardando…' : modo === 'prestamo' ? 'Registrar préstamo' : 'Registrar abono'}
            </button>
          </div>
        </form>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setModo('prestamo')}
            className="flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-neutral-300 px-3 py-2.5 text-sm font-medium text-neutral-600 transition-colors hover:border-primary-400 hover:bg-primary-50/40 hover:text-primary-700"
          >
            <Plus size={16} />
            Préstamo
          </button>
          <button
            type="button"
            onClick={() => setModo('abono')}
            className="flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-neutral-300 px-3 py-2.5 text-sm font-medium text-neutral-600 transition-colors hover:border-success-600/40 hover:bg-success-50/40 hover:text-success-700"
          >
            <Plus size={16} />
            Abono
          </button>
        </div>
      )}
    </Card>
  )
}
