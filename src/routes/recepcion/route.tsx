import { createFileRoute, Link, Outlet, useNavigate } from '@tanstack/react-router'
import { ClipboardPlus, LayoutDashboard } from 'lucide-react'
import { Topbar } from '../../components/layout/Topbar'
import { signOut } from '../../lib/auth'

export const Route = createFileRoute('/recepcion')({
  component: RecepcionLayout,
})

// Pantalla de una sola tarea, mobile-first (el jefe de patio la usa desde celular/tablet en el
// mostrador): sin Sidebar, pero con el MISMO Topbar que el resto del sistema, y un atajo de vuelta
// al panel de seguimiento. `fixed inset-0` la saca del contenedor angosto del sitio público.
function RecepcionLayout() {
  const { auth } = Route.useRouteContext()
  const navigate = useNavigate()
  const nombre = auth?.perfil.nombre ?? undefined
  return (
    <div className="fixed inset-0 z-10 flex flex-col bg-neutral-50 text-left">
      <Topbar
        title="Recepción"
        eyebrow="Jefe de patio"
        eyebrowTo="/jefe-zona"
        icon={ClipboardPlus}
        avatarInitial={nombre?.trim().charAt(0).toUpperCase() || 'J'}
        onLogout={signOut}
        multiRol={(auth?.perfil.roles.length ?? 0) > 1}
        onCambiarModulo={() => navigate({ to: '/seleccionar-modulo' })}
        notificaciones={
          <Link
            to="/jefe-zona"
            className="flex items-center gap-1.5 rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm font-medium text-neutral-600 transition-colors hover:bg-neutral-50 hover:text-neutral-900"
          >
            <LayoutDashboard size={16} />
            <span className="hidden sm:inline">Seguimiento</span>
          </Link>
        }
      />
      <main className="custom-scroll flex-1 overflow-x-hidden overflow-y-auto p-4 sm:p-6">
        <Outlet />
      </main>
    </div>
  )
}
