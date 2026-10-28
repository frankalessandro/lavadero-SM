import { useMemo, useRef, useState, type FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Banknote, HandCoins, Plus, Printer, X } from 'lucide-react'
import {
  fetchPersonasDeudoras,
  fetchSaldoDeuda,
  registrarPrestamo,
  type DeudaPersonal,
} from '../../data/deudasPersonal'
import { BOLSA_DEUDA_LABEL, prestamoInputSchema, type Deudor } from '../../schemas/deudaPersonal'
import type { Lavador } from '../../schemas/lavador'
import type { TurnoCaja } from '../../schemas/turnoCaja'
import { Card } from './Card'
import { ComprobantePrestamoModal, type ComprobantePrestamoData } from './ComprobantePrestamoModal'
import { CustomSelect } from './CustomSelect'
import { CurrencyInput } from './CurrencyInput'
import { AbonoDeudaModal } from '../deudas/AbonoDeudaModal'
import { TarjetasBolsa } from '../deudas/TarjetasBolsa'
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

// Deudas del personal que mueven efectivo de la caja del turno (0065 → 0070 → 0089):
//   · Préstamo: sale del cajón AHORA (se resta del arqueo) y queda como deuda de préstamos.
//   · Abono: a préstamos o a tienda (AbonoDeudaModal), en efectivo (entra al cajón, suma al
//     arqueo) o directo a gerencia (no toca caja). Nunca deja saldo a favor.
// A lavadores, jefes de patio y gerencia. Queda a nombre del responsable del turno.
export function PrestamosDeTurno({ turno, lavadores, prestamos, onRegistrado, size = 'sm' }: PrestamosDeTurnoProps) {
  const [prestando, setPrestando] = useState(false)
  const [abonando, setAbonando] = useState(false)
  const [deudorKey, setDeudorKey] = useState('')
  const [monto, setMonto] = useState('')
  const [motivo, setMotivo] = useState('')
  const [errores, setErrores] = useState<Record<string, string>>({})
  const [guardando, setGuardando] = useState(false)
  const [comprobante, setComprobante] = useState<ComprobantePrestamoData | null>(null)
  const enVueloRef = useRef(false)

  const personasQuery = useQuery({ queryKey: ['perfiles', 'deudores'], queryFn: fetchPersonasDeudoras })
  const personas = useMemo(() => personasQuery.data ?? [], [personasQuery.data])

  const deudor: Deudor | undefined = deudorKey
    ? { tipo: deudorKey.startsWith('l:') ? 'lavador' : 'persona', id: deudorKey.slice(2) }
    : undefined
  const saldoQuery = useQuery({
    queryKey: ['deudas', 'saldo', deudorKey],
    queryFn: () => fetchSaldoDeuda(deudor as Deudor),
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

  const rolDeudor = (m: DeudaPersonal) =>
    m.lavadorId
      ? 'lavador'
      : personas.find((p) => p.id === m.personaId)?.roles.includes('admin')
        ? 'gerencia'
        : 'jefe de patio'

  // El jefe de patio que entrega es quien está a cargo del turno AHORA (responsableActual).
  const datosComprobante = (m: DeudaPersonal): ComprobantePrestamoData => ({
    id: m.id,
    monto: m.monto,
    creadoEn: m.creadoEn,
    prestatarioNombre: nombreDeudor(m),
    prestatarioRol: rolDeudor(m),
    jefePatioNombre: turno.responsableActual,
    motivo: m.motivo,
  })

  const activos = prestamos.filter((p) => p.estado === 'activo')
  const salio = activos.filter((p) => p.tipo === 'prestamo').reduce((s, p) => s + p.monto, 0)
  const entro = activos.filter((p) => p.tipo === 'abono').reduce((s, p) => s - p.monto, 0)

  const inputClass =
    size === 'sm'
      ? 'rounded-lg border border-neutral-300 px-3 py-2.5 text-sm outline-none transition-colors focus:border-primary-500 focus:ring-1 focus:ring-primary-500'
      : 'rounded-lg border border-neutral-300 px-3 py-3 text-base outline-none transition-colors focus:border-primary-500 focus:ring-1 focus:ring-primary-500'

  function cerrarPrestamo() {
    setPrestando(false)
    setDeudorKey('')
    setMonto('')
    setMotivo('')
    setErrores({})
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (enVueloRef.current) return

    const base = { deudor: deudor ?? { tipo: 'lavador' as const, id: '' }, monto: Number(monto || 0), motivo: motivo.trim() || undefined }
    const parsed = prestamoInputSchema.safeParse(base)
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
      const creado = await registrarPrestamo(parsed.data)
      onRegistrado(creado)
      // El préstamo se firma: se abre el comprobante para imprimir con las dos firmas.
      setComprobante(datosComprobante(creado))
      toast.exito('Préstamo registrado')
      cerrarPrestamo()
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
            <p className="text-xs text-neutral-500">Préstamos de caja y abonos a préstamos o tienda</p>
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
                <span className="flex min-w-0 items-center gap-1.5 text-sm font-medium text-neutral-800">
                  <span
                    className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                      p.tipo === 'prestamo'
                        ? 'bg-warning-50 text-warning-700'
                        : p.bolsa === 'tienda'
                          ? 'bg-primary-50 text-primary-700'
                          : 'bg-success-50 text-success-700'
                    }`}
                  >
                    {p.tipo === 'prestamo' ? 'Préstamo' : `Abono ${BOLSA_DEUDA_LABEL[p.bolsa].toLowerCase()}`}
                  </span>
                  <span className="truncate">{nombreDeudor(p)}</span>
                  {p.estado === 'anulado' ? <span className="shrink-0 text-danger-600">· anulado</span> : null}
                </span>
                <span className="truncate text-xs text-neutral-500">
                  {p.motivo ?? 'Sin motivo'} · {p.registradoPor} · {formatHora(p.creadoEn)}
                </span>
              </div>
              {p.tipo === 'prestamo' && p.estado === 'activo' ? (
                <button
                  type="button"
                  onClick={() => setComprobante(datosComprobante(p))}
                  aria-label="Imprimir comprobante del préstamo"
                  className="flex size-8 shrink-0 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-neutral-200 hover:text-neutral-700"
                >
                  <Printer size={16} />
                </button>
              ) : null}
              <span
                className={`shrink-0 font-mono text-sm font-semibold ${p.tipo === 'abono' ? 'text-success-700' : 'text-neutral-800'}`}
              >
                {p.tipo === 'abono' ? `+${COP.format(-p.monto)}` : `−${COP.format(p.monto)}`}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {prestando ? (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 border-t border-neutral-100 pt-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-neutral-900">
            <Banknote size={16} className="text-warning-700" /> Nuevo préstamo
          </p>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-neutral-700">Persona</span>
            <CustomSelect
              size={size}
              value={deudorKey}
              onChange={setDeudorKey}
              placeholder={personasQuery.isPending ? 'Cargando…' : 'Selecciona a quién'}
              options={opciones}
            />
            {errores.deudor ? <span className="text-xs text-danger-600">{errores.deudor}</span> : null}
          </label>

          {deudor ? (
            <div className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-neutral-700">Ya debe</span>
              <TarjetasBolsa saldo={saldoQuery.data} />
            </div>
          ) : null}

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-neutral-700">Monto</span>
            <CurrencyInput value={monto} onChange={setMonto} size={size} />
            <span className="text-xs text-neutral-500">Sale del cajón ahora y se resta del arqueo.</span>
            {errores.monto ? <span className="text-xs text-danger-600">{errores.monto}</span> : null}
          </label>

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

          <p className="text-xs text-neutral-500">
            Queda a nombre de <span className="font-medium text-neutral-700">{turno.responsableActual}</span>.
          </p>

          {errores.general ? (
            <p className="rounded-lg bg-danger-50 px-3 py-2.5 text-sm text-danger-700">{errores.general}</p>
          ) : null}

          <div className="flex justify-end gap-2 border-t border-neutral-100 pt-4">
            <button
              type="button"
              onClick={cerrarPrestamo}
              className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-neutral-600 transition-colors hover:bg-neutral-100"
            >
              <X size={16} />
              Cancelar
            </button>
            <button
              type="submit"
              disabled={guardando}
              className="rounded-xl bg-primary-600 px-4 py-2 text-sm font-semibold text-white shadow-nav-active transition-colors hover:bg-primary-700 disabled:opacity-60"
            >
              {guardando ? 'Guardando…' : 'Registrar préstamo'}
            </button>
          </div>
        </form>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setPrestando(true)}
            className="flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-neutral-300 px-3 py-2.5 text-sm font-medium text-neutral-600 transition-colors hover:border-warning-600/40 hover:bg-warning-50/40 hover:text-warning-700"
          >
            <Plus size={16} />
            Préstamo
          </button>
          <button
            type="button"
            onClick={() => setAbonando(true)}
            className="flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-neutral-300 px-3 py-2.5 text-sm font-medium text-neutral-600 transition-colors hover:border-success-600/40 hover:bg-success-50/40 hover:text-success-700"
          >
            <Plus size={16} />
            Recibir abono
          </button>
        </div>
      )}

      {abonando ? (
        <AbonoDeudaModal
          opcionesDeudor={opciones}
          turnoAbierto
          responsable={turno.responsableActual}
          onClose={() => setAbonando(false)}
          // Un abono directo a gerencia no toca esta caja: no se lista acá.
          onRegistrado={(creado) => {
            if (creado.turnoId) onRegistrado(creado)
          }}
        />
      ) : null}
      {comprobante ? <ComprobantePrestamoModal data={comprobante} onClose={() => setComprobante(null)} /> : null}
    </Card>
  )
}
