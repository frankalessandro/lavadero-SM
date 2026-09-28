import { useState, type ReactNode } from 'react'
import { CircleHelp } from 'lucide-react'
import { InfoModal } from './InfoModal'

interface PageHeaderProps {
  title: string
  /** El Topbar ya muestra "Sección › Pantalla": por defecto el título acá solo existe para lectores
   *  de pantalla, para no repetirlo tres veces (topbar, pestaña activa, página). `showTitle` lo
   *  muestra cuando aporta algo distinto (ej. "Hoy, lunes 28 de septiembre" en el dashboard). */
  showTitle?: boolean
  /** Una sola línea: para qué sirve la pantalla. La explicación larga va en `help`. */
  description?: ReactNode
  /** Explicación completa (reglas, qué incluye y qué no) — abre en un modal "¿Cómo funciona?"
   *  en vez de ocupar la parte de arriba de la pantalla con párrafos. */
  help?: { title?: string; body: string }
  /** Acciones de la pantalla. La principal va de última (queda a la derecha en escritorio). */
  actions?: ReactNode
}

export function PageHeader({ title, showTitle = false, description, help, actions }: PageHeaderProps) {
  const [ayuda, setAyuda] = useState(false)
  const botonAyuda = help ? (
    <button
      type="button"
      onClick={() => setAyuda(true)}
      className="inline-flex shrink-0 items-center gap-1 rounded-full border border-neutral-200 bg-white px-2.5 py-1 text-xs font-medium text-neutral-500 transition-colors hover:border-primary-200 hover:bg-primary-50 hover:text-primary-700"
    >
      <CircleHelp size={13} />
      ¿Cómo funciona?
    </button>
  ) : null

  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="min-w-0">
        {showTitle ? (
          <>
            <h2 className="text-xl font-semibold tracking-tight text-neutral-900">{title}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-2">
              {description ? <p className="text-sm text-neutral-500">{description}</p> : null}
              {botonAyuda}
            </div>
          </>
        ) : (
          <>
            <h2 className="sr-only">{title}</h2>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              {description ? <p className="text-sm text-neutral-600">{description}</p> : null}
              {botonAyuda}
            </div>
          </>
        )}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2 lg:shrink-0 lg:justify-end">{actions}</div> : null}
      {help && ayuda ? (
        <InfoModal title={help.title ?? title} description={help.body} onClose={() => setAyuda(false)} />
      ) : null}
    </div>
  )
}

/** Encabezado de un bloque dentro de una página: título, contador opcional y acción a la derecha. */
export function SectionHeader({
  title,
  count,
  hint,
  action,
}: {
  title: string
  count?: number
  hint?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-2">
      <div className="min-w-0">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-neutral-900">
          {title}
          {count !== undefined ? (
            <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-neutral-500">
              {count}
            </span>
          ) : null}
        </h3>
        {hint ? <p className="mt-0.5 text-xs text-neutral-500">{hint}</p> : null}
      </div>
      {action}
    </div>
  )
}
