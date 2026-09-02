import { useEffect, useState, type FormEvent } from 'react'
import { X } from 'lucide-react'
import { PagoLineas } from './PagoLineas'
import {
  borradorAPagos,
  nuevaLineaBorrador,
  pagoLineasCuadra,
  pagosABorrador,
  type PagoLineaBorrador,
} from '../../lib/pagoLineas'
import { corregirReparto, fetchPagosDeGrupo, fetchPagosDeOrden, type CorreccionTarget } from '../../data/pagos'
import type { MetodoPagoBase } from '../../schemas/orden'

const COP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })

// Corrige el REPARTO por método de un cobro ya registrado — el total no cambia, solo cómo se
// repartió. Sirve para cuadrar caja cuando un pago se anotó mal, incluso con el turno ya cerrado
// (regla 14: el turno no se toca, la corrección queda en el reporte de admin). Regla 13: las
// líneas viejas no se borran, quedan anuladas con motivo/quién/cuándo.
export function CorregirPagoModal({
  target,
  referencia,
  onClose,
  onCorregido,
}: {
  target: CorreccionTarget
  /** Texto para el encabezado, ej. "Orden #128" o "Carrito VTA-30 a VTA-32". */
  referencia: string
  onClose: () => void
  onCorregido: () => void | Promise<void>
}) {
  const [lineas, setLineas] = useState<PagoLineaBorrador[]>([nuevaLineaBorrador()])
  const [totalVigente, setTotalVigente] = useState<number | null>(null)
  const [motivo, setMotivo] = useState('')
  const [corregidoPor, setCorregidoPor] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(true)
  const [saving, setSaving] = useState(false)

  // Dependemos de los ids primitivos, no del objeto `target`: los llamadores lo pasan como
  // literal nuevo en cada render (`target={{ ordenId: ... }}`), y algunos —el tablero de jefe de
  // zona— re-renderizan cada segundo por su reloj en vivo. Con `[target]` este efecto se re-
  // disparaba en cada tick y pisaba las líneas que el usuario estaba editando ("se vuelve al
  // valor original y no logro editarlo").
  const ordenId = 'ordenId' in target ? target.ordenId : null
  const ventaGrupoId = 'ventaGrupoId' in target ? target.ventaGrupoId : null

  useEffect(() => {
    let vivo = true
    ;(async () => {
      try {
        const pagos =
          ordenId != null
            ? await fetchPagosDeOrden(ordenId)
            : await fetchPagosDeGrupo(ventaGrupoId as string)
        if (!vivo) return
        setTotalVigente(pagos.reduce((s, p) => s + p.monto, 0))
        setLineas(
          pagosABorrador(
            pagos.map((p) => ({
              metodoPago: p.metodoPago as MetodoPagoBase,
              monto: p.monto,
              referenciaPago: p.referenciaPago,
            })),
          ),
        )
      } catch (err) {
        if (vivo) setError(err instanceof Error ? err.message : 'No se pudo cargar el pago')
      } finally {
        if (vivo) setCargando(false)
      }
    })()
    return () => {
      vivo = false
    }
  }, [ordenId, ventaGrupoId])

  const cuadra = totalVigente != null && pagoLineasCuadra(lineas, totalVigente)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (totalVigente == null || !cuadra) return
    if (motivo.trim().length < 3) {
      setError('El motivo de la corrección es obligatorio')
      return
    }
    if (!corregidoPor.trim()) {
      setError('Indica quién hace la corrección')
      return
    }
    setError(null)
    setSaving(true)
    try {
      await corregirReparto(target, borradorAPagos(lineas), motivo.trim(), corregidoPor.trim())
      await onCorregido()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo corregir el pago')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-neutral-900/40 p-0 backdrop-blur-[2px] sm:items-center sm:p-4">
      <div className="custom-scroll max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-6 shadow-card-hover sm:rounded-2xl sm:p-7">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h3 className="text-base font-semibold text-neutral-900">Corregir reparto del pago</h3>
            <p className="mt-0.5 text-xs text-neutral-500">{referencia}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex size-8 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-neutral-100"
          >
            <X size={18} />
          </button>
        </div>

        <p className="mb-4 text-xs text-neutral-500">
          Solo cambia cómo se repartió entre efectivo, transferencia y datáfono — el total cobrado no
          cambia. El registro anterior queda visible en auditoría con el motivo. Si el turno de ese cobro
          ya está cerrado, su arqueo no se recalcula; la corrección aparece en el reporte de correcciones.
        </p>

        {cargando ? (
          <p className="py-8 text-center text-sm text-neutral-400">Cargando pago…</p>
        ) : totalVigente == null ? (
          <p className="py-8 text-center text-sm text-danger-600">{error ?? 'No hay un cobro para corregir.'}</p>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            <div className="rounded-lg bg-primary-50 px-3 py-2.5 text-sm">
              <div className="flex items-center justify-between font-semibold text-primary-900">
                <span>Total cobrado (fijo)</span>
                <span>{COP.format(totalVigente)}</span>
              </div>
            </div>

            <PagoLineas lineas={lineas} onChange={setLineas} total={totalVigente} size="sm" totalLabel="Total" />

            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-neutral-700">Motivo de la corrección</span>
              <textarea
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                rows={2}
                placeholder="p. ej. Se anotó todo en efectivo pero $10.000 fueron por transferencia"
                className="resize-none rounded-lg border border-neutral-300 px-3 py-2.5 text-sm outline-none transition-colors focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
              />
            </label>

            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-neutral-700">Quién corrige</span>
              <input
                value={corregidoPor}
                onChange={(e) => setCorregidoPor(e.target.value)}
                placeholder="Nombre de quien hace la corrección"
                className="rounded-lg border border-neutral-300 px-3 py-2.5 text-sm outline-none transition-colors focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
              />
            </label>

            {error ? <p className="text-xs text-danger-600">{error}</p> : null}

            <div className="flex justify-end gap-2 border-t border-neutral-100 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg px-4 py-2 text-sm font-medium text-neutral-600 transition-colors hover:bg-neutral-100"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving || !cuadra || motivo.trim().length < 3 || !corregidoPor.trim()}
                className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white shadow-nav-active transition-colors hover:bg-primary-700 disabled:opacity-60"
              >
                {saving ? 'Guardando…' : 'Guardar corrección'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
