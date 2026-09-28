import type { ButtonHTMLAttributes, ComponentType, ReactNode } from 'react'
import { Loader2 } from 'lucide-react'

type Variante = 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-ghost'
type Tamano = 'sm' | 'md'

const VARIANTE: Record<Variante, string> = {
  primary: 'bg-primary-600 text-white shadow-nav-active hover:bg-primary-700',
  secondary: 'border border-neutral-200 bg-white text-neutral-700 hover:border-neutral-300 hover:bg-neutral-50',
  ghost: 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900',
  danger: 'bg-danger-600 text-white hover:bg-danger-700',
  'danger-ghost': 'text-danger-600 hover:bg-danger-50',
}

const TAMANO: Record<Tamano, string> = {
  sm: 'gap-1.5 rounded-lg px-3 py-1.5 text-xs',
  md: 'gap-2 rounded-xl px-4 py-2.5 text-sm',
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variante
  size?: Tamano
  icon?: ComponentType<{ size?: number; strokeWidth?: number }>
  loading?: boolean
  children?: ReactNode
}

// Botón único del panel — antes cada pantalla armaba el suyo con clases sueltas y el mismo
// "Generar" salía en tres estilos distintos. Una acción principal por bloque (`primary`), el
// resto `secondary`/`ghost`.
export function Button({
  variant = 'secondary',
  size = 'md',
  icon: Icon,
  loading = false,
  disabled,
  className = '',
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={`inline-flex shrink-0 items-center justify-center font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTE[variant]} ${TAMANO[size]} ${className}`}
      {...rest}
    >
      {loading ? (
        <Loader2 size={size === 'sm' ? 13 : 16} className="animate-spin" />
      ) : Icon ? (
        <Icon size={size === 'sm' ? 13 : 16} strokeWidth={2} />
      ) : null}
      {children}
    </button>
  )
}
