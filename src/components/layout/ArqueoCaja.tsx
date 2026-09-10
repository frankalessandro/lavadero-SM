import { useState, type FormEvent } from 'react'
import { CheckCircle2, RotateCcw, Eye } from 'lucide-react'
import { cerrarTurno, desgloseEsperado, type DesgloseEsperado } from '../../data/turnos'
import type { TurnoCaja } from '../../schemas/turnoCaja'
import { PantallaTarea, BotonPrincipal } from './PantallaTarea'
import { CurrencyInput } from './CurrencyInput'
import { toast } from '../../lib/toast'

const COP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })

// Arqueo ciego de cierre (regla de negocio 15): primero se cuenta el efectivo físico, y solo
// después se revela lo que el sistema esperaba. Es la acción que efectivamente cierra el turno,
// por eso va de última en el checklist — y por eso `turnos_caja_cierre_requiere_conteo` (0048)
// la rechaza si todavía no hay conteo de inventario de cierre.
export function ArqueoCaja({
  turno,
  onVolver,
  onCerrado,
}: {
  turno: TurnoCaja
  onVolver: () => void
  onCerrado: (resultado: { diferencia: number }) => void | Promise<void>
}) {
  const [fase, setFase] = useState<'contando' | 'resultado'>('contando')
  const [conteoFisico, setConteoFisico] = useState('')
  const [valorEsperado, setValorEsperado] = useState<number | null>(null)
  const [desglose, setDesglose] = useState<DesgloseEsperado | null>(null)
  const [justificacion, setJustificacion] = useState('')
  const [cerradoPor, setCerradoPor] = useState(turno.responsableActual)
  const [recibidoPor, setRecibidoPor] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const conteoNum = Math.round(Number(conteoFisico) || 0)
  const diferencia = valorEsperado != null ? conteoNum - valorEsperado : 0
  const hayDiferencia = valorEsperado != null && diferencia !== 0

  async function handleRevelar(event: FormEvent) {
    event.preventDefault()
    setError(null)
    if (conteoFisico.trim() === '') {
      setError('Cuenta el efectivo antes de continuar')
      return
    }
    setLoading(true)
    try {
      const detalle = await desgloseEsperado(turno)
      setDesglose(detalle)
      setValorEsperado(detalle.total)
      setFase('resultado')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo calcular el valor esperado')
      toast.desdeError(err, 'No se pudo calcular el valor esperado')
    } finally {
      setLoading(false)
    }
  }

  async function handleCerrar(event: FormEvent) {
    event.preventDefault()
    setError(null)
    if (valorEsperado == null) return
    if (hayDiferencia && !justificacion.trim()) {
      setError('Hay una diferencia — la justificación es obligatoria')
      return
    }
    if (!cerradoPor.trim()) {
      setError('Indica quién cierra el turno')
      return
    }
    setLoading(true)
    try {
      await cerrarTurno(turno, conteoNum, cerradoPor.trim(), justificacion.trim() || undefined, recibidoPor.trim() || undefined)
      toast.exito('Turno cerrado')
      await onCerrado({ diferencia })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cerrar el turno')
      toast.desdeError(err, 'No se pudo cerrar el turno')
    } finally {
      setLoading(false)
    }
  }

  // ── Fase 1: contar el efectivo, sin ver nada del sistema ────────────────────────────────────
  if (fase === 'contando') {
    return (
      <form onSubmit={handleRevelar} className="contents">
        <PantallaTarea
          titulo="Arqueo de caja"
          subtitulo="Cuenta el efectivo antes de ver el esperado"
          onVolver={onVolver}
          pie={
            <>
              {error ? <p className="text-center text-xs text-danger-600">{error}</p> : null}
              <BotonPrincipal type="submit" disabled={loading}>
                <Eye size={16} />
                {loading ? 'Calculando…' : 'Ver diferencia'}
              </BotonPrincipal>
            </>
          }
        >
          <div className="flex flex-col gap-3 rounded-xl bg-white p-5 shadow-card">
            <p className="text-xs text-neutral-500">
              Cuenta todo el efectivo que hay en la caja ahora mismo. El sistema no te muestra cuánto debería haber
              hasta que registres tu conteo — así el arqueo es real y no un cuadre a la medida.
            </p>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-neutral-700">Efectivo contado</span>
              <CurrencyInput autoFocus size="md" prefix="$" value={conteoFisico} onChange={setConteoFisico} />
            </label>
          </div>
        </PantallaTarea>
      </form>
    )
  }

  // ── Fase 2: revelado + datos de cierre ───────────────────────────────────────────────────────
  return (
    <form onSubmit={handleCerrar} className="contents">
      <PantallaTarea
        titulo="Arqueo de caja"
        subtitulo={hayDiferencia ? 'Hay diferencia — justifícala para cerrar' : 'La caja cuadra'}
        onVolver={onVolver}
        pie={
          <>
            {error ? <p className="text-center text-xs text-danger-600">{error}</p> : null}
            <BotonPrincipal type="submit" disabled={loading}>
              <CheckCircle2 size={16} />
              {loading ? 'Cerrando…' : 'Cerrar turno'}
            </BotonPrincipal>
            <button
              type="button"
              onClick={() => {
                setFase('contando')
                setError(null)
              }}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg py-2.5 text-sm font-medium text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
            >
              <RotateCcw size={15} />
              Volver a contar
            </button>
          </>
        }
      >
        <div
          className={`flex flex-col gap-1 rounded-xl p-5 ${
            hayDiferencia ? 'bg-danger-50 text-danger-700' : 'bg-success-50 text-success-700'
          }`}
        >
          <div className="flex items-center justify-between text-sm">
            <span>Esperado</span>
            <span className="font-semibold">{COP.format(valorEsperado ?? 0)}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span>Contaste</span>
            <span className="font-semibold">{COP.format(conteoNum)}</span>
          </div>
          <div className="mt-1.5 flex items-center justify-between border-t border-current/20 pt-2">
            <span className="text-sm font-medium">{hayDiferencia ? (diferencia < 0 ? 'Faltan' : 'Sobran') : 'Diferencia'}</span>
            <span className="text-xl font-bold">{COP.format(Math.abs(diferencia))}</span>
          </div>
        </div>

        {desglose ? (
          <div className="flex flex-col gap-1.5 rounded-xl bg-white p-4 text-xs text-neutral-600 shadow-card">
            <p className="mb-0.5 font-medium text-neutral-500">Cómo se llega al esperado</p>
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

        <div className="flex flex-col gap-4 rounded-xl bg-white p-4 shadow-card">
          {hayDiferencia ? (
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-neutral-700">Justificación (obligatoria)</span>
              <textarea
                autoFocus
                value={justificacion}
                onChange={(e) => setJustificacion(e.target.value)}
                placeholder="Motivo de la diferencia"
                rows={2}
                className="rounded-lg border border-neutral-300 px-3 py-2.5 text-base outline-none transition-colors focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
              />
            </label>
          ) : null}

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-neutral-700">Quién cierra</span>
            <input
              value={cerradoPor}
              onChange={(e) => setCerradoPor(e.target.value)}
              placeholder="Nombre"
              className="rounded-lg border border-neutral-300 px-3 py-2.5 text-base outline-none transition-colors focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
            />
          </label>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-neutral-700">
              Recibido por <span className="font-normal text-neutral-400">(opcional)</span>
            </span>
            <input
              value={recibidoPor}
              onChange={(e) => setRecibidoPor(e.target.value)}
              placeholder="Nombre de quien recibe"
              className="rounded-lg border border-neutral-300 px-3 py-2.5 text-base outline-none transition-colors focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
            />
          </label>
        </div>
      </PantallaTarea>
    </form>
  )
}
