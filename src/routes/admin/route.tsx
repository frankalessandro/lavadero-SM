import { useState } from 'react'
import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import { LayoutDashboard, ClipboardList, Coins, Package, Users, Settings } from 'lucide-react'
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

// Seis secciones, una por pregunta de negocio — antes eran 14 destinos planos, uno por tabla de
// base de datos, con la misma tarea repartida en varias pantallas (definir un precio obligaba a
// pasar por Tipos de vehículo → Servicios → Combos) y la misma información repetida en varias
// (anulaciones salían en el dashboard dos veces y otra vez en Órdenes). Cada sección de acá
// agrupa sus pantallas en pestañas (ver SectionTabs); ninguna funcionalidad se eliminó al mover.
//
// `exact: false` en las secciones para que el ítem siga resaltado mientras se navega entre sus
// pestañas hijas; Dashboard y Configuración se quedan en exacto (son ruta única).
const NAV_ITEMS: NavItem[] = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/admin/operacion', label: 'Operación', icon: ClipboardList, exact: false },
  { to: '/admin/dinero', label: 'Dinero', icon: Coins, exact: false },
  { to: '/admin/catalogo', label: 'Catálogo y precios', icon: Package, exact: false },
  { to: '/admin/personal', label: 'Personal', icon: Users, exact: false },
  { to: '/admin/configuracion', label: 'Configuración', icon: Settings },
]

// `fixed inset-0` saca el panel del contenedor angosto (#root) del sitio público —
// cada área por rol es su propia superficie, no hereda el layout de marketing.
// La navegación por debajo de `md` vive en el drawer del hamburguesa del Topbar (no un
// MobileTabBar): con secciones que tienen pestañas propias, dos barras compitiendo confunden.
function AdminLayout() {
  const { auth } = Route.useRouteContext()
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
          avatarInitial="A"
          onLogout={signOut}
          onMenuClick={() => setMenuOpen(true)}
          responsable={auth?.perfil.nombre ?? undefined}
          roleLabel="Administrador"
        />
        <main className="flex-1 overflow-y-auto p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
