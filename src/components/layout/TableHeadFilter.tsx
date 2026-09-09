import { CustomSelect } from './CustomSelect'

// Filtro por columna, embebido en el propio <th> — para no repetir una franja de inputs aparte
// arriba de cada tabla grande (admin ya tiene varias así: Órdenes, Clientes, Turnos, Usuarios,
// Liquidaciones, Stock). Dos variantes: texto libre (substring, case-insensitive) y select (para
// columnas de valores discretos: estado, rol, nivel, método de pago). Filtrado 100% en cliente,
// sobre los datos que ya trajo el loader — mismo patrón que `busquedaPlaca`/`lavadorFiltro` del
// dashboard de jefe de zona.
//
// El `<tr>` padre de estas tablas trae `uppercase tracking-wide text-xs font-medium` para las
// etiquetas — hay que neutralizar eso en el control (`normal-case`, `font-normal`, `text-sm`) o
// el input/select hereda mayúsculas y el tamaño de letra del encabezado.

export function ThTexto({
  label,
  value,
  onChange,
  placeholder = 'Filtrar…',
  align = 'left',
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  align?: 'left' | 'right'
}) {
  return (
    <th className={`px-5 py-3 align-top ${align === 'right' ? 'text-right' : 'text-left'}`}>
      <span className="block">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onClick={(event) => event.stopPropagation()}
        placeholder={placeholder}
        className={`mt-1.5 w-full min-w-[7rem] rounded-md border border-neutral-200 bg-white px-2 py-1 text-xs font-normal normal-case tracking-normal text-neutral-700 outline-none transition-colors placeholder:text-neutral-400 focus:border-primary-500 focus:ring-1 focus:ring-primary-500 ${
          align === 'right' ? 'text-right' : ''
        }`}
      />
    </th>
  )
}

export function ThSelect({
  label,
  value,
  onChange,
  options,
  todosLabel = 'Todos',
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string }[]
  todosLabel?: string
}) {
  return (
    <th className="px-5 py-3 align-top">
      <span className="block">{label}</span>
      <div className="mt-1.5 min-w-[8rem] normal-case" onClick={(event) => event.stopPropagation()}>
        <CustomSelect
          size="sm"
          value={value}
          onChange={onChange}
          options={[{ value: '', label: todosLabel }, ...options]}
          placeholder={todosLabel}
        />
      </div>
    </th>
  )
}
