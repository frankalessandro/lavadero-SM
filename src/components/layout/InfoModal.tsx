import { Info, X } from 'lucide-react'

interface InfoModalProps {
  title: string
  description: string
  onClose: () => void
}

// Modal puramente informativo (sin acción que confirmar) — para explicar qué significa una
// cifra del dashboard (ej. "Caja del día") sin sacar al usuario de la pantalla a leer CLAUDE.md.
export function InfoModal({ title, description, onClose }: InfoModalProps) {
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-neutral-900/40 p-4 backdrop-blur-[2px]">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-card-hover">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-600">
            <Info size={18} strokeWidth={2} />
          </span>
          <div className="min-w-0 flex-1 pt-1">
            <h3 className="text-base font-semibold text-neutral-900">{title}</h3>
            <p className="mt-1 whitespace-pre-line text-sm text-neutral-500">{description}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="flex size-8 shrink-0 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-600"
          >
            <X size={18} />
          </button>
        </div>

        <div className="mt-5 flex justify-end border-t border-neutral-100 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white shadow-nav-active transition-colors hover:bg-primary-700"
          >
            Entendido
          </button>
        </div>
      </div>
    </div>
  )
}
