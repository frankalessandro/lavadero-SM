import { Bell, Search } from 'lucide-react'

interface TopbarProps {
  title: string
  searchPlaceholder?: string
  avatarInitial: string
}

export function Topbar({ title, searchPlaceholder, avatarInitial }: TopbarProps) {
  return (
    <header className="flex items-center justify-between gap-4 border-b border-neutral-200 bg-white px-6 py-4">
      <h1 className="text-lg font-semibold text-neutral-900">{title}</h1>
      <div className="flex items-center gap-4">
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
        <div className="flex size-9 items-center justify-center rounded-full bg-primary-600 text-sm font-semibold text-white shadow-nav-active">
          {avatarInitial}
        </div>
      </div>
    </header>
  )
}
