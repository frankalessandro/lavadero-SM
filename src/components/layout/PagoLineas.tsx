import { Plus, X } from 'lucide-react'
import { CurrencyInput } from './CurrencyInput'
import { METODO_PAGO_LABEL } from '../../lib/metodoPago'
import { MAX_LINEAS_PAGO, nuevaLineaBorrador, sumaBorrador, type PagoLineaBorrador } from '../../lib/pagoLineas'
import type { MetodoPagoBase } from '../../schemas/orden'

const COP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })
const METODOS: MetodoPagoBase[] = ['efectivo', 'transferencia', 'datafono']

// Editor de líneas de pago (pago partido). Controlado: el padre guarda `lineas` y decide si el
// submit está habilitado con `pagoLineasCuadra` (src/lib/pagoLineas.ts). Compartido por el cobro
// de orden, la venta de mostrador y el modal de corrección de reparto.
export function PagoLineas({
  lineas,
  onChange,
  total,
  size = 'md',
  totalLabel = 'Total a cobrar',
}: {
  lineas: PagoLineaBorrador[]
  onChange: (lineas: PagoLineaBorrador[]) => void
  total: number
  size?: 'sm' | 'md'
  totalLabel?: string
}) {
  const asignado = sumaBorrador(lineas)
  const resto = total - asignado
  const inputBase = size === 'sm' ? 'px-3 py-2.5 text-sm' : 'px-3 py-3 text-base'

  function actualizar(i: number, patch: Partial<PagoLineaBorrador>) {
    onChange(lineas.map((l, j) => (j === i ? { ...l, ...patch } : l)))
  }
  function quitar(i: number) {
    onChange(lineas.filter((_, j) => j !== i))
  }
  function agregar() {
    onChange([...lineas, nuevaLineaBorrador(Math.max(resto, 0))])
  }

  return (
    <div className="flex flex-col gap-3">
      {lineas.map((linea, i) => (
        <div key={i} className="flex flex-col gap-2 rounded-lg border border-neutral-200 p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-neutral-500">
              {lineas.length > 1 ? `Medio ${i + 1}` : 'Medio de pago'}
            </span>
            {lineas.length > 1 ? (
              <button
                type="button"
                onClick={() => quitar(i)}
                className="flex size-6 items-center justify-center rounded text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-danger-600"
                aria-label="Quitar medio de pago"
              >
                <X size={14} />
              </button>
            ) : null}
          </div>

          <div className="grid grid-cols-3 gap-2">
            {METODOS.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => actualizar(i, { metodo: m })}
                className={`rounded-lg border px-2 py-2 text-xs font-medium transition-colors ${
                  linea.metodo === m
                    ? 'border-primary-600 bg-primary-50 text-primary-700'
                    : 'border-neutral-200 text-neutral-600 hover:bg-neutral-50'
                }`}
              >
                {METODO_PAGO_LABEL[m]}
              </button>
            ))}
          </div>

          <CurrencyInput value={linea.monto} onChange={(v) => actualizar(i, { monto: v })} size={size} />

          {linea.metodo === 'transferencia' || linea.metodo === 'datafono' ? (
            <input
              value={linea.referencia}
              onChange={(e) => actualizar(i, { referencia: e.target.value })}
              placeholder="Referencia / comprobante"
              className={`rounded-lg border border-neutral-300 outline-none transition-colors focus:border-primary-500 focus:ring-1 focus:ring-primary-500 ${inputBase}`}
            />
          ) : null}
        </div>
      ))}

      {lineas.length < MAX_LINEAS_PAGO ? (
        <button
          type="button"
          onClick={agregar}
          className="flex items-center gap-1.5 self-start rounded-lg border border-dashed border-neutral-300 px-3 py-2 text-xs font-medium text-neutral-600 transition-colors hover:border-primary-400 hover:text-primary-700"
        >
          <Plus size={14} /> Agregar medio
        </button>
      ) : null}

      <div className="flex items-center justify-between rounded-lg bg-neutral-50 px-3 py-2.5 text-sm">
        <span className="text-neutral-500">
          {totalLabel} {COP.format(total)} · asignado {COP.format(asignado)}
        </span>
        <span
          className={`font-semibold ${
            resto === 0 ? 'text-success-700' : resto > 0 ? 'text-warning-600' : 'text-danger-600'
          }`}
        >
          {resto === 0 ? 'Cuadra' : resto > 0 ? `Falta ${COP.format(resto)}` : `Sobra ${COP.format(-resto)}`}
        </span>
      </div>
    </div>
  )
}
