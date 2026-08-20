import { createFileRoute, Link, Outlet } from '@tanstack/react-router'
import { Droplets, LayoutGrid } from 'lucide-react'

export const Route = createFileRoute('/recepcion')({
  component: RecepcionLayout,
})

// Vista única, mobile-first, igual que /vigilante — es donde el jefe de zona entra
// siempre desde celular/tablet. `fixed inset-0` la saca del contenedor angosto del sitio público.
function RecepcionLayout() {
  return (
    <div className="fixed inset-0 z-10 flex flex-col overflow-x-hidden overflow-y-auto bg-neutral-50 text-left">
      <header className="flex items-center justify-between gap-2.5 border-b border-neutral-200 bg-white px-4 py-4 sm:px-6">
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-xl bg-primary-600 text-white shadow-nav-active">
            <Droplets size={18} strokeWidth={2.25} />
          </span>
          <div>
            <p className="text-sm font-semibold text-neutral-900">Recepción</p>
            <p className="text-xs text-neutral-400">Jefe de zona</p>
          </div>
        </div>
        <Link
          to="/jefe-zona"
          className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
        >
          <LayoutGrid size={15} />
          Panel
        </Link>
      </header>
      <main className="flex-1 p-4 sm:p-6">
        <Outlet />
      </main>
    </div>
  )
}
