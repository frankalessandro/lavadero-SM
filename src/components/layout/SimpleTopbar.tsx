import { LogOut } from 'lucide-react'

interface SimpleTopbarProps {
  title: string
  onLogout: () => void
}

// Header liviano para pantallas de una sola tarea (/recepcion, /vigilante) que no usan
// Sidebar/Topbar completos — solo título + logout, sin buscador ni campana.
export function SimpleTopbar({ title, onLogout }: SimpleTopbarProps) {
  return (
    <header className="mx-auto flex w-full max-w-2xl items-center justify-between gap-4 px-1 pt-4 pb-2">
      <h1 className="text-base font-semibold text-neutral-900">{title}</h1>
      <button
        type="button"
        onClick={onLogout}
        className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-neutral-500 transition-colors hover:bg-danger-50 hover:text-danger-700"
      >
        <LogOut size={14} /> Cerrar sesión
      </button>
    </header>
  )
}
