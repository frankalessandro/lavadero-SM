import { useState, type FormEvent } from 'react'
import { X } from 'lucide-react'
import { anularVentaInputSchema } from '../../schemas/venta'
import type { Venta } from '../../schemas/venta'

// Quitar un producto ya cargado a un destino pendiente (orden o cuenta abierta) antes de
// cobrar/cerrar — regla de negocio 13: se anula con motivo, no se borra, queda visible en
// reportes. Como nunca descontó stock, no hay reverso de inventario.
export function QuitarProductoModal({
  venta,
  productoNombre,
  onClose,
  onQuitar,
}: {
  venta: Venta
  productoNombre: string
  onClose: () => void
  onQuitar: (venta: Venta, motivo: string) => Promise<void>
}) {
  const [motivo, setMotivo] = useState('Quitado antes de cobrar')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const parsed = anularVentaInputSchema.pick({ motivo: true }).safeParse({ motivo })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Indica un motivo')
      return
    }
    setError(null)
    setSaving(true)
    try {
      await onQuitar(venta, parsed.data.motivo)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo quitar el producto')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-neutral-900/40 p-4 backdrop-blur-[2px]">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-card-hover">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-neutral-900">
            Quitar {productoNombre} ×{venta.cantidad}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="flex size-8 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-neutral-100"
          >
            <X size={18} />
          </button>
        </div>
        <p className="mb-4 text-xs text-neutral-500">
          Queda anulado con el motivo, visible en reportes (control antifraude). No afecta el stock.
        </p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-neutral-700">Motivo</span>
            <textarea
              autoFocus
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={2}
              className="resize-none rounded-lg border border-neutral-300 px-3 py-2.5 text-sm outline-none transition-colors focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
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
              disabled={saving}
              className="rounded-lg bg-danger-600 px-4 py-2 text-sm font-medium text-white shadow-nav-active transition-colors hover:bg-danger-700 disabled:opacity-60"
            >
              {saving ? 'Quitando…' : 'Quitar producto'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
