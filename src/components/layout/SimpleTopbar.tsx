import { useState } from 'react'
import { LayoutGrid, LogOut } from 'lucide-react'
import logoMark from '../../assets/logo-mark.png'
import { ConfirmModal } from './ConfirmModal'

interface SimpleTopbarProps {
  title: string
  onLogout: () => void
  /** Cuenta con más de un rol: el botón pasa a "Cambiar de módulo" (vuelve al selector) en vez
   *  de cerrar sesión — el logout real vive en el selector. */
  multiRol?: boolean
  onCambiarModulo?: () => void
}

// Header liviano para pantallas de una sola tarea (/recepcion, /vigilante) que no usan
// Sidebar/Topbar completos — solo título + acción de salida, sin buscador ni campana.
export function SimpleTopbar({ title, onLogout, multiRol = false, onCambiarModulo }: SimpleTopbarProps) {
  const [confirmando, setConfirmando] = useState(false)

  return (
    <header className="mx-auto flex w-full max-w-2xl items-center justify-between gap-4 px-1 pt-4 pb-2">
      <div className="flex items-center gap-2.5">
        <img src={logoMark} alt="Carwash SM" className="size-7 shrink-0 object-contain" />
        <h1 className="text-lg font-semibold tracking-tight text-neutral-900">{title}</h1>
      </div>
      {multiRol ? (
        <button
          type="button"
          onClick={onCambiarModulo}
          className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-neutral-500 transition-colors hover:bg-primary-50 hover:text-primary-700"
        >
          <LayoutGrid size={14} /> Cambiar de módulo
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setConfirmando(true)}
          className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-neutral-500 transition-colors hover:bg-danger-50 hover:text-danger-700"
        >
          <LogOut size={14} /> Cerrar sesión
        </button>
      )}

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
