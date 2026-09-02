import { Link } from '@tanstack/react-router'
import type { ComponentType } from 'react'
import logoIsotipo from '../../assets/logo-isotipo.png'

export interface NavItem {
  to: string
  label: string
  icon: ComponentType<{ size?: number; strokeWidth?: number }>
  /**
   * Por defecto un ítem solo se marca activo en su ruta exacta. Los ítems que son una SECCIÓN con
   * pestañas adentro (Operación, Dinero, Catálogo, Personal en admin) necesitan `exact: false`
   * para seguir resaltados mientras se navega entre sus pestañas hijas. `/admin` (Dashboard) debe
   * quedarse en `true`, si no coincidiría con todas las rutas del panel.
   */
  exact?: boolean
}

interface SidebarProps {
  navItems: NavItem[]
  roleLabel: string
  /** Cuando se pasa junto con `onMobileClose`, además del sidebar fijo de escritorio se
   *  renderiza una hoja lateral (drawer) por debajo de `md`, abierta desde el hamburguesa del Topbar. */
  mobileOpen?: boolean
  onMobileClose?: () => void
}

function SidebarContent({
  navItems,
  roleLabel,
  onNavigate,
}: {
  navItems: NavItem[]
  roleLabel: string
  onNavigate?: () => void
}) {
  return (
    <>
      <div className="flex items-center gap-2.5 px-6 pt-7 pb-6">
        <img src={logoIsotipo} alt="" className="h-9 w-9 shrink-0 object-contain" />
        <span className="text-base font-semibold tracking-tight text-neutral-900">Carwash SM</span>
      </div>

      <nav className="flex flex-1 flex-col gap-1 px-3">
        {navItems.map(({ to, label, icon: Icon, exact = true }) => (
          <Link
            key={to}
            to={to}
            activeOptions={{ exact }}
            onClick={onNavigate}
            className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-neutral-500 transition-colors hover:bg-primary-50 hover:text-primary-700"
            activeProps={{ className: '!bg-primary-600 !text-white shadow-nav-active hover:!bg-primary-600' }}
          >
            <Icon size={18} strokeWidth={2} />
            {label}
          </Link>
        ))}
      </nav>

      <div className="px-6 py-6 text-xs font-medium text-neutral-400">{roleLabel}</div>
    </>
  )
}

export function Sidebar({ navItems, roleLabel, mobileOpen = false, onMobileClose }: SidebarProps) {
  return (
    <>
      <aside className="hidden w-64 shrink-0 flex-col border-r border-neutral-200 bg-white md:flex">
        <SidebarContent navItems={navItems} roleLabel={roleLabel} />
      </aside>

      {onMobileClose ? (
        <div className={`fixed inset-0 z-40 md:hidden ${mobileOpen ? '' : 'pointer-events-none'}`} aria-hidden={!mobileOpen}>
          <div
            className={`absolute inset-0 bg-neutral-900/40 transition-opacity duration-200 ${mobileOpen ? 'opacity-100' : 'opacity-0'}`}
            onClick={onMobileClose}
          />
          <aside
            className={`absolute inset-y-0 left-0 flex w-72 max-w-[80vw] flex-col bg-white shadow-card-hover transition-transform duration-200 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}
          >
            <SidebarContent navItems={navItems} roleLabel={roleLabel} onNavigate={onMobileClose} />
          </aside>
        </div>
      ) : null}
    </>
  )
}
