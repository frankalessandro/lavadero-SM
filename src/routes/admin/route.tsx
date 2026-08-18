import { useState } from 'react'
import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import {
  LayoutDashboard,
  Car,
  Sparkles,
  CircleParking,
  Users,
  Settings,
  Wallet,
  Receipt,
  ClipboardList,
  ClipboardCheck,
  Boxes,
  UserCog,
} from 'lucide-react'
import { Sidebar, type NavItem } from '../../components/layout/Sidebar'
import { Topbar } from '../../components/layout/Topbar'
import { signOut } from '../../lib/auth'

export const Route = createFileRoute('/admin')({
  beforeLoad: ({ context }) => {
    if (!context.auth) throw redirect({ to: '/login' })
    if (context.auth.perfil.rol !== 'admin' || !context.auth.perfil.activo) {
      throw redirect({ to: '/login' })
    }
  },
  component: AdminLayout,
})

const NAV_ITEMS: NavItem[] = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/admin/tipos-vehiculo', label: 'Tipos de vehículo', icon: Car },
  { to: '/admin/combos', label: 'Combos', icon: Sparkles },
  { to: '/admin/parqueadero', label: 'Parqueadero', icon: CircleParking },
  { to: '/admin/lavadores', label: 'Lavadores', icon: Users },
  { to: '/admin/liquidaciones', label: 'Liquidaciones', icon: Wallet },
  { to: '/admin/gastos', label: 'Gastos', icon: Receipt },
  { to: '/admin/inventario', label: 'Inventario', icon: Boxes },
  { to: '/admin/ordenes', label: 'Órdenes', icon: ClipboardList },
  { to: '/admin/turnos', label: 'Turnos', icon: ClipboardCheck },
  { to: '/admin/usuarios', label: 'Usuarios', icon: UserCog },
  { to: '/admin/configuracion', label: 'Configuración', icon: Settings },
]

// `fixed inset-0` saca el panel del contenedor angosto (#root) del sitio público —
// cada área por rol es su propia superficie, no hereda el layout de marketing.
// Con 12 ítems de nav, un MobileTabBar horizontal-scroll deja de ser usable en celular —
// por debajo de `md` la navegación vive en el drawer del hamburguesa del Topbar en su lugar.
function AdminLayout() {
  const [menuOpen, setMenuOpen] = useState(false)
  return (
    <div className="fixed inset-0 z-10 flex bg-neutral-50 text-left">
      <Sidebar
        navItems={NAV_ITEMS}
        roleLabel="Administrador"
        mobileOpen={menuOpen}
        onMobileClose={() => setMenuOpen(false)}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          title="Panel de administración"
          searchPlaceholder="Buscar por placa…"
          avatarInitial="A"
          onLogout={signOut}
          onMenuClick={() => setMenuOpen(true)}
        />
        <main className="flex-1 overflow-y-auto p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
