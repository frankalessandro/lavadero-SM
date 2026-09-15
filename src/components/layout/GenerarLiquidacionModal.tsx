import { useRef, useState } from 'react'
import { HandCoins, X } from 'lucide-react'
import { CurrencyInput } from './CurrencyInput'
import { toast } from '../../lib/toast'

const COP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })

// Confirmación de "Generar liquidación" (lavador o jefe de patio). Si la persona debe algo, admin
// ELIGE cuánto descontar en este corte (decisión de Alessandro, 2026-09-15): nada, parcial o todo
// lo que alcance la comisión. Arranca en el máximo — visible y editable, nunca en silencio.
export function GenerarLiquidacionModal({
  titulo,
  resumen,
  nombre,
  comisionBruta,
  deudaPendiente,
  onConfirm,
  onCancel,
}: {
  titulo: string
  resumen: string
  nombre: string
  comisionBruta: number
  deudaPendiente: number
  onConfirm: (deudaADescontar: number) => Promise<void>
  onCancel: () => void
}) {
  const maximo = Math.max(0, Math.min(deudaPendiente, comisionBruta))
  const [descuento, setDescuento] = useState(String(maximo))
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const enVueloRef = useRef(false)

  const valor = Number(descuento || 0)
  const neto = comisionBruta - valor
  const quedaDebiendo = deudaPendiente - valor

  async function confirmar() {
    if (enVueloRef.current) return
    if (!Number.isFinite(valor) || valor < 0 || valor > maximo) {
      setError(`El descuento debe estar entre ${COP.format(0)} y ${COP.format(maximo)}`)
      return
    }
    setError(null)
    enVueloRef.current = true
    setSaving(true)
    try {
      await onConfirm(Math.round(valor))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo generar la liquidación')
      toast.desdeError(err, 'No se pudo generar la liquidación')
    } finally {
      enVueloRef.current = false
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-neutral-900/40 p-4 backdrop-blur-[2px]">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-card-hover sm:p-7">
        <div className="mb-4 flex items-start justify-between gap-3">
          <h3 className="text-base font-semibold text-neutral-900">{titulo}</h3>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Cerrar"
            className="flex size-8 shrink-0 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-neutral-100"
          >
            <X size={18} />
          </button>
        </div>

        <p className="mb-4 text-sm text-neutral-600">{resumen}</p>

        {deudaPendiente > 0 ? (
          <div className="mb-4 flex flex-col gap-3 rounded-xl border border-warning-600/25 bg-warning-50/60 p-4">
            <p className="flex items-center gap-2 text-sm font-medium text-warning-700">
              <HandCoins size={16} className="shrink-0" />
              {nombre} debe {COP.format(deudaPendiente)}
            </p>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-neutral-700">¿Cuánto descontar en este corte?</span>
              <CurrencyInput size="sm" prefix="$" value={descuento} onChange={setDescuento} />
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setDescuento('0')}
                className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-600 transition-colors hover:bg-white"
              >
                Nada
              </button>
              <button
                type="button"
                onClick={() => setDescuento(String(maximo))}
                className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-600 transition-colors hover:bg-white"
              >
                Todo lo posible ({COP.format(maximo)})
              </button>
            </div>
          </div>
        ) : null}

        <div className="flex flex-col gap-1 rounded-lg bg-neutral-50 px-4 py-3 text-sm">
          <div className="flex justify-between text-neutral-600">
            <span>Comisión del corte</span>
            <span>{COP.format(comisionBruta)}</span>
          </div>
          {deudaPendiente > 0 ? (
            <div className="flex justify-between text-neutral-600">
              <span>− Descuento de deuda</span>
              <span>{COP.format(valor)}</span>
            </div>
          ) : null}
          <div className="flex justify-between border-t border-neutral-200 pt-1 font-semibold text-neutral-900">
            <span>Se le paga</span>
            <span>{COP.format(Math.max(0, neto))}</span>
          </div>
          {deudaPendiente > 0 ? (
            <p className="text-xs text-neutral-500">Queda debiendo {COP.format(Math.max(0, quedaDebiendo))}</p>
          ) : null}
        </div>

        {error ? <p className="mt-3 text-xs text-danger-600">{error}</p> : null}

        <div className="mt-5 flex justify-end gap-2 border-t border-neutral-100 pt-4">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg px-4 py-2 text-sm font-medium text-neutral-600 transition-colors hover:bg-neutral-100"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={confirmar}
            disabled={saving}
            className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white shadow-nav-active transition-colors hover:bg-primary-700 disabled:opacity-60"
          >
            {saving ? 'Generando…' : 'Generar liquidación'}
          </button>
        </div>
      </div>
    </div>
  )
}
