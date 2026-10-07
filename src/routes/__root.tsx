import { createRootRouteWithContext, Link, Outlet, useRouterState } from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'
import type { AuthContext } from '../lib/auth'
import { PantallaCarga } from '../components/layout/PantallaCarga'

export interface RouterContext {
  auth: AuthContext | null
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
  pendingComponent: () => <PantallaCarga />,
  errorComponent: ({ error }) => (
    <div className="route-status route-status--error">
      <p>Algo salió mal.</p>
      <pre className="whitespace-pre-wrap break-words">{error.message}</pre>
    </div>
  ),
  notFoundComponent: () => (
    <div className="route-status">
      <p>Página no encontrada.</p>
      <Link to="/">Volver al inicio</Link>
    </div>
  ),
})

function RootLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  // El menú de enlaces es del sitio público de demostración: en los paneles (que lo tapaban con
  // `fixed inset-0`) se veía un instante detrás del loader o mientras cargaba cada pantalla.
  const mostrarMenuPublico = pathname.startsWith('/services')
  return (
    <>
      {mostrarMenuPublico ? (
      <nav className="nav flex-wrap">
        <Link to="/" activeOptions={{ exact: true }} activeProps={{ className: 'active' }}>
          Inicio
        </Link>
        <Link to="/services" activeProps={{ className: 'active' }}>
          Servicios
        </Link>
        <Link to="/admin" activeProps={{ className: 'active' }}>
          Admin
        </Link>
        <Link to="/jefe-zona" activeProps={{ className: 'active' }}>
          Jefe de patio
        </Link>
        <Link to="/recepcion" activeProps={{ className: 'active' }}>
          Recepción
        </Link>
        <Link to="/vigilante" activeProps={{ className: 'active' }}>
          Vigilante
        </Link>
      </nav>
      ) : null}
      <Outlet />
      {import.meta.env.DEV ? <TanStackRouterDevtools position="bottom-right" /> : null}
    </>
  )
}
