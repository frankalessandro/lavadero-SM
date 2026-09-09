import type { ReactNode } from 'react'
import { CustomSelect } from './CustomSelect'

// Franja de filtros — una SEGUNDA fila del <thead>, aparte de la fila de etiquetas de columna.
//
// La primera versión metía el filtro DENTRO de cada <th> de etiqueta (label arriba, control
// abajo, apilados). Se veía mal: el input de texto y el CustomSelect no medían lo mismo, así que
// la fila de encabezado quedaba dispareja según qué tipo de filtro tocaba cada columna, y las
// columnas sin filtro se quedaban más cortas que las que sí tenían uno — nada alineado.
//
// Ahora es una tira propia con su propio fondo (`FilaFiltros`), debajo de la fila de etiquetas de
// siempre (que vuelve a ser un <th> plano, sin nada apilado). Cada celda de esa tira —tenga
// filtro o no— usa el mismo `CONTROL_CLASS`, así que un input de texto, un CustomSelect (tamaño
// `sm`, que ya usa exactamente ese padding/tipografía) y el espacio en blanco de una columna sin
// filtro (`FiltroVacio`) miden EXACTO lo mismo. `FiltroVacio` es literalmente el mismo control,
// solo invisible — así nunca se puede desalinear del resto aunque cambie el padding acá.

const CONTROL_CLASS =
  'w-full rounded-lg border border-neutral-300 bg-white px-3 py-2.5 text-sm text-neutral-700 outline-none transition-colors placeholder:text-neutral-400 focus:border-primary-500 focus:ring-1 focus:ring-primary-500'

export function FilaFiltros({ children }: { children: ReactNode }) {
  return <tr className="border-b border-neutral-200 bg-neutral-50/60">{children}</tr>
}

export function FiltroTexto({
  value,
  onChange,
  placeholder = 'Filtrar…',
  align = 'left',
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  align?: 'left' | 'right'
}) {
  return (
    <td className="px-5 py-2">
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className={`${CONTROL_CLASS} ${align === 'right' ? 'text-right' : ''}`}
      />
    </td>
  )
}

export function FiltroSelect({
  value,
  onChange,
  options,
  todosLabel = 'Todos',
}: {
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string }[]
  todosLabel?: string
}) {
  return (
    <td className="px-5 py-2">
      <CustomSelect
        size="sm"
        value={value}
        onChange={onChange}
        options={[{ value: '', label: todosLabel }, ...options]}
        placeholder={todosLabel}
      />
    </td>
  )
}

// Relleno para una columna sin filtro (ej. "Acciones") — mismo alto exacto que las de al lado,
// para que la tira no quede dispareja.
export function FiltroVacio() {
  return (
    <td className="px-5 py-2">
      <div className={`${CONTROL_CLASS} invisible`} aria-hidden="true">
        —
      </div>
    </td>
  )
}
