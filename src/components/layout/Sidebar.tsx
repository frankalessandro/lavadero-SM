import { Link } from '@tanstack/react-router'
import type { ComponentType } from 'react'
import { X } from 'lucide-react'
import logoIsotipo from '../../assets/logo-isotipo.png'

export interface NavItem {
  to: string
  label: string
  icon: ComponentType<{ size?: number; strokeWidth?: number }>
  /**
   * Por defecto un ítem solo se marca activo en su ruta exacta. Los ítems que son una SECCIÓN con
   * pestañas adentro necesitan `exact: false` para seguir resaltados mientras se navega entre sus
   * pestañas hijas. `/admin` (Dashboard) debe quedarse en `true`, si no coincidiría con todo el panel.
   */
  exact?: boolean
  /** Encabezado bajo el que se agrupa el ítem — ítems consecutivos con el mismo grupo van juntos. */
  grupo?: string
}

interface SidebarProps {
  navItems: NavItem[]
  roleLabel: string
  /** Nombre de la persona conectada — se muestra en el pie del menú. */
  usuario?: string
  /** Cuando se pasa junto con `onMobileClose`, además del sidebar fijo de escritorio se
   *  renderiza una hoja lateral (drawer) por debajo de `md`, abierta desde el hamburguesa del Topbar. */
  mobileOpen?: boolean
  onMobileClose?: () => void
}

function SidebarContent({
  navItems,
  roleLabel,
  usuario,
  onNavigate,
  onClose,
}: {
  navItems: NavItem[]
  roleLabel: string
  usuario?: string
  onNavigate?: () => void
  onClose?: () => void
}) {
  return (
    <>
      <div className="flex h-[4.5rem] shrink-0 items-center gap-2.5 border-b border-neutral-200 px-5">
        <img src={logoIsotipo} alt="" className="h-9 w-9 shrink-0 object-contain" />
        <div className="min-w-0 flex-1 leading-tight">
          <span className="block font-display text-base font-bold tracking-tight text-neutral-900">Carwash SM</span>
          <span className="block text-[11px] font-medium text-neutral-400">{roleLabel}</span>
        </div>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar menú"
            className="flex size-8 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
          >
            <X size={18} />
          </button>
        ) : null}
      </div>

      <nav className="custom-scroll flex min-h-0 flex-1 flex-col overflow-y-auto px-3 pt-4 pb-4">
        {navItems.map(({ to, label, icon: Icon, exact = true, grupo }, i) => {
          const nuevoGrupo = grupo && grupo !== navItems[i - 1]?.grupo
          return (
            <div key={to} className="flex flex-col">
              {nuevoGrupo ? (
                <span className={`px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-400 ${i === 0 ? 'pt-1' : 'pt-5'}`}>
                  {grupo}
                </span>
              ) : null}
              <Link
                to={to}
                activeOptions={{ exact }}
                onClick={onNavigate}
                className="group my-0.5 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
                activeProps={{ className: '!bg-primary-600 !text-white shadow-nav-active hover:!bg-primary-600' }}
              >
                <Icon size={18} strokeWidth={2} />
                <span className="truncate">{label}</span>
              </Link>
            </div>
          )
        })}
      </nav>

      {usuario ? (
        <div className="mx-3 mb-4 flex items-center gap-3 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary-100 text-xs font-bold text-primary-700">
            {usuario.trim().charAt(0).toUpperCase()}
          </span>
          <span className="min-w-0 leading-tight">
            <span className="block truncate text-sm font-medium text-neutral-800">{usuario}</span>
            <span className="block text-[11px] text-neutral-400">{roleLabel}</span>
          </span>
        </div>
      ) : (
        <div className="px-6 py-5 text-xs font-medium text-neutral-400">{roleLabel}</div>
      )}
    </>
  )
}

export function Sidebar({ navItems, roleLabel, usuario, mobileOpen = false, onMobileClose }: SidebarProps) {
  return (
    <>
      <aside className="hidden w-64 shrink-0 flex-col border-r border-neutral-200 bg-white md:flex">
        <SidebarContent navItems={navItems} roleLabel={roleLabel} usuario={usuario} />
      </aside>

      {onMobileClose ? (
        <div className={`fixed inset-0 z-40 md:hidden ${mobileOpen ? '' : 'pointer-events-none'}`} aria-hidden={!mobileOpen}>
          <div
            className={`absolute inset-0 bg-neutral-900/40 backdrop-blur-[2px] transition-opacity duration-200 ${mobileOpen ? 'opacity-100' : 'opacity-0'}`}
            onClick={onMobileClose}
          />
          <aside
            className={`absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-white shadow-card-hover transition-transform duration-200 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}
          >
            <SidebarContent
              navItems={navItems}
              roleLabel={roleLabel}
              usuario={usuario}
              onNavigate={onMobileClose}
              onClose={onMobileClose}
            />
          </aside>
        </div>
      ) : null}
    </>
  )
}
