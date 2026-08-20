import { useEffect, useState } from 'react'
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
}: CustomSelectProps) {
  const [open, setOpen] = useState(false)
  const selected = options.find((o) => o.value === value)

  // En touch, arrastrar/scrollear la página sobre el backdrop cancela el `click`
  // sintético (el navegador lo suprime tras un gesto de arrastre), así que el backdrop
  // invisible se queda cubriendo la pantalla y absorbe el siguiente toque. Cerrar también
  // al hacer scroll evita que quede "atascado" en tablet/celular.
  useEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    window.addEventListener('scroll', close, { passive: true })
    return () => window.removeEventListener('scroll', close)
  }, [open])

  return (
    <div className="relative">
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

      {open ? (
        <>
          <button
            type="button"
            aria-label="Cerrar"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-20 cursor-default"
          />
          <div className="absolute z-30 mt-1.5 max-h-64 w-full overflow-y-auto rounded-lg border border-neutral-200 bg-white p-1 shadow-card-hover">
            {options.length === 0 ? (
              <p className="px-3 py-2.5 text-sm text-neutral-400">{emptyLabel ?? 'Sin opciones'}</p>
            ) : (
              options.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    onChange(option.value)
                    setOpen(false)
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
