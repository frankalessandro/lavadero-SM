import { Bell, LogOut, Menu, Search } from 'lucide-react'

interface TopbarProps {
  title: string
  searchPlaceholder?: string
  avatarInitial: string
  onLogout: () => void
  onMenuClick?: () => void
}

export function Topbar({ title, searchPlaceholder, avatarInitial, onLogout, onMenuClick }: TopbarProps) {
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
        <h1 className="truncate text-lg font-semibold text-neutral-900">{title}</h1>
      </div>
      <div className="flex shrink-0 items-center gap-4">
        {searchPlaceholder ? (
          <div className="hidden items-center gap-2 rounded-lg border border-neutral-200 bg-primary-50/60 px-3 py-2 text-sm text-neutral-500 transition-colors focus-within:border-primary-300 sm:flex">
            <Search size={16} className="text-primary-500" />
            <span>{searchPlaceholder}</span>
          </div>
        ) : null}
        <button
          type="button"
          className="flex size-9 items-center justify-center rounded-full bg-neutral-100 text-neutral-500 transition-colors hover:bg-primary-50 hover:text-primary-600"
        >
          <Bell size={17} />
        </button>
        <button
          type="button"
          onClick={onLogout}
          title="Cerrar sesión"
          className="group relative flex size-9 items-center justify-center rounded-full bg-primary-600 text-sm font-semibold text-white shadow-nav-active transition-colors hover:bg-danger-600"
        >
          <span className="group-hover:hidden">{avatarInitial}</span>
          <LogOut size={15} className="hidden group-hover:block" />
        </button>
      </div>
    </header>
  )
}
