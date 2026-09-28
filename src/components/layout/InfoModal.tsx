import { Info } from 'lucide-react'
import { Modal } from './Modal'
import { Button } from './Button'

interface InfoModalProps {
  title: string
  description: string
  onClose: () => void
}

// Modal puramente informativo (sin acción que confirmar) — explica qué significa una cifra o cómo
// funciona una pantalla sin ocupar la pantalla con párrafos.
export function InfoModal({ title, description, onClose }: InfoModalProps) {
  return (
    <Modal
      title={title}
      icon={Info}
      size="sm"
      onClose={onClose}
      footer={
        <Button variant="primary" onClick={onClose}>
          Entendido
        </Button>
      }
    >
      <p className="whitespace-pre-line text-sm leading-relaxed text-neutral-600">{description}</p>
    </Modal>
  )
}
