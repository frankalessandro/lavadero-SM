import { createFileRoute, Outlet } from '@tanstack/react-router'
import { Droplets } from 'lucide-react'

export const Route = createFileRoute('/vigilante')({
  component: VigilanteLayout,
})

// Vista única (sin sidebar ni sub-rutas) — el vigilante opera todo desde celular/tablet
// en un solo lugar. `fixed inset-0` saca el panel del contenedor angosto del sitio público.
function VigilanteLayout() {
  return (
    <div className="fixed inset-0 z-10 flex flex-col overflow-y-auto bg-neutral-50 text-left">
      <header className="flex items-center gap-2.5 border-b border-neutral-200 bg-white px-4 py-4 sm:px-6">
        <span className="flex size-9 items-center justify-center rounded-xl bg-primary-600 text-white shadow-nav-active">
          <Droplets size={18} strokeWidth={2.25} />
        </span>
        <div>
          <p className="text-sm font-semibold text-neutral-900">Parqueadero</p>
          <p className="text-xs text-neutral-400">Vigilante</p>
        </div>
      </header>
      <main className="flex-1 p-4 sm:p-6">
        <Outlet />
      </main>
    </div>
  )
}
