import { useState } from 'react'
import { createFileRoute, Outlet, useNavigate, useRouterState } from '@tanstack/react-router'
import { Sidebar, type NavItem } from '../../components/layout/Sidebar'
import { Topbar } from '../../components/layout/Topbar'
import { NotificacionesCentro } from '../../components/layout/NotificacionesCentro'
import { exigirRol, signOut } from '../../lib/auth'
import { fetchTurnoAbierto } from '../../data/turnos'
import { fetchAlertasJefeZona } from '../../data/alertas'
import { JEFE_ZONA_SECCIONES, ubicacionJefeZona } from '../../lib/jefeZonaNav'

export const Route = createFileRoute('/jefe-zona')({
  beforeLoad: ({ context }) => exigirRol(context.auth, 'jefe_zona'),
  // Un solo turno compartido entre Caja y Asistencia (ver TurnoResponsableBanner) — se carga acá,
  // a nivel de layout, para que el Topbar pueda mostrar "quién está a cargo ahora" en cualquier
  // pantalla del área. `router.invalidate()` (ya disparado por abrir/cerrar/transferir turno)
  // refresca este loader igual que los de las páginas.
  loader: () => fetchTurnoAbierto('jefe_zona'),
  component: JefeZonaLayout,
})

const NAV_ITEMS: NavItem[] = JEFE_ZONA_SECCIONES.map(({ to, label, icon, grupo }) => ({ to, label, icon, grupo }))

// Mismo shell que gerencia (menú agrupado + "Sección › Pantalla" en el Topbar) para que las áreas
// se sientan como un solo sistema.
function JefeZonaLayout() {
  const turno = Route.useLoaderData()
  const { auth } = Route.useRouteContext()
  const navigate = useNavigate()
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const [menuOpen, setMenuOpen] = useState(false)
  const multiRol = (auth?.perfil.roles.length ?? 0) > 1
  const { seccion, icon } = ubicacionJefeZona(pathname)
  const nombre = auth?.perfil.nombre ?? undefined
  return (
    <div className="fixed inset-0 z-10 flex bg-neutral-50 text-left">
      <Sidebar
        navItems={NAV_ITEMS}
        roleLabel="Jefe de patio"
        usuario={nombre}
        mobileOpen={menuOpen}
        onMobileClose={() => setMenuOpen(false)}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          title={seccion}
          eyebrow="Jefe de patio"
          eyebrowTo="/jefe-zona"
          icon={icon}
          avatarInitial={nombre?.trim().charAt(0).toUpperCase() || 'J'}
          onLogout={signOut}
          multiRol={multiRol}
          onCambiarModulo={() => navigate({ to: '/seleccionar-modulo' })}
          onMenuClick={() => setMenuOpen(true)}
          responsable={turno?.responsableActual ?? 'Sin turno abierto'}
          roleLabel="A cargo del turno"
          notificaciones={<NotificacionesCentro cargarAlertas={fetchAlertasJefeZona} />}
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
