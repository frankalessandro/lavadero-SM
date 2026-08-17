import { createFileRoute, Outlet } from '@tanstack/react-router'
import { LayoutDashboard, ClipboardList, Wallet, Boxes } from 'lucide-react'
import { Sidebar, type NavItem } from '../../components/layout/Sidebar'
import { Topbar } from '../../components/layout/Topbar'
import { MobileTabBar } from '../../components/layout/MobileTabBar'

export const Route = createFileRoute('/jefe-zona')({
  component: JefeZonaLayout,
})

const NAV_ITEMS: NavItem[] = [
  { to: '/jefe-zona', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/recepcion', label: 'Recepción', icon: ClipboardList },
  { to: '/jefe-zona/caja', label: 'Caja', icon: Wallet },
  { to: '/jefe-zona/inventario', label: 'Inventario', icon: Boxes },
]

function JefeZonaLayout() {
  return (
    <div className="fixed inset-0 z-10 flex bg-neutral-50 text-left">
      <Sidebar navItems={NAV_ITEMS} roleLabel="Jefe de zona" />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar title="Lavadero" searchPlaceholder="Buscar por placa…" avatarInitial="J" />
        <main className="flex-1 overflow-y-auto p-4 pb-24 sm:p-6 md:pb-6">
          <Outlet />
        </main>
      </div>
      <MobileTabBar navItems={NAV_ITEMS} />
    </div>
  )
}
