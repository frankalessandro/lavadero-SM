import { Link } from '@tanstack/react-router'
import type { ComponentType } from 'react'

export interface SectionTab {
  to: string
  label: string
  icon: ComponentType<{ size?: number; strokeWidth?: number }>
}

/**
 * Pestañas de una sección del panel admin (Operación, Dinero, Catálogo, Personal). Son rutas
 * reales (cada una con su loader), no estado local: el enlace profundo funciona y cada pestaña
 * solo carga sus datos al abrirse.
 *
 * Control segmentado sobre un riel gris. En móvil envuelve a varias filas en vez de hacer scroll
 * lateral — la app evita el scroll horizontal salvo en tablas.
 */
export function SectionTabs({ tabs }: { tabs: SectionTab[] }) {
  return (
    <nav className="flex w-full flex-wrap gap-1 rounded-xl bg-neutral-200/60 p-1 sm:w-fit">
      {tabs.map(({ to, label, icon: Icon }) => (
        <Link
          key={to}
          to={to}
          className="flex flex-1 basis-[calc(50%-0.25rem)] items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-neutral-500 transition-colors hover:text-neutral-900 sm:flex-none sm:basis-auto"
          activeProps={{
            className: '!bg-white !text-primary-700 shadow-sm',
          }}
        >
          <Icon size={15} strokeWidth={2} />
          <span className="truncate">{label}</span>
        </Link>
      ))}
    </nav>
  )
}
