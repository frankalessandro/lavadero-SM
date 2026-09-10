import type { ReactNode } from 'react'
import { ArrowLeft, CheckCircle2, AlertTriangle } from 'lucide-react'

// Tarea de pantalla completa — para lo que NO cabe cómodo en un modal: contar 7 productos uno por
// uno, hacer un arqueo. Un bottom-sheet con `max-h-[90vh]` y scroll interno para eso queda
// apretado en celular (que es donde el jefe de patio realmente lo hace) y encima compite con el
// teclado. Acá: header con "volver", cuerpo que scrollea solo, y el botón principal fijo abajo
// para que nunca haya que buscarlo.
export function PantallaTarea({
  titulo,
  subtitulo,
  onVolver,
  children,
  pie,
}: {
  titulo: string
  subtitulo?: string
  onVolver: () => void
  children: ReactNode
  /** Acción principal (y secundaria si aplica) — queda fija abajo. */
  pie?: ReactNode
}) {
  return (
    <div className="fixed inset-0 z-30 flex flex-col bg-neutral-50">
      <header className="flex shrink-0 items-center gap-3 border-b border-neutral-200 bg-white px-4 py-3">
        <button
          type="button"
          onClick={onVolver}
          aria-label="Volver"
          className="flex size-9 shrink-0 items-center justify-center rounded-lg text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold text-neutral-900">{titulo}</h2>
          {subtitulo ? <p className="truncate text-xs text-neutral-500">{subtitulo}</p> : null}
        </div>
      </header>

      <div className="custom-scroll min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-lg flex-col gap-4 p-4">{children}</div>
      </div>

      {pie ? (
        <footer className="shrink-0 border-t border-neutral-200 bg-white p-4">
          <div className="mx-auto flex w-full max-w-lg flex-col gap-2">{pie}</div>
        </footer>
      ) : null}
    </div>
  )
}

// Semáforo de cuadre — verde = cero diferencia, ámbar = hay algo que justificar. Se usa en el
// checklist del turno y en el resumen de cierre.
export function IndicadorCuadrado({ cuadrado, label }: { cuadrado: boolean; label: string }) {
  return (
    <div
      className={`flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium ${
        cuadrado ? 'bg-success-50 text-success-700' : 'bg-warning-50 text-warning-700'
      }`}
    >
      {cuadrado ? <CheckCircle2 size={16} className="shrink-0" /> : <AlertTriangle size={16} className="shrink-0" />}
      {label}
    </div>
  )
}

// Botón principal de una tarea (el que va en el pie de PantallaTarea).
export function BotonPrincipal({
  children,
  disabled,
  onClick,
  type = 'button',
}: {
  children: ReactNode
  disabled?: boolean
  onClick?: () => void
  type?: 'button' | 'submit'
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary-600 py-3.5 text-sm font-semibold text-white shadow-nav-active transition-colors hover:bg-primary-700 disabled:opacity-60"
    >
      {children}
    </button>
  )
}
