import { useState, type ComponentType, type ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { ChevronRight, LayoutGrid, LogOut, Menu } from 'lucide-react'
import { ConfirmModal } from './ConfirmModal'
import { BuscadorPlaca } from './BuscadorPlaca'

interface TopbarProps {
  title: string
  /** Sección a la que pertenece la pantalla — va encima del título, en pequeño (ej. "Dinero"). */
  eyebrow?: string
  /** Con `eyebrow`: la sección se vuelve enlace a su pantalla. */
  eyebrowTo?: string
  /** Ícono de la sección, en una ficha a la izquierda del título. */
  icon?: ComponentType<{ size?: number; strokeWidth?: number }>
  avatarInitial: string
  onLogout: () => void
  onMenuClick?: () => void
  /** Quién está a cargo ahora mismo — el responsable del turno abierto si lo hay (Caja/Asistencia
   *  comparten uno solo), o el nombre del perfil autenticado si el rol no maneja turnos (admin). */
  responsable?: string
  roleLabel?: string
  /** Cuenta con más de un rol: el avatar-botón pasa a "Cambiar de módulo" (vuelve al selector)
   *  en vez de cerrar sesión — el logout real vive en el selector. */
  multiRol?: boolean
  onCambiarModulo?: () => void
  /** Slot junto al avatar — hoy solo admin pasa `<NotificacionesCentro />` acá (las alertas que
   *  agrega son todas de datos que solo admin ve). El buscador de placa va aparte y es para todos. */
  notificaciones?: ReactNode
}

export function Topbar({
  title,
  eyebrow,
  eyebrowTo,
  icon: Icon,
  avatarInitial,
  onLogout,
  onMenuClick,
  responsable,
  roleLabel,
  multiRol = false,
  onCambiarModulo,
  notificaciones,
}: TopbarProps) {
  const [confirmando, setConfirmando] = useState(false)

  return (
    <header className="flex h-[4.5rem] shrink-0 items-center justify-between gap-4 border-b border-neutral-200 bg-white px-4 sm:px-6 lg:px-8">
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
        {eyebrow ? (
          <div className="flex min-w-0 items-center gap-3">
            {Icon ? (
              <span className="hidden size-10 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-600 ring-1 ring-primary-100 sm:flex">
                <Icon size={19} strokeWidth={2} />
              </span>
            ) : null}
            <div className="min-w-0 leading-tight">
              <nav aria-label="Ubicación" className="flex min-w-0 items-center gap-1 text-xs font-medium text-neutral-400">
                {eyebrowTo ? (
                  <Link to={eyebrowTo} className="truncate transition-colors hover:text-primary-600">
                    {eyebrow}
                  </Link>
                ) : (
                  <span className="truncate">{eyebrow}</span>
                )}
                <ChevronRight size={12} className="shrink-0 text-neutral-300" />
              </nav>
              <h1 className="truncate text-lg font-semibold tracking-tight text-neutral-900 sm:text-xl">{title}</h1>
            </div>
          </div>
        ) : (
          <h1 className="truncate bg-gradient-to-r from-primary-700 via-primary-600 to-primary-400 bg-clip-text font-display text-xl font-bold tracking-tight text-transparent">
            {title}
          </h1>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <BuscadorPlaca />
        {notificaciones}
        {responsable ? (
          <div className="hidden flex-col items-end leading-tight sm:flex">
            <span className="max-w-40 truncate text-sm font-medium text-neutral-800">{responsable}</span>
            {roleLabel ? <span className="text-xs text-neutral-400">{roleLabel}</span> : null}
          </div>
        ) : null}
        {multiRol ? (
          <button
            type="button"
            onClick={onCambiarModulo}
            title="Cambiar de módulo"
            className="group relative flex size-9 items-center justify-center rounded-full bg-primary-600 text-sm font-semibold text-white shadow-nav-active transition-colors hover:bg-primary-700"
          >
            <span className="group-hover:hidden">{avatarInitial}</span>
            <LayoutGrid size={15} className="hidden group-hover:block" />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmando(true)}
            title="Cerrar sesión"
            className="group relative flex size-9 items-center justify-center rounded-full bg-primary-600 text-sm font-semibold text-white shadow-nav-active transition-colors hover:bg-danger-600"
          >
            <span className="group-hover:hidden">{avatarInitial}</span>
            <LogOut size={15} className="hidden group-hover:block" />
          </button>
        )}
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
