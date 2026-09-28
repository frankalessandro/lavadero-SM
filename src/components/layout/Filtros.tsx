import { useEffect, useId, useRef, useState, type ComponentType, type ReactNode } from 'react'
import { Check, ChevronDown, Search, X, RotateCcw } from 'lucide-react'

// Barra de filtros de las tablas del panel — va ENCIMA de la tabla, no como una segunda fila del
// <thead>. Tres controles, según qué se filtra:
//  · FiltroBusqueda — texto libre (placa, cliente, producto).
//  · FiltroCombo    — lista conocida donde también se puede escribir (lavador, responsable, combo).
//  · FiltroMenu     — pocas opciones fijas (estado, método de pago), sin escritura.
// Todos miden lo mismo (h-10, rounded-xl) para que la barra quede pareja al envolver en móvil.

type Icono = ComponentType<{ size?: number; strokeWidth?: number; className?: string }>

const CAJA =
  'flex h-10 items-center gap-2 rounded-xl border bg-white px-3 text-sm transition-colors focus-within:border-primary-500 focus-within:ring-1 focus-within:ring-primary-500'

export function BarraFiltros({
  children,
  activos = 0,
  onLimpiar,
  resultado,
}: {
  children: ReactNode
  /** Cuántos filtros tienen valor — muestra "Limpiar" cuando hay al menos uno. */
  activos?: number
  onLimpiar?: () => void
  /** Texto a la derecha, ej. "24 de 130 órdenes". */
  resultado?: ReactNode
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
      <div className="grid grid-cols-1 gap-2 min-[480px]:grid-cols-2 sm:flex sm:flex-1 sm:flex-wrap sm:items-center">
        {children}
      </div>
      <div className="flex items-center justify-between gap-3 sm:justify-end">
        {resultado ? <span className="text-xs tabular-nums text-neutral-500">{resultado}</span> : null}
        {activos > 0 && onLimpiar ? (
          <button
            type="button"
            onClick={onLimpiar}
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-800"
          >
            <RotateCcw size={13} />
            Limpiar{activos > 1 ? ` (${activos})` : ''}
          </button>
        ) : null}
      </div>
    </div>
  )
}

export function FiltroBusqueda({
  value,
  onChange,
  placeholder = 'Buscar…',
  mayusculas = false,
  ancho = 'sm:w-56',
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  /** Placas: se escribe y se muestra en mayúscula y fuente mono. */
  mayusculas?: boolean
  ancho?: string
}) {
  return (
    <label className={`${CAJA} ${value ? 'border-primary-300' : 'border-neutral-200'} w-full ${ancho}`}>
      <Search size={15} className="shrink-0 text-neutral-400" />
      <input
        value={value}
        onChange={(e) => onChange(mayusculas ? e.target.value.toUpperCase() : e.target.value)}
        placeholder={placeholder}
        className={`min-w-0 flex-1 bg-transparent text-neutral-800 outline-none placeholder:text-neutral-400 ${
          mayusculas ? 'font-mono uppercase tracking-wide placeholder:font-sans placeholder:normal-case placeholder:tracking-normal' : ''
        }`}
      />
      {value ? (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Borrar búsqueda"
          className="-mr-1 flex size-6 shrink-0 items-center justify-center rounded-md text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
        >
          <X size={14} />
        </button>
      ) : null}
    </label>
  )
}

function normalizar(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}

/**
 * Combo con escritura: despliega las opciones conocidas y las va filtrando mientras se escribe.
 * El valor es el TEXTO (no un id): elegir una opción deja su nombre, y escribir a medias también
 * filtra — así funciona igual con `coincide()` de src/lib/tableFilters.ts.
 */
export function FiltroCombo({
  value,
  onChange,
  options,
  placeholder = 'Todos',
  icon: Icon,
  ancho = 'sm:w-52',
}: {
  value: string
  onChange: (value: string) => void
  options: string[]
  placeholder?: string
  icon?: Icono
  ancho?: string
}) {
  const [abierto, setAbierto] = useState(false)
  const [activo, setActivo] = useState(0)
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listId = useId()

  const unicas = Array.from(new Set(options.filter(Boolean))).sort((a, b) => a.localeCompare(b, 'es'))
  const exacta = unicas.some((o) => o === value)
  const q = normalizar(exacta ? '' : value)
  const visibles = q ? unicas.filter((o) => normalizar(o).includes(q)) : unicas

  useEffect(() => {
    if (!abierto) return
    function fuera(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false)
    }
    document.addEventListener('mousedown', fuera)
    return () => document.removeEventListener('mousedown', fuera)
  }, [abierto])

  function elegir(opcion: string) {
    onChange(opcion)
    setAbierto(false)
    inputRef.current?.blur()
  }

  return (
    <div ref={ref} className={`relative w-full ${ancho}`}>
      <div className={`${CAJA} ${value ? 'border-primary-300' : 'border-neutral-200'}`}>
        {Icon ? <Icon size={15} className="shrink-0 text-neutral-400" /> : null}
        <input
          ref={inputRef}
          value={value}
          role="combobox"
          aria-expanded={abierto}
          aria-controls={listId}
          aria-autocomplete="list"
          onFocus={() => {
            setAbierto(true)
            setActivo(0)
          }}
          onChange={(e) => {
            onChange(e.target.value)
            setAbierto(true)
            setActivo(0)
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setAbierto(true)
              setActivo((i) => Math.min(i + 1, visibles.length - 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setActivo((i) => Math.max(i - 1, 0))
            } else if (e.key === 'Enter' && abierto && visibles[activo]) {
              e.preventDefault()
              elegir(visibles[activo])
            } else if (e.key === 'Escape') {
              setAbierto(false)
            }
          }}
          placeholder={placeholder}
          className={`min-w-0 flex-1 bg-transparent outline-none placeholder:text-neutral-400 ${
            exacta ? 'font-medium text-primary-700' : 'text-neutral-800'
          }`}
        />
        {value ? (
          <button
            type="button"
            onClick={() => {
              onChange('')
              setAbierto(false)
            }}
            aria-label="Quitar filtro"
            className="-mr-1 flex size-6 shrink-0 items-center justify-center rounded-md text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
          >
            <X size={14} />
          </button>
        ) : (
          <button
            type="button"
            tabIndex={-1}
            onClick={() => {
              setAbierto((a) => !a)
              inputRef.current?.focus()
            }}
            aria-label="Ver opciones"
            className="-mr-1 flex size-6 shrink-0 items-center justify-center rounded-md text-neutral-400"
          >
            <ChevronDown size={15} className={`transition-transform ${abierto ? 'rotate-180' : ''}`} />
          </button>
        )}
      </div>
      {abierto ? (
        <ul
          id={listId}
          role="listbox"
          className="custom-scroll absolute top-full right-0 left-0 z-30 mt-1.5 max-h-64 overflow-y-auto rounded-xl border border-neutral-200 bg-white p-1 shadow-card-hover"
        >
          {visibles.length === 0 ? (
            <li className="px-3 py-2.5 text-sm text-neutral-400">Sin coincidencias — se filtra por lo escrito</li>
          ) : (
            visibles.map((o, i) => (
              <li key={o} role="option" aria-selected={o === value}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setActivo(i)}
                  onClick={() => elegir(o)}
                  className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                    i === activo ? 'bg-primary-50 text-primary-800' : 'text-neutral-700'
                  }`}
                >
                  <span className="truncate">{o}</span>
                  {o === value ? <Check size={14} className="shrink-0 text-primary-600" /> : null}
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  )
}

/** Menú de pocas opciones fijas: "Estado: Todos ▾". El valor vacío es "todos". */
export function FiltroMenu({
  label,
  value,
  onChange,
  options,
  todosLabel = 'Todos',
  ancho = 'sm:w-auto',
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string }[]
  todosLabel?: string
  ancho?: string
}) {
  const [abierto, setAbierto] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const actual = options.find((o) => o.value === value)

  useEffect(() => {
    if (!abierto) return
    function fuera(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false)
    }
    document.addEventListener('mousedown', fuera)
    return () => document.removeEventListener('mousedown', fuera)
  }, [abierto])

  const todas = [{ value: '', label: todosLabel }, ...options]
  return (
    <div ref={ref} className={`relative w-full ${ancho}`}>
      <button
        type="button"
        onClick={() => setAbierto((a) => !a)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setAbierto(false)
        }}
        aria-haspopup="listbox"
        aria-expanded={abierto}
        className={`${CAJA} w-full justify-between hover:bg-neutral-50 ${
          actual ? 'border-primary-300' : 'border-neutral-200'
        }`}
      >
        <span className="flex min-w-0 items-center gap-1.5 whitespace-nowrap">
          <span className="text-neutral-400">{label}:</span>
          <span className={`truncate font-medium ${actual ? 'text-primary-700' : 'text-neutral-700'}`}>
            {actual?.label ?? todosLabel}
          </span>
        </span>
        <ChevronDown size={15} className={`shrink-0 text-neutral-400 transition-transform ${abierto ? 'rotate-180' : ''}`} />
      </button>
      {abierto ? (
        <ul
          role="listbox"
          className="absolute top-full left-0 z-30 mt-1.5 min-w-full rounded-xl border border-neutral-200 bg-white p-1 shadow-card-hover"
        >
          {todas.map((o) => (
            <li key={o.value || '__todos'} role="option" aria-selected={o.value === value}>
              <button
                type="button"
                onClick={() => {
                  onChange(o.value)
                  setAbierto(false)
                }}
                className={`flex w-full items-center justify-between gap-3 whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-primary-50 ${
                  o.value === value ? 'font-medium text-primary-700' : 'text-neutral-700'
                }`}
              >
                {o.label}
                {o.value === value ? <Check size={14} className="text-primary-600" /> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
