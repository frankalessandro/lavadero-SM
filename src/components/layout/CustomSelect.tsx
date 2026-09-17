import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Check } from 'lucide-react'

export interface SelectOption {
  value: string
  label: string
  /** Línea secundaria opcional bajo el label, dentro del panel desplegado (ej. qué incluye un combo). */
  description?: string
}

interface CustomSelectProps {
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
  placeholder: string
  disabled?: boolean
  emptyLabel?: string
  /** 'md' (default): py-3/text-base, para pantallas mobile-first (recepción, vigilante).
   *  'sm': py-2.5/text-sm, para que combine con los inputs de texto de los CRUDs de admin. */
  size?: 'sm' | 'md'
  /** Convierte el botón en un input de texto: al escribir filtra `options` por `label`, en vez de
   *  obligar a scrollear una lista larga (ej. el producto de una compra con decenas de ítems). */
  searchable?: boolean
}

const SIZE_CLASSNAME: Record<'sm' | 'md', string> = {
  sm: 'px-3 py-2.5 text-sm',
  md: 'px-3 py-3 text-base',
}

// Reemplaza el <select> nativo del sistema operativo por un panel propio,
// consistente con el resto del sistema de diseño (tokens de color, sombras, tipografía).
export function CustomSelect({
  value,
  onChange,
  options,
  placeholder,
  disabled,
  emptyLabel,
  size = 'md',
  searchable = false,
}: CustomSelectProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const panelRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const selected = options.find((o) => o.value === value)
  const opciones = searchable && query.trim()
    ? options.filter((o) => o.label.toLowerCase().includes(query.trim().toLowerCase()))
    : options

  // En touch, arrastrar/scrollear la página sobre el backdrop cancela el `click`
  // sintético (el navegador lo suprime tras un gesto de arrastre), así que el backdrop
  // invisible se queda cubriendo la pantalla y absorbe el siguiente toque. Cerrar también
  // al hacer scroll evita que quede "atascado" en tablet/celular.
  // Va en fase de CAPTURA: los paneles scrollean dentro de su propio contenedor
  // (`fixed inset-0 overflow-y-auto` en cada route.tsx), no en `window`, y el evento
  // `scroll` de un elemento no burbujea — sin `capture` este listener nunca se disparaba.
  // Se ignora el scroll de la propia lista de opciones (`max-h-64 overflow-y-auto`).
  useEffect(() => {
    if (!open) return
    const close = (e: Event) => {
      if (panelRef.current?.contains(e.target as Node)) return
      setOpen(false)
    }
    window.addEventListener('scroll', close, { capture: true, passive: true })
    return () => window.removeEventListener('scroll', close, { capture: true })
  }, [open])

  function seleccionar(v: string) {
    onChange(v)
    setOpen(false)
    setQuery('')
  }

  return (
    <div className="relative">
      {searchable ? (
        <input
          ref={inputRef}
          type="text"
          disabled={disabled}
          value={open ? query : (selected?.label ?? '')}
          placeholder={selected && !open ? selected.label : placeholder}
          onFocus={() => {
            setOpen(true)
            setQuery('')
          }}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setOpen(false)
              setQuery('')
              inputRef.current?.blur()
            }
          }}
          className={`w-full rounded-lg border border-neutral-300 bg-white pr-8 outline-none transition-colors focus:border-primary-500 focus:ring-1 focus:ring-primary-500 disabled:bg-neutral-50 disabled:text-neutral-400 ${SIZE_CLASSNAME[size]}`}
        />
      ) : (
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen((o) => !o)}
          className={`flex w-full items-center justify-between gap-2 rounded-lg border border-neutral-300 bg-white text-left outline-none transition-colors focus:border-primary-500 focus:ring-1 focus:ring-primary-500 disabled:bg-neutral-50 disabled:text-neutral-400 ${SIZE_CLASSNAME[size]}`}
        >
          <span className={`min-w-0 truncate ${selected ? 'text-neutral-900' : 'text-neutral-400'}`}>
            {selected?.label ?? placeholder}
          </span>
          <ChevronDown size={16} className={`shrink-0 text-neutral-400 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      )}
      {searchable ? (
        <ChevronDown
          size={16}
          className={`pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      ) : null}

      {open ? (
        <>
          <button
            type="button"
            aria-label="Cerrar"
            onClick={() => setOpen(false)}
            // Arrastrar el dedo sobre el backdrop no genera `click` (y si no hay nada que
            // scrollear tampoco hay evento `scroll`): cerrar en cuanto el dedo se mueve.
            onTouchMove={() => setOpen(false)}
            className="fixed inset-0 z-20 cursor-default"
          />
          <div ref={panelRef} className="absolute z-30 mt-1.5 max-h-64 w-full overflow-y-auto rounded-lg border border-neutral-200 bg-white p-1 shadow-card-hover">
            {opciones.length === 0 ? (
              <p className="px-3 py-2.5 text-sm text-neutral-400">
                {searchable && query.trim() ? `Sin resultados para "${query.trim()}"` : (emptyLabel ?? 'Sin opciones')}
              </p>
            ) : (
              opciones.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  // `onMouseDown` con preventDefault: en el input buscable, un `click` normal
                  // dispara primero el `blur` del input (que ya cerró el panel) y el botón
                  // desaparece antes de registrar el click. mousedown ocurre antes del blur.
                  onMouseDown={(e) => {
                    e.preventDefault()
                    seleccionar(option.value)
                  }}
                  className={`flex w-full items-center justify-between gap-2 rounded-md px-3 py-2.5 text-left text-sm transition-colors ${
                    option.value === value
                      ? 'bg-primary-50 text-primary-700'
                      : 'text-neutral-700 hover:bg-neutral-50'
                  }`}
                >
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate">{option.label}</span>
                    {option.description ? (
                      <span className="text-xs font-normal text-neutral-400">{option.description}</span>
                    ) : null}
                  </span>
                  {option.value === value ? <Check size={15} className="shrink-0" /> : null}
                </button>
              ))
            )}
          </div>
        </>
      ) : null}
    </div>
  )
}
