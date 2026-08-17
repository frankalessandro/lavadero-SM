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
}

export function Sidebar({ navItems, roleLabel }: SidebarProps) {
  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-neutral-200 bg-white md:flex">
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
            className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-neutral-500 transition-colors hover:bg-primary-50 hover:text-primary-700"
            activeProps={{ className: '!bg-primary-600 !text-white shadow-nav-active hover:!bg-primary-600' }}
          >
            <Icon size={18} strokeWidth={2} />
            {label}
          </Link>
        ))}
      </nav>

      <div className="px-6 py-6 text-xs font-medium text-neutral-400">{roleLabel}</div>
    </aside>
  )
}
