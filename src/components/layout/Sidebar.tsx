import { Link } from '@tanstack/react-router'
import { Droplets } from 'lucide-react'
import type { ComponentType } from 'react'

export interface NavItem {
  to: string
  label: string
  icon: ComponentType<{ size?: number; strokeWidth?: number }>
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
      <div className="flex items-center gap-2.5 px-6 py-6">
        <span className="flex size-9 items-center justify-center rounded-xl bg-primary-600 text-white shadow-nav-active">
          <Droplets size={18} strokeWidth={2.25} />
        </span>
        <span className="text-sm font-semibold tracking-wide text-neutral-900">Lavadero SM</span>
      </div>

      <nav className="flex flex-1 flex-col gap-1 px-3">
        {navItems.map(({ to, label, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            activeOptions={{ exact: true }}
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
