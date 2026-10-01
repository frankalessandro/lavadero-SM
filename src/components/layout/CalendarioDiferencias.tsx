import { Check } from 'lucide-react'
import { copCompacto } from '../../lib/formato'

export type ResumenDia = {
  /** Suma de las diferencias de arqueo de los turnos cerrados del día (− faltante, + sobrante). */
  neto: number
  turnos: number
  /** Turnos cerrados con diferencia distinta de cero. */
  conDiferencia: number
}

const DIAS_SEMANA = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

function claseDia(r: ResumenDia | undefined, elegido: boolean): string {
  const anillo = elegido ? 'ring-2 ring-primary-600 ring-offset-2' : ''
  if (!r) return `cursor-default bg-neutral-50 text-neutral-300 ${anillo}`
  if (r.conDiferencia === 0) return `bg-success-600/10 text-success-700 hover:bg-success-600/20 ${anillo}`
  if (r.neto < 0) return `bg-danger-50 text-danger-700 hover:bg-danger-50/60 ${anillo}`
  return `bg-warning-50 text-warning-700 hover:bg-warning-50/60 ${anillo}`
}

/**
 * Calendario de un mes, a todo el ancho, donde cada día muestra el neto de diferencias de arqueo
 * de sus turnos: rojo = faltó plata, ámbar = sobró, verde = todo cuadró, gris = sin turnos.
 * Tocar un día lo selecciona (de nuevo lo suelta).
 */
export function CalendarioDiferencias({
  mes,
  resumenPorDia,
  seleccionado,
  onSeleccionar,
}: {
  /** `YYYY-MM` */
  mes: string
  /** Clave `YYYY-MM-DD`. */
  resumenPorDia: Map<string, ResumenDia>
  seleccionado: string
  onSeleccionar: (dia: string) => void
}) {
  const [anio, numMes] = mes.split('-').map(Number)
  const primerDia = (new Date(anio, numMes - 1, 1).getDay() + 6) % 7 // lunes = 0
  const diasEnMes = new Date(anio, numMes, 0).getDate()
  const celdas: (number | null)[] = [
    ...Array.from({ length: primerDia }, () => null),
    ...Array.from({ length: diasEnMes }, (_, i) => i + 1),
  ]

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
        {DIAS_SEMANA.map((d) => (
          <span key={d} className="text-center text-[11px] font-medium uppercase tracking-wide text-neutral-400">
            {d}
          </span>
        ))}
        {celdas.map((dia, i) => {
          if (dia === null) return <span key={i} />
          const iso = `${mes}-${String(dia).padStart(2, '0')}`
          const r = resumenPorDia.get(iso)
          const elegido = iso === seleccionado
          return (
            <button
              key={i}
              type="button"
              disabled={!r}
              onClick={() => onSeleccionar(elegido ? '' : iso)}
              title={r ? `${dia}: ${r.turnos} turno(s), ${r.conDiferencia} con diferencia` : `${dia}: sin turnos`}
              className={`flex min-h-16 flex-col items-start justify-between rounded-xl p-1.5 text-left transition-colors sm:min-h-24 sm:p-2.5 ${claseDia(r, elegido)}`}
            >
              <span className="text-xs font-semibold leading-none opacity-70 sm:text-sm">{dia}</span>
              {r ? (
                <span className="flex w-full flex-col items-start gap-0.5 sm:gap-1">
                  {r.conDiferencia === 0 ? (
                    <Check size={16} strokeWidth={2.5} />
                  ) : (
                    <span className="text-[11px] font-semibold leading-none tabular-nums sm:text-base">
                      {r.neto > 0 ? '+' : ''}
                      {copCompacto(r.neto)}
                    </span>
                  )}
                  <span className="hidden text-[11px] leading-none opacity-70 sm:block">
                    {r.turnos} turno{r.turnos === 1 ? '' : 's'}
                  </span>
                </span>
              ) : null}
            </button>
          )
        })}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-neutral-500">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-danger-50 ring-1 ring-danger-700/30" /> Faltó plata
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-warning-50 ring-1 ring-warning-700/30" /> Sobró
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-success-600/10 ring-1 ring-success-700/30" /> Cuadró
        </span>
      </div>
    </div>
  )
}
