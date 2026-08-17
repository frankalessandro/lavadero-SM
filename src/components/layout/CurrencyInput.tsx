interface CurrencyInputProps {
  /** Dígitos crudos, ej. "150000" — nunca el string ya formateado. */
  value: string
  /** Recibe los dígitos crudos (sin puntos) — el consumidor sigue haciendo `Number(value)` igual que antes. */
  onChange: (rawDigits: string) => void
  placeholder?: string
  /** 'sm' (py-2.5/text-sm, admin de escritorio) | 'md' (py-3/text-base, mobile-first, default). */
  size?: 'sm' | 'md'
  autoFocus?: boolean
  /** Prefijo visual, `"$"` por defecto — pasa `undefined` para ocultarlo (ej. cantidades sin moneda). */
  prefix?: string | null
  className?: string
}

const SIZE_CLASS: Record<'sm' | 'md', string> = {
  sm: 'py-2.5 text-sm',
  md: 'py-3 text-base',
}

// Input de dinero/cantidad con separador de miles (formato es-CO: puntos, no comas) mientras se
// escribe. El valor que maneja el formulario sigue siendo un string de dígitos crudos — este
// componente es un reemplazo directo de `<input type="number">` sin cambiar el tipo del estado.
export function CurrencyInput({
  value,
  onChange,
  placeholder = '0',
  size = 'md',
  autoFocus,
  prefix = '$',
  className,
}: CurrencyInputProps) {
  const digitos = value.replace(/\D/g, '')
  const formateado = digitos ? Number(digitos).toLocaleString('es-CO') : ''

  return (
    <div
      className={`flex items-center gap-2 rounded-lg border border-neutral-300 px-3 transition-colors focus-within:border-primary-500 focus-within:ring-1 focus-within:ring-primary-500 ${SIZE_CLASS[size]} ${className ?? ''}`}
    >
      {prefix ? <span className="shrink-0 text-neutral-400">{prefix}</span> : null}
      <input
        inputMode="numeric"
        autoFocus={autoFocus}
        value={formateado}
        onChange={(event) => onChange(event.target.value.replace(/\D/g, ''))}
        placeholder={placeholder}
        className="w-full min-w-0 bg-transparent outline-none"
      />
    </div>
  )
}
