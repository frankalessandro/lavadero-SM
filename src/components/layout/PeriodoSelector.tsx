import { ChevronLeft, ChevronRight } from 'lucide-react'
import { moverAncla, type ModoPeriodo, type RangoPeriodo } from '../../lib/periodo'

const MODO_LABEL: Record<ModoPeriodo, string> = { dia: 'Día', semana: 'Semana', mes: 'Mes' }

// Navegador de periodo (día/semana/mes) reusable — controla un rango [periodoInicio, periodoFin]
// (ver src/lib/periodo.ts) que ya viene en la forma que espera generarLiquidacion/fetchMontoPeriodo,
// para poder generar o consultar cualquier periodo pasado, no solo "hoy" o "últimos 7 días" fijos.
export function PeriodoSelector({
  modo,
  onModoChange,
  ancla,
  onAnclaChange,
  rango,
}: {
  modo: ModoPeriodo
  onModoChange: (modo: ModoPeriodo) => void
  ancla: Date
  onAnclaChange: (ancla: Date) => void
  rango: RangoPeriodo
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex rounded-lg border border-neutral-300 p-1">
        {(['dia', 'semana', 'mes'] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => onModoChange(value)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              modo === value ? 'bg-primary-600 text-white shadow-nav-active' : 'text-neutral-600 hover:bg-neutral-50'
            }`}
          >
            {MODO_LABEL[value]}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-1 rounded-lg border border-neutral-200 px-1 py-1">
        <button
          type="button"
          onClick={() => onAnclaChange(moverAncla(modo, ancla, -1))}
          aria-label="Periodo anterior"
          className="flex size-7 items-center justify-center rounded-md text-neutral-500 transition-colors hover:bg-neutral-100"
        >
          <ChevronLeft size={16} />
        </button>
        <span className="min-w-[9rem] px-1 text-center text-sm font-medium capitalize text-neutral-700">{rango.label}</span>
        <button
          type="button"
          onClick={() => onAnclaChange(moverAncla(modo, ancla, 1))}
          aria-label="Periodo siguiente"
          className="flex size-7 items-center justify-center rounded-md text-neutral-500 transition-colors hover:bg-neutral-100"
        >
          <ChevronRight size={16} />
        </button>
      </div>
      <button
        type="button"
        onClick={() => onAnclaChange(new Date())}
        className="text-xs font-medium text-primary-600 transition-colors hover:text-primary-700"
      >
        Hoy
      </button>
    </div>
  )
}
