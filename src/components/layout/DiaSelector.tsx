import { ChevronLeft, ChevronRight } from 'lucide-react'
import { fechaLocalISO, sumarDiasISO } from '../../lib/periodo'

const FECHA_LARGA = new Intl.DateTimeFormat('es-CO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

// Selector de UN día (YYYY-MM-DD, hora local): flechas al día anterior/siguiente, calendario para
// saltar a cualquier fecha y atajo "Hoy". Para cortes por día (colilla informativa) donde
// PeriodoSelector —que también ofrece semana y mes— sobra. No deja elegir un día futuro.
export function DiaSelector({ dia, onChange }: { dia: string; onChange: (dia: string) => void }) {
  const hoy = fechaLocalISO(new Date())
  const esHoy = dia === hoy
  const [y, m, d] = dia.split('-').map(Number)

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1 rounded-lg border border-neutral-200 px-1 py-1">
        <button
          type="button"
          onClick={() => onChange(sumarDiasISO(dia, -1))}
          aria-label="Día anterior"
          className="flex size-7 items-center justify-center rounded-md text-neutral-500 transition-colors hover:bg-neutral-100"
        >
          <ChevronLeft size={16} />
        </button>
        <input
          type="date"
          value={dia}
          max={hoy}
          onChange={(e) => {
            if (e.target.value) onChange(e.target.value > hoy ? hoy : e.target.value)
          }}
          aria-label="Día"
          className="rounded-md bg-transparent px-1 py-1 text-sm font-medium text-neutral-700 outline-none"
        />
        <button
          type="button"
          disabled={esHoy}
          onClick={() => onChange(sumarDiasISO(dia, 1))}
          aria-label="Día siguiente"
          className="flex size-7 items-center justify-center rounded-md text-neutral-500 transition-colors hover:bg-neutral-100 disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <ChevronRight size={16} />
        </button>
      </div>
      <span className="text-sm capitalize text-neutral-500">{FECHA_LARGA.format(new Date(y, m - 1, d))}</span>
      {esHoy ? null : (
        <button
          type="button"
          onClick={() => onChange(hoy)}
          className="text-xs font-medium text-primary-600 transition-colors hover:text-primary-700"
        >
          Hoy
        </button>
      )}
    </div>
  )
}
