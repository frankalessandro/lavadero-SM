import type { ComponentType } from 'react'
import { TrendingUp, TrendingDown, ArrowRight } from 'lucide-react'
import type { DeltaKpi } from '../../lib/kpi'

// Tarjeta de cifra grande con comparación contra un periodo previo — el lenguaje visual que
// comparten el dashboard de admin (hoy vs. ayer) y /admin/rentabilidad (periodo vs. periodo
// anterior). Vive acá para que las dos pantallas no se separen visualmente con el tiempo.
// El helper `calcularDelta` va en `src/lib/kpi.ts` (react-refresh/only-export-components).

export type TonoKpi = 'verde' | 'rojo' | 'rojo-suave' | 'neutro'

const TONO: Record<TonoKpi, { caja: string; num: string; chip: string }> = {
  verde: {
    caja: 'border-success-600/25 bg-success-50',
    num: 'text-success-700',
    chip: 'bg-success-600/10 text-success-700',
  },
  rojo: {
    caja: 'border-danger-600/25 bg-danger-50',
    num: 'text-danger-600',
    chip: 'bg-danger-600/10 text-danger-700',
  },
  'rojo-suave': {
    caja: 'border-neutral-200 bg-white',
    num: 'text-neutral-900',
    chip: 'bg-danger-50 text-danger-600',
  },
  neutro: {
    caja: 'border-neutral-200 bg-white',
    num: 'text-neutral-900',
    chip: 'bg-primary-50 text-primary-600',
  },
}

const TONO_DELTA: Record<string, string> = {
  verde: 'bg-success-600/10 text-success-700',
  rojo: 'bg-danger-600/10 text-danger-700',
  neutro: 'bg-neutral-100 text-neutral-500',
}

const ICONO_DELTA = { sube: TrendingUp, baja: TrendingDown, igual: ArrowRight }

export function KpiCard({
  label,
  valor,
  tono,
  icon: Icon,
  delta,
  sinComparacionLabel = 'sin periodo anterior para comparar',
}: {
  label: string
  valor: string
  tono: TonoKpi
  icon: ComponentType<{ size?: number; strokeWidth?: number }>
  delta?: DeltaKpi | null
  sinComparacionLabel?: string
}) {
  const t = TONO[tono]
  const IconoDelta = delta ? ICONO_DELTA[delta.direccion] : null
  return (
    <div className={`flex flex-col gap-3 rounded-2xl border p-4 shadow-card ${t.caja}`}>
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-medium leading-snug text-neutral-500">{label}</span>
        <span className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${t.chip}`}>
          <Icon size={16} strokeWidth={2} />
        </span>
      </div>
      <span className={`text-3xl font-semibold tracking-tight tabular-nums ${t.num}`}>{valor}</span>
      {delta && IconoDelta ? (
        <span
          className={`inline-flex w-fit items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-medium ${TONO_DELTA[delta.tono]}`}
        >
          <IconoDelta size={12} />
          {delta.texto}
        </span>
      ) : (
        <span className="text-[11px] text-neutral-400">{sinComparacionLabel}</span>
      )}
    </div>
  )
}
