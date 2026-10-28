import { useRef, useState } from 'react'
import { AlertTriangle, HelpCircle } from 'lucide-react'
import { toast } from '../../lib/toast'
import { Modal } from './Modal'
import { Button } from './Button'

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
  const enVueloRef = useRef(false)

  async function handleConfirm() {
    if (enVueloRef.current) return
    enVueloRef.current = true
    setSaving(true)
    try {
      await onConfirm()
      if (successMessage) toast.exito(successMessage)
    } catch (err) {
      toast.desdeError(err, 'No se pudo completar la acción')
    } finally {
      enVueloRef.current = false
      setSaving(false)
    }
  }

  const esPeligro = variant === 'danger'

  return (
    <Modal
      title={title}
      icon={esPeligro ? AlertTriangle : HelpCircle}
      tone={esPeligro ? 'danger' : 'primary'}
      size="sm"
      onClose={onCancel}
      footer={
        <>
          <Button variant="ghost" onClick={onCancel} disabled={saving}>
            {cancelLabel}
          </Button>
          <Button variant={esPeligro ? 'danger' : 'primary'} loading={saving} onClick={() => void handleConfirm()}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-sm leading-relaxed text-neutral-600">{message}</p>
    </Modal>
  )
}
