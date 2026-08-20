import { useState } from 'react'
import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import { LayoutDashboard, ClipboardList, Wallet, Boxes, CalendarCheck } from 'lucide-react'
import { Sidebar, type NavItem } from '../../components/layout/Sidebar'
import { Topbar } from '../../components/layout/Topbar'
import { MobileTabBar } from '../../components/layout/MobileTabBar'
import { signOut } from '../../lib/auth'
import { fetchTurnoAbierto } from '../../data/turnos'

export const Route = createFileRoute('/jefe-zona')({
  beforeLoad: ({ context }) => {
    if (!context.auth) throw redirect({ to: '/login' })
    const { rol, activo } = context.auth.perfil
    if ((rol !== 'jefe_zona' && rol !== 'admin') || !activo) {
      throw redirect({ to: '/login' })
    }
  },
  // Un solo turno compartido entre Caja y Asistencia (ver TurnoResponsableBanner) — se carga acá,
  // a nivel de layout, para que el Topbar pueda mostrar "quién está a cargo ahora" en cualquier
  // pantalla del área, no solo en las dos que ya lo usan directamente. `router.invalidate()` (ya
  // disparado por abrir/cerrar/transferir turno) refresca este loader igual que los de las páginas.
  loader: () => fetchTurnoAbierto('jefe_zona'),
  component: JefeZonaLayout,
})

const NAV_ITEMS: NavItem[] = [
  { to: '/jefe-zona', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/recepcion', label: 'Recepción', icon: ClipboardList },
  { to: '/jefe-zona/caja', label: 'Caja', icon: Wallet },
  { to: '/jefe-zona/asistencia', label: 'Asistencia', icon: CalendarCheck },
  { to: '/jefe-zona/inventario', label: 'Inventario', icon: Boxes },
]

function JefeZonaLayout() {
  const turno = Route.useLoaderData()
  const { auth } = Route.useRouteContext()
  const [menuOpen, setMenuOpen] = useState(false)
  return (
    <div className="fixed inset-0 z-10 flex bg-neutral-50 text-left">
      <Sidebar
        navItems={NAV_ITEMS}
        roleLabel="Jefe de zona"
        mobileOpen={menuOpen}
        onMobileClose={() => setMenuOpen(false)}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          title="Lavadero"
          avatarInitial="J"
          onLogout={signOut}
          onMenuClick={() => setMenuOpen(true)}
          responsable={turno?.responsableActual ?? auth?.perfil.nombre ?? undefined}
          roleLabel="Jefe de zona"
        />
        <main className="flex-1 overflow-y-auto p-4 pb-24 sm:p-6 md:pb-6">
          <Outlet />
        </main>
      </div>
      <MobileTabBar navItems={NAV_ITEMS} />
    </div>
  )
}
