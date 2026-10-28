import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Shuffle } from 'lucide-react'
import { PagoLineas } from './PagoLineas'
import { Modal } from './Modal'
import { Button } from './Button'
import {
  borradorAPagos,
  nuevaLineaBorrador,
  pagoLineasCuadra,
  pagosABorrador,
  type PagoLineaBorrador,
} from '../../lib/pagoLineas'
import { corregirReparto, fetchPagosDeGrupo, fetchPagosDeOrden, type CorreccionTarget } from '../../data/pagos'
import type { MetodoPagoBase } from '../../schemas/orden'
import { toast } from '../../lib/toast'

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
  const enVueloRef = useRef(false)

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
        if (vivo) {
          setError(err instanceof Error ? err.message : 'No se pudo cargar el pago')
          toast.desdeError(err, 'No se pudo cargar el pago')
        }
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
    if (enVueloRef.current) return
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
    enVueloRef.current = true
    setSaving(true)
    try {
      await corregirReparto(target, borradorAPagos(lineas), motivo.trim(), corregidoPor.trim())
      await onCorregido()
      toast.exito('Reparto de pago corregido')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo corregir el pago')
      toast.desdeError(err, 'No se pudo corregir el pago')
    } finally {
      enVueloRef.current = false
      setSaving(false)
    }
  }

  return (
    <Modal
      title="Corregir reparto del pago"
      subtitle={referencia}
      icon={Shuffle}
      size="lg"
      onClose={onClose}
      onSubmit={handleSubmit}
      footerInfo={
        totalVigente != null ? (
          <>
            Total cobrado (no cambia): <span className="font-semibold text-neutral-900">{COP.format(totalVigente)}</span>
          </>
        ) : null
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            type="submit"
            variant="primary"
            loading={saving}
            disabled={totalVigente == null || !cuadra || motivo.trim().length < 3 || !corregidoPor.trim()}
          >
            Guardar corrección
          </Button>
        </>
      }
    >
      {cargando ? (
        <p className="py-8 text-center text-sm text-neutral-400">Cargando pago…</p>
      ) : totalVigente == null ? (
        <p className="py-8 text-center text-sm text-danger-600">{error ?? 'No hay un cobro para corregir.'}</p>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
          <section className="flex flex-col gap-3">
            <h4 className="text-[11px] font-semibold tracking-wide text-neutral-500 uppercase">Cómo se pagó en realidad</h4>
            <PagoLineas lineas={lineas} onChange={setLineas} total={totalVigente} size="sm" totalLabel="Total" />
          </section>

          <section className="flex flex-col gap-4">
            <h4 className="text-[11px] font-semibold tracking-wide text-neutral-500 uppercase">Por qué</h4>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-neutral-700">Motivo de la corrección</span>
              <textarea
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                rows={3}
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
            <p className="rounded-xl bg-neutral-50 px-3 py-2.5 text-xs leading-relaxed text-neutral-500">
              Solo cambia cómo se repartió entre efectivo, transferencia y datáfono. El registro anterior queda en
              auditoría con el motivo. Si el turno ya está cerrado, su arqueo no se recalcula: la corrección sale en el
              reporte de correcciones.
            </p>
            {error ? <p className="rounded-lg bg-danger-50 px-3 py-2.5 text-sm text-danger-700">{error}</p> : null}
          </section>
        </div>
      )}
    </Modal>
  )
}
