import { createRootRoute, Link, Outlet } from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'

export const Route = createRootRoute({
  component: RootLayout,
  pendingComponent: () => <div className="route-status">Cargando…</div>,
  errorComponent: ({ error }) => (
    <div className="route-status route-status--error">
      <p>Algo salió mal.</p>
      <pre>{error.message}</pre>
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
  return (
    <>
      <nav className="nav">
        <Link to="/" activeOptions={{ exact: true }} activeProps={{ className: 'active' }}>
          Inicio
        </Link>
        <Link to="/services" activeProps={{ className: 'active' }}>
          Servicios
        </Link>
      </nav>
      <Outlet />
      {import.meta.env.DEV ? <TanStackRouterDevtools position="bottom-right" /> : null}
    </>
  )
}
