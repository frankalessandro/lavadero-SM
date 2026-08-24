import { Link } from '@tanstack/react-router'
import type { ComponentType } from 'react'

export interface SectionTab {
  to: string
  label: string
  icon: ComponentType<{ size?: number; strokeWidth?: number }>
}

/**
 * Barra de pestañas de una sección del panel admin (Operación, Dinero, Catálogo, Personal).
 *
 * El menú lateral pasó de 14 destinos planos —uno por tabla de base de datos— a 6 secciones por
 * pregunta de negocio; estas pestañas son la navegación DENTRO de cada sección. Es navegación
 * real (cada pestaña es su propia ruta con su loader), no estado local: así el enlace profundo
 * sigue funcionando y cada pestaña solo carga sus datos cuando se abre.
 *
 * Scroll horizontal en móvil por la misma razón que MobileTabBar: 4 pestañas no caben en una
 * columna angosta sin encogerlas hasta lo ilegible.
 */
export function SectionTabs({ tabs }: { tabs: SectionTab[] }) {
  return (
    <nav className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
      {tabs.map(({ to, label, icon: Icon }) => (
        <Link
          key={to}
          to={to}
          className="flex shrink-0 items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm font-medium text-neutral-600 transition-colors hover:bg-neutral-50"
          activeProps={{
            className: '!border-primary-600 !bg-primary-50 !text-primary-700',
          }}
        >
          <Icon size={15} strokeWidth={2} />
          {label}
        </Link>
      ))}
    </nav>
  )
}
