import { useRef, useState } from 'react'
import { Minus, Plus } from 'lucide-react'
import { CurrencyInput } from './CurrencyInput'

const BILLETES = [100000, 50000, 20000, 10000, 5000, 2000]
const MONEDAS = [1000, 500, 200, 100, 50]
const ORDEN = [...BILLETES, ...MONEDAS]

const COP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })

type Conteo = Record<number, number>

const totalDe = (conteo: Conteo) => ORDEN.reduce((suma, d) => suma + d * (conteo[d] || 0), 0)

/**
 * Base inicial con dos formas de ingresarla: un monto total, o contando cuántos billetes y
 * monedas de cada denominación hay (con − / + y Enter para saltar a la siguiente). Hacia afuera
 * siempre entrega el total en dígitos crudos, igual que `CurrencyInput`: el consumidor y la RPC
 * no cambian. Pensado para un modal ancho (`Modal size="lg"`): billetes y monedas en dos columnas.
 */
export function BaseInicialInput({
  value,
  onChange,
  size = 'md',
}: {
  value: string
  onChange: (rawDigits: string) => void
  size?: 'sm' | 'md'
}) {
  const [modo, setModo] = useState<'total' | 'conteo'>('total')
  const [conteo, setConteo] = useState<Conteo>({})
  const refs = useRef<Record<number, HTMLInputElement | null>>({})

  function fijar(denominacion: number, cantidad: number) {
    const siguiente = { ...conteo }
    if (cantidad > 0) siguiente[denominacion] = Math.min(cantidad, 99999)
    else delete siguiente[denominacion]
    setConteo(siguiente)
    onChange(String(totalDe(siguiente)))
  }

  function cambiarModo(nuevo: 'total' | 'conteo') {
    setModo(nuevo)
    // Al volver al conteo, el total mostrado debe ser el de las cantidades guardadas.
    if (nuevo === 'conteo') onChange(String(totalDe(conteo)))
  }

  function saltarSiguiente(denominacion: number) {
    const el = refs.current[ORDEN[ORDEN.indexOf(denominacion) + 1]]
    el?.focus()
    el?.select()
  }

  const fila = (denominacion: number) => {
    const cantidad = conteo[denominacion] || 0
    return (
      <li
        key={denominacion}
        className={`flex items-center gap-3 rounded-xl border px-3 py-2 transition-colors ${
          cantidad ? 'border-primary-100 bg-primary-50/60' : 'border-transparent'
        }`}
      >
        <div className="min-w-0 flex-1">
          <p className="text-base font-semibold text-neutral-900">{COP.format(denominacion)}</p>
          <p className="h-4 text-xs text-neutral-500">{cantidad ? COP.format(denominacion * cantidad) : ''}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            disabled={!cantidad}
            onClick={() => fijar(denominacion, cantidad - 1)}
            aria-label={`Quitar ${COP.format(denominacion)}`}
            className="flex size-10 items-center justify-center rounded-lg border border-neutral-200 text-neutral-600 transition-colors hover:bg-neutral-100 disabled:opacity-40 disabled:hover:bg-transparent"
          >
            <Minus size={16} />
          </button>
          <input
            ref={(el) => {
              refs.current[denominacion] = el
            }}
            inputMode="numeric"
            enterKeyHint="next"
            placeholder="0"
            value={cantidad || ''}
            onFocus={(event) => event.target.select()}
            onChange={(event) => fijar(denominacion, Number(event.target.value.replace(/\D/g, '')))}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                saltarSiguiente(denominacion)
              }
            }}
            aria-label={`Cantidad de ${COP.format(denominacion)}`}
            className="h-10 w-16 min-w-0 rounded-lg border border-neutral-300 text-center text-base font-semibold outline-none transition-colors focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
          />
          <button
            type="button"
            onClick={() => fijar(denominacion, cantidad + 1)}
            aria-label={`Agregar ${COP.format(denominacion)}`}
            className="flex size-10 items-center justify-center rounded-lg border border-neutral-200 text-neutral-600 transition-colors hover:bg-neutral-100"
          >
            <Plus size={16} />
          </button>
        </div>
      </li>
    )
  }

  const grupo = (titulo: string, lista: number[]) => (
    <section className="flex flex-col gap-2">
      <h4 className="px-3 text-xs font-semibold uppercase tracking-wide text-neutral-400">{titulo}</h4>
      <ul className="flex flex-col gap-1">{lista.map(fila)}</ul>
    </section>
  )

  const total = Number(value) || 0

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-neutral-100 p-1">
        {(
          [
            ['total', 'Monto total'],
            ['conteo', 'Billetes y monedas'],
          ] as const
        ).map(([clave, texto]) => (
          <button
            key={clave}
            type="button"
            onClick={() => cambiarModo(clave)}
            className={`rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
              modo === clave ? 'bg-white text-primary-700 shadow-card' : 'text-neutral-500 hover:text-neutral-700'
            }`}
          >
            {texto}
          </button>
        ))}
      </div>

      {modo === 'total' ? (
        <CurrencyInput size={size} prefix="$" value={value} onChange={onChange} />
      ) : (
        <>
          <div className="grid gap-5 sm:grid-cols-2 sm:gap-6">
            {grupo('Billetes', BILLETES)}
            {grupo('Monedas', MONEDAS)}
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-neutral-100 pt-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Total contado</p>
              <p className="text-3xl font-bold leading-tight text-neutral-900">{COP.format(total)}</p>
            </div>
            {total > 0 ? (
              <button
                type="button"
                onClick={() => {
                  setConteo({})
                  onChange('0')
                }}
                className="text-sm font-medium text-primary-600 transition-colors hover:text-primary-700"
              >
                Limpiar
              </button>
            ) : null}
          </div>
        </>
      )}
    </div>
  )
}
