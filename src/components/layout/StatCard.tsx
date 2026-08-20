import type { ComponentType } from 'react'

interface StatCardProps {
  label: string
  value: string
  hint?: string
  icon: ComponentType<{ size?: number; strokeWidth?: number }>
}

export function StatCard({ label, value, hint, icon: Icon }: StatCardProps) {
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-neutral-200 bg-white p-2 shadow-card transition-shadow hover:shadow-card-hover">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-600">
        <Icon size={20} strokeWidth={2} />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-medium text-neutral-500">{label}</p>
        <p className="text-xl font-semibold text-neutral-900">{value}</p>
        {hint ? <p className="text-xs text-neutral-400">{hint}</p> : null}
      </div>
    </div>
  )
}
