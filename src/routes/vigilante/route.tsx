import { createFileRoute, Outlet, useNavigate } from '@tanstack/react-router'
import { CircleParking } from 'lucide-react'
import { Topbar } from '../../components/layout/Topbar'
import { signOut } from '../../lib/auth'

export const Route = createFileRoute('/vigilante')({
  component: VigilanteLayout,
})

// Vista única (sin sidebar ni sub-rutas) — el vigilante opera todo desde celular/tablet en un
// solo lugar, pero con el MISMO Topbar que gerencia y jefe de patio. `fixed inset-0` saca el panel
// del contenedor angosto del sitio público.
function VigilanteLayout() {
  const { auth } = Route.useRouteContext()
  const navigate = useNavigate()
  const nombre = auth?.perfil.nombre ?? undefined
  return (
    <div className="fixed inset-0 z-10 flex flex-col bg-neutral-50 text-left">
      <Topbar
        title="Parqueadero"
        eyebrow="Vigilante"
        icon={CircleParking}
        avatarInitial={nombre?.trim().charAt(0).toUpperCase() || 'V'}
        onLogout={signOut}
        multiRol={(auth?.perfil.roles.length ?? 0) > 1}
        onCambiarModulo={() => navigate({ to: '/seleccionar-modulo' })}
        responsable={nombre}
        roleLabel="Vigilante"
      />
      <main className="custom-scroll flex-1 overflow-x-hidden overflow-y-auto p-4 sm:p-6">
        <Outlet />
      </main>
    </div>
  )
}
