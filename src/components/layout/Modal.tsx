import { useEffect, type ComponentType, type FormEvent, type ReactNode } from 'react'
import { X } from 'lucide-react'

type Tamano = 'sm' | 'md' | 'lg' | 'xl' | '2xl'

// Anchos pensados desde escritorio (rediseño 2026-10-28: antes eran de celular y en un PC el
// modal quedaba como una tira angosta en medio de la pantalla). Debajo de `sm` siempre es una
// hoja a lo ancho de la pantalla.
//   sm  480px  — confirmaciones, 1–3 campos
//   md  640px  — formularios (campos cortos en 2 columnas con ModalSeccion)
//   lg  896px  — formularios con listas, expedientes, elegir de una grilla
//   xl  1152px — tablas y desgloses anchos
//   2xl 1408px — tablas muy anchas
const ANCHO: Record<Tamano, string> = {
  sm: 'sm:max-w-[30rem]',
  md: 'sm:max-w-[40rem]',
  lg: 'sm:max-w-[56rem]',
  xl: 'sm:max-w-[72rem]',
  '2xl': 'sm:max-w-[88rem]',
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
  /** Texto o resumen a la izquierda del pie (total, conteo) — los botones quedan a la derecha. */
  footerInfo?: ReactNode
  /** Contenido a la derecha del título (chips, filtros cortos). */
  headerExtra?: ReactNode
  children: ReactNode
  /** Sin padding en el cuerpo — para tablas o listas que llegan al borde. */
  flush?: boolean
  /** El modal entero es un <form>: Enter en cualquier campo envía y los botones del pie pueden
   * ser `type="submit"`. */
  onSubmit?: (event: FormEvent<HTMLFormElement>) => void
}

const TONO_ICONO = {
  primary: 'bg-primary-50 text-primary-600',
  danger: 'bg-danger-50 text-danger-600',
  warning: 'bg-warning-50 text-warning-600',
  success: 'bg-success-50 text-success-600',
  neutral: 'bg-neutral-100 text-neutral-600',
}

// Modal base del panel: centrado en escritorio y tablet, hoja anclada abajo en celular (se alcanza
// con el pulgar). Encabezado, pie y cuerpo con scroll propio — `shrink-0` en encabezado y pie para
// que una lista larga no los aplaste (ver "Dos trampas de tablas largas dentro de modales").
export function Modal({
  title,
  subtitle,
  icon: Icon,
  tone = 'primary',
  size = 'md',
  onClose,
  footer,
  footerInfo,
  headerExtra,
  children,
  flush = false,
  onSubmit,
}: ModalProps) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const panel = `flex max-h-[94vh] w-full flex-col overflow-hidden rounded-t-3xl bg-white shadow-card-hover sm:max-h-[90vh] sm:rounded-2xl ${ANCHO[size]}`
  const contenido = (
    <>
      <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-neutral-200 sm:hidden" />
      <header className="flex shrink-0 items-center gap-3 border-b border-neutral-100 px-5 py-4 sm:px-6">
        {Icon ? (
          <span className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${TONO_ICONO[tone]}`}>
            <Icon size={17} strokeWidth={2} />
          </span>
        ) : null}
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-semibold text-neutral-900">{title}</h3>
          {subtitle ? <div className="mt-0.5 text-sm text-neutral-500">{subtitle}</div> : null}
        </div>
        {headerExtra}
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          className="-mr-1 flex size-9 shrink-0 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
        >
          <X size={18} />
        </button>
      </header>
      <div className={`custom-scroll min-h-0 flex-1 overflow-y-auto ${flush ? '' : 'px-5 py-5 sm:px-6'}`}>{children}</div>
      {footer || footerInfo ? (
        <footer className="flex shrink-0 flex-col-reverse gap-2 border-t border-neutral-100 bg-neutral-50/60 px-5 py-3 sm:flex-row sm:items-center sm:justify-end sm:px-6">
          {footerInfo ? <div className="min-w-0 text-sm text-neutral-500 sm:mr-auto">{footerInfo}</div> : null}
          {footer}
        </footer>
      ) : null}
    </>
  )

  return (
    <div
      className="fixed inset-0 z-30 flex items-end justify-center bg-neutral-900/40 backdrop-blur-[2px] sm:items-center sm:p-6"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      {onSubmit ? (
        <form role="dialog" aria-modal="true" onSubmit={onSubmit} className={panel}>
          {contenido}
        </form>
      ) : (
        <div role="dialog" aria-modal="true" className={panel}>
          {contenido}
        </div>
      )}
    </div>
  )
}

// Bloque con título dentro de un modal. `columnas` reparte los campos en una grilla desde `sm`
// (en celular siempre una columna) — la forma estándar de no desperdiciar ancho en escritorio.
export function ModalSeccion({
  titulo,
  descripcion,
  columnas = 1,
  children,
}: {
  titulo?: ReactNode
  descripcion?: ReactNode
  columnas?: 1 | 2 | 3
  children: ReactNode
}) {
  const grilla = columnas === 3 ? 'sm:grid-cols-3' : columnas === 2 ? 'sm:grid-cols-2' : ''
  return (
    <section className="flex flex-col gap-3">
      {titulo || descripcion ? (
        <div className="flex flex-col gap-0.5">
          {titulo ? <h4 className="text-[11px] font-semibold tracking-wide text-neutral-500 uppercase">{titulo}</h4> : null}
          {descripcion ? <p className="text-xs text-neutral-500">{descripcion}</p> : null}
        </div>
      ) : null}
      <div className={`grid grid-cols-1 gap-3 ${grilla}`}>{children}</div>
    </section>
  )
}
