import type { ReactNode } from 'react'

// El padding por defecto solo aplica si el llamador no pasa uno propio: dos utilidades `p-*` en el
// mismo elemento no se resuelven por orden en el className (gana la que Tailwind emite después).
export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  const tienePadding = /(^|\s)(p|px|py)-/.test(className)
  return (
    <div
      className={`rounded-2xl border border-neutral-200 bg-white shadow-card transition-shadow ${tienePadding ? '' : 'p-2'} ${className}`}
    >
      {children}
    </div>
  )
}
