import { useState } from 'react'
import { AlertTriangle, HelpCircle } from 'lucide-react'
import { toast } from '../../lib/toast'

interface ConfirmModalProps {
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  /** 'primary' (default, acciones normales) | 'danger' (inactivar, anular, acciones que restringen algo). */
  variant?: 'primary' | 'danger'
  onConfirm: () => void | Promise<void>
  onCancel: () => void
  /** Toast al confirmar con éxito — opcional, sin él no hay toast de éxito (algunos llamadores
   *  ya muestran su propia confirmación visual, como ReciboModal, y no hace falta duplicarla). */
  successMessage?: string
}

// Confirmación genérica de un clic — para acciones que hoy se ejecutan directo al tocar un
// botón (activar/inactivar, marcar pagada, finalizar lavado). No se usa donde ya existe un modal
// con campos propios (cobrar, anular, abrir/cerrar turno) — ahí el formulario ya es la confirmación,
// duplicarla sería un paso de más.
//
// `onConfirm` no tenía `catch` acá: si la acción fallaba (red, RPC rechazada), el modal se
// quedaba ahí con el botón reactivado y NADA le decía al usuario que no pasó nada — fallaba en
// silencio. El toast de error es automático para las ~15 pantallas que usan este componente.
export function ConfirmModal({
  title,
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  variant = 'primary',
  onConfirm,
  onCancel,
  successMessage,
}: ConfirmModalProps) {
  const [saving, setSaving] = useState(false)

  async function handleConfirm() {
    setSaving(true)
    try {
      await onConfirm()
      if (successMessage) toast.exito(successMessage)
    } catch (err) {
      toast.desdeError(err, 'No se pudo completar la acción')
    } finally {
      setSaving(false)
    }
  }

  const esPeligro = variant === 'danger'

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-neutral-900/40 p-4 backdrop-blur-[2px]">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-card-hover">
        <div className="flex items-start gap-3">
          <span
            className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${
              esPeligro ? 'bg-danger-50 text-danger-600' : 'bg-primary-50 text-primary-600'
            }`}
          >
            {esPeligro ? <AlertTriangle size={18} strokeWidth={2} /> : <HelpCircle size={18} strokeWidth={2} />}
          </span>
          <div className="min-w-0 pt-1">
            <h3 className="text-base font-semibold text-neutral-900">{title}</h3>
            <p className="mt-1 text-sm text-neutral-500">{message}</p>
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2 border-t border-neutral-100 pt-4">
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="rounded-lg px-4 py-2 text-sm font-medium text-neutral-600 transition-colors hover:bg-neutral-100 disabled:opacity-60"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={saving}
            className={`rounded-lg px-4 py-2 text-sm font-medium text-white shadow-nav-active transition-colors disabled:opacity-60 ${
              esPeligro ? 'bg-danger-600 hover:bg-danger-700' : 'bg-primary-600 hover:bg-primary-700'
            }`}
          >
            {saving ? 'Procesando…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
