import { useState } from 'react'
import { LogOut, Menu } from 'lucide-react'
import { ConfirmModal } from './ConfirmModal'

interface TopbarProps {
  title: string
  avatarInitial: string
  onLogout: () => void
  onMenuClick?: () => void
  /** Quién está a cargo ahora mismo — el responsable del turno abierto si lo hay (Caja/Asistencia
   *  comparten uno solo), o el nombre del perfil autenticado si el rol no maneja turnos (admin). */
  responsable?: string
  roleLabel?: string
}

// Sin buscador ni campana: no hay notificaciones reales en el sistema todavía, y "buscar por
// placa" no aporta nada aquí (recepción/órdenes ya tienen su propio buscador donde sí aplica).
// En su lugar, lo que sí es información real y útil en todo momento: quién es responsable ahora
// y en qué rol — y cerrar sesión pide confirmación porque es una acción que corta el trabajo.
export function Topbar({ title, avatarInitial, onLogout, onMenuClick, responsable, roleLabel }: TopbarProps) {
  const [confirmando, setConfirmando] = useState(false)

  return (
    <header className="flex items-center justify-between gap-4 border-b border-neutral-200 bg-white px-4 py-4 sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        {onMenuClick ? (
          <button
            type="button"
            onClick={onMenuClick}
            aria-label="Abrir menú"
            className="-ml-1 flex size-9 shrink-0 items-center justify-center rounded-lg text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-700 md:hidden"
          >
            <Menu size={20} />
          </button>
        ) : null}
        <h1 className="truncate bg-gradient-to-r from-primary-700 via-primary-600 to-primary-400 bg-clip-text text-xl font-bold tracking-tight text-transparent">
          {title}
        </h1>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {responsable ? (
          <div className="hidden flex-col items-end leading-tight sm:flex">
            <span className="max-w-40 truncate text-sm font-medium text-neutral-800">{responsable}</span>
            {roleLabel ? <span className="text-xs text-neutral-400">{roleLabel}</span> : null}
          </div>
        ) : null}
        <button
          type="button"
          onClick={() => setConfirmando(true)}
          title="Cerrar sesión"
          className="group relative flex size-9 items-center justify-center rounded-full bg-primary-600 text-sm font-semibold text-white shadow-nav-active transition-colors hover:bg-danger-600"
        >
          <span className="group-hover:hidden">{avatarInitial}</span>
          <LogOut size={15} className="hidden group-hover:block" />
        </button>
      </div>

      {confirmando ? (
        <ConfirmModal
          title="¿Cerrar sesión?"
          message="Vas a salir del panel. Tendrás que volver a iniciar sesión para entrar de nuevo."
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
