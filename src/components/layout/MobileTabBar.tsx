import { Link } from '@tanstack/react-router'
import type { NavItem } from './Sidebar'

// Sidebar se oculta por debajo de `md` — esta barra la reemplaza en celular/tablet,
// donde jefe de zona y vigilante hacen la mayoría de sus registros.
export function MobileTabBar({ navItems }: { navItems: NavItem[] }) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-10 flex overflow-x-auto border-t border-neutral-200 bg-white/95 backdrop-blur-sm md:hidden">
      {navItems.map(({ to, label, icon: Icon }) => (
        <Link
          key={to}
          to={to}
          activeOptions={{ exact: true }}
          className="flex min-w-16 flex-1 flex-col items-center gap-1 px-2 py-2.5 text-neutral-500 transition-colors"
          activeProps={{ className: '!text-primary-600' }}
        >
          <Icon size={20} strokeWidth={2} />
          <span className="text-[11px] font-medium leading-none">{label}</span>
        </Link>
      ))}
    </nav>
  )
}
