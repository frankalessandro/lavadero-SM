import { useEffect, type ComponentType, type ReactNode } from 'react'
import { X } from 'lucide-react'

type Tamano = 'sm' | 'md' | 'lg' | 'xl' | '2xl'

const ANCHO: Record<Tamano, string> = {
  sm: 'sm:max-w-md',
  md: 'sm:max-w-lg',
  lg: 'sm:max-w-2xl',
  xl: 'sm:max-w-4xl',
  '2xl': 'sm:max-w-6xl',
}

interface ModalProps {
  title: ReactNode
  subtitle?: ReactNode
  icon?: ComponentType<{ size?: number; strokeWidth?: number }>
  /** Tono del ícono del encabezado. */
  tone?: 'primary' | 'danger' | 'warning' | 'success' | 'neutral'
  size?: Tamano
  onClose: () => void
  /** Acciones del pie (botones). Quedan fijas abajo aunque el cuerpo haga scroll. */
  footer?: ReactNode
  /** Contenido a la derecha del título (chips, filtros cortos). */
  headerExtra?: ReactNode
  children: ReactNode
  /** Sin padding en el cuerpo — para tablas o listas que llegan al borde. */
  flush?: boolean
}

const TONO_ICONO = {
  primary: 'bg-primary-50 text-primary-600',
  danger: 'bg-danger-50 text-danger-600',
  warning: 'bg-warning-50 text-warning-600',
  success: 'bg-success-50 text-success-600',
  neutral: 'bg-neutral-100 text-neutral-600',
}

// Modal base del panel: hoja anclada abajo en celular (se alcanza con el pulgar) y centrada en
// escritorio. Encabezado, pie y cuerpo con scroll propio — `shrink-0` en encabezado y pie para que
// una lista larga no los aplaste (ver "Dos trampas de tablas largas dentro de modales").
export function Modal({
  title,
  subtitle,
  icon: Icon,
  tone = 'primary',
  size = 'md',
  onClose,
  footer,
  headerExtra,
  children,
  flush = false,
}: ModalProps) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-30 flex items-end justify-center bg-neutral-900/40 backdrop-blur-[2px] sm:items-center sm:p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className={`flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-3xl bg-white shadow-card-hover sm:max-h-[88vh] sm:rounded-2xl ${ANCHO[size]}`}
      >
        <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-neutral-200 sm:hidden" />
        <header className="flex shrink-0 items-start gap-3 border-b border-neutral-100 px-5 pt-4 pb-4 sm:px-6 sm:pt-5">
          {Icon ? (
            <span className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${TONO_ICONO[tone]}`}>
              <Icon size={18} strokeWidth={2} />
            </span>
          ) : null}
          <div className="min-w-0 flex-1 pt-0.5">
            <h3 className="text-base font-semibold text-neutral-900">{title}</h3>
            {subtitle ? <p className="mt-0.5 text-sm text-neutral-500">{subtitle}</p> : null}
          </div>
          {headerExtra}
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="-mr-1 flex size-8 shrink-0 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
          >
            <X size={18} />
          </button>
        </header>
        <div className={`custom-scroll min-h-0 flex-1 overflow-y-auto ${flush ? '' : 'px-5 py-5 sm:px-6'}`}>{children}</div>
        {footer ? (
          <footer className="flex shrink-0 flex-col-reverse gap-2 border-t border-neutral-100 bg-neutral-50/60 px-5 py-3.5 sm:flex-row sm:justify-end sm:px-6">
            {footer}
          </footer>
        ) : null}
      </div>
    </div>
  )
}
