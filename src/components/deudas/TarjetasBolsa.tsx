import type { ReactNode } from 'react'
import { Banknote, ShoppingBasket } from 'lucide-react'
import { BOLSA_DEUDA_LABEL, type BolsaDeuda, type SaldoDeuda } from '../../schemas/deudaPersonal'

const COP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })

const ESTILO: Record<BolsaDeuda, { icono: typeof Banknote; ayuda: string; tono: string; activo: string }> = {
  prestamo: {
    icono: Banknote,
    ayuda: 'Plata prestada de la caja',
    tono: 'bg-warning-50 text-warning-700',
    activo: 'border-warning-600/40 bg-warning-50/50 ring-1 ring-warning-600/30',
  },
  tienda: {
    icono: ShoppingBasket,
    ayuda: 'Nevera y faltantes cobrados',
    tono: 'bg-primary-50 text-primary-700',
    activo: 'border-primary-400 bg-primary-50/50 ring-1 ring-primary-400',
  },
}

// Las dos bolsas de deuda de una persona (0089) lado a lado: préstamos y tienda. Con
// `onSeleccionar` cada tarjeta es un botón (elegir a qué se abona); `extra` mete contenido debajo
// de cada una (el monto a descontar en la liquidación). Una bolsa en $0 no se puede elegir.
export function TarjetasBolsa({
  saldo,
  seleccionada,
  onSeleccionar,
  extra,
}: {
  saldo: SaldoDeuda | undefined
  seleccionada?: BolsaDeuda
  onSeleccionar?: (bolsa: BolsaDeuda) => void
  extra?: (bolsa: BolsaDeuda) => ReactNode
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {(['prestamo', 'tienda'] as const).map((bolsa) => {
        const { icono: Icono, ayuda, tono, activo } = ESTILO[bolsa]
        const monto = saldo ? Math.max(0, saldo[bolsa]) : undefined
        const elegible = onSeleccionar && (monto ?? 0) > 0
        const marcada = seleccionada === bolsa
        const contenido = (
          <>
            <span className="flex items-center gap-2">
              <span className={`flex size-7 shrink-0 items-center justify-center rounded-lg ${tono}`}>
                <Icono size={15} />
              </span>
              <span className="text-xs font-semibold text-neutral-700">{BOLSA_DEUDA_LABEL[bolsa]}</span>
            </span>
            <span className={`font-mono text-lg font-bold tabular-nums ${monto ? 'text-neutral-900' : 'text-neutral-300'}`}>
              {monto === undefined ? '…' : COP.format(monto)}
            </span>
            <span className="text-[11px] leading-tight text-neutral-500">
              {bolsa === 'tienda' && saldo && saldo.enCuenta > 0 ? `${COP.format(saldo.enCuenta)} en cuenta abierta` : ayuda}
            </span>
          </>
        )
        const base = 'flex min-w-0 flex-col gap-1.5 rounded-xl border p-3 text-left transition-colors'
        return (
          <div key={bolsa} className="flex min-w-0 flex-col gap-2">
            {onSeleccionar ? (
              <button
                type="button"
                disabled={!elegible}
                onClick={() => onSeleccionar(bolsa)}
                aria-pressed={marcada}
                className={`${base} ${
                  marcada ? activo : 'border-neutral-200 bg-white hover:border-neutral-300 hover:bg-neutral-50'
                } disabled:cursor-not-allowed disabled:opacity-50`}
              >
                {contenido}
              </button>
            ) : (
              <div className={`${base} border-neutral-200 bg-white`}>{contenido}</div>
            )}
            {extra ? extra(bolsa) : null}
          </div>
        )
      })}
    </div>
  )
}
