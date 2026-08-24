import { useState, type ComponentType } from 'react'
import { Info } from 'lucide-react'
import { InfoModal } from './InfoModal'

interface StatCardProps {
  label: string
  value: string
  hint?: string
  icon: ComponentType<{ size?: number; strokeWidth?: number }>
  /** Explicación opcional de qué significa la cifra — agrega un botón "i" que abre un InfoModal
   *  en vez de un tooltip, para que quepa una explicación completa (ej. qué SÍ y qué NO incluye
   *  "Caja del día") sin depender de hover, que no existe en celular/tablet. */
  info?: { title: string; description: string }
}

export function StatCard({ label, value, hint, icon: Icon, info }: StatCardProps) {
  const [mostrandoInfo, setMostrandoInfo] = useState(false)
  return (
    <div className="relative flex items-center gap-4 rounded-2xl border border-neutral-200 bg-white p-2 shadow-card transition-shadow hover:shadow-card-hover">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-600">
        <Icon size={20} strokeWidth={2} />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-medium text-neutral-500">{label}</p>
        <p className="text-xl font-semibold text-neutral-900">{value}</p>
        {hint ? <p className="text-xs text-neutral-400">{hint}</p> : null}
      </div>
      {info ? (
        <button
          type="button"
          onClick={() => setMostrandoInfo(true)}
          aria-label={`Qué significa ${label}`}
          className="absolute right-2 top-2 flex size-6 items-center justify-center rounded-full text-neutral-300 transition-colors hover:bg-neutral-100 hover:text-primary-600"
        >
          <Info size={14} />
        </button>
      ) : null}
      {info && mostrandoInfo ? (
        <InfoModal title={info.title} description={info.description} onClose={() => setMostrandoInfo(false)} />
      ) : null}
    </div>
  )
}
