import { useState } from 'react'
import { LogOut } from 'lucide-react'
import logoMark from '../../assets/logo-mark.png'
import { ConfirmModal } from './ConfirmModal'

interface SimpleTopbarProps {
  title: string
  onLogout: () => void
}

// Header liviano para pantallas de una sola tarea (/recepcion, /vigilante) que no usan
// Sidebar/Topbar completos — solo título + logout, sin buscador ni campana.
export function SimpleTopbar({ title, onLogout }: SimpleTopbarProps) {
  const [confirmando, setConfirmando] = useState(false)

  return (
    <header className="mx-auto flex w-full max-w-2xl items-center justify-between gap-4 px-1 pt-4 pb-2">
      <div className="flex items-center gap-2.5">
        <img src={logoMark} alt="Carwash SM" className="size-7 shrink-0 object-contain" />
        <h1 className="font-display text-lg font-bold tracking-tight text-primary-700">{title}</h1>
      </div>
      <button
        type="button"
        onClick={() => setConfirmando(true)}
        className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-neutral-500 transition-colors hover:bg-danger-50 hover:text-danger-700"
      >
        <LogOut size={14} /> Cerrar sesión
      </button>

      {confirmando ? (
        <ConfirmModal
          title="¿Cerrar sesión?"
          message="Vas a salir. Tendrás que volver a iniciar sesión para entrar de nuevo."
          confirmLabel="Cerrar sesión"
          variant="danger"
          onConfirm={async () => {
            await onLogout()
            setConfirmando(false)
          }}
          onCancel={() => setConfirmando(false)}
        />
      ) : null}
    </header>
  )
}
