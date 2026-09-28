import { useState } from 'react'
import { createFileRoute, Outlet, useNavigate, useRouterState } from '@tanstack/react-router'
import { Sidebar, type NavItem } from '../../components/layout/Sidebar'
import { Topbar } from '../../components/layout/Topbar'
import { NotificacionesCentro } from '../../components/layout/NotificacionesCentro'
import { fetchAlertas } from '../../data/alertas'
import { exigirRol, signOut } from '../../lib/auth'
import { ADMIN_SECCIONES, ubicacionAdmin } from '../../lib/adminNav'

export const Route = createFileRoute('/admin')({
  beforeLoad: ({ context }) => exigirRol(context.auth, 'admin'),
  component: AdminLayout,
})

// El menú se agrupa por frecuencia de uso (Hoy → Análisis → Gestión → Ajustes) y su definición
// vive en src/lib/adminNav.ts, compartida con las pestañas de cada sección y el título del Topbar.
const NAV_ITEMS: NavItem[] = ADMIN_SECCIONES.map(({ to, label, icon, exact, grupo }) => ({
  to,
  label,
  icon,
  exact,
  grupo,
}))

// `fixed inset-0` saca el panel del contenedor angosto (#root) del sitio público.
// La navegación por debajo de `md` vive en el drawer del hamburguesa del Topbar.
function AdminLayout() {
  const { auth } = Route.useRouteContext()
  const navigate = useNavigate()
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const [menuOpen, setMenuOpen] = useState(false)
  const multiRol = (auth?.perfil.roles.length ?? 0) > 1
  const { seccion, seccionTo, icon, pagina } = ubicacionAdmin(pathname)
  const nombre = auth?.perfil.nombre ?? undefined
  return (
    <div className="fixed inset-0 z-10 flex bg-neutral-50 text-left">
      <Sidebar
        navItems={NAV_ITEMS}
        roleLabel="Gerencia"
        usuario={nombre}
        mobileOpen={menuOpen}
        onMobileClose={() => setMenuOpen(false)}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          title={pagina ?? seccion}
          eyebrow={pagina ? seccion : 'Gerencia'}
          eyebrowTo={pagina ? seccionTo : '/admin'}
          icon={icon}
          avatarInitial={nombre?.trim().charAt(0).toUpperCase() || 'A'}
          onLogout={signOut}
          multiRol={multiRol}
          onCambiarModulo={() => navigate({ to: '/seleccionar-modulo' })}
          onMenuClick={() => setMenuOpen(true)}
          notificaciones={<NotificacionesCentro cargarAlertas={fetchAlertas} />}
        />
        <main className="custom-scroll flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-7xl p-4 sm:p-6 lg:p-8">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
