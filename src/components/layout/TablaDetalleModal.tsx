import type { ComponentType, ReactNode } from 'react'
import { X } from 'lucide-react'

export interface ColumnaDetalle {
  key: string
  label: string
  align?: 'left' | 'right'
}

export interface ResumenDetalle {
  label: string
  valor: ReactNode
  tono?: 'neutro' | 'verde' | 'rojo'
}

interface Props {
  titulo: string
  subtitulo?: ReactNode
  icono?: ComponentType<{ size?: number; strokeWidth?: number }>
  /** Tira de cifras clave sobre la tabla — el "titular" del modal antes del detalle fila a fila. */
  resumen?: ResumenDetalle[]
  columnas: ColumnaDetalle[]
  filas: Record<string, ReactNode>[]
  /** Fila de totales opcional (mismas keys que `columnas`). */
  total?: Record<string, ReactNode>
  /** `lg` para tablas de muchas columnas (ej. el detalle de órdenes del lavadero). */
  ancho?: 'md' | 'lg'
  vacioLabel?: string
  onClose: () => void
}

const TONO_RESUMEN: Record<string, string> = {
  neutro: 'text-neutral-900',
  verde: 'text-success-700',
  rojo: 'text-danger-600',
}

// Modal genérico de tabla de solo lectura — mismo patrón visual que DetalleOrdenesJefeZonaModal.
// Lo usan todos los "Ver detalle" de la cascada de rentabilidad y el modal de "detalle del día".
export function TablaDetalleModal({
  titulo,
  subtitulo,
  icono: Icono,
  resumen,
  columnas,
  filas,
  total,
  ancho = 'md',
  vacioLabel = 'Sin registros en este periodo.',
  onClose,
}: Props) {
  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center bg-neutral-900/40 p-4 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`flex max-h-[90vh] w-full flex-col rounded-2xl bg-white shadow-card-hover ${
          ancho === 'lg' ? 'max-w-5xl' : 'max-w-3xl'
        }`}
      >
        {/* Encabezado */}
        <div className="flex shrink-0 items-start justify-between gap-3 p-6 pb-4 sm:p-7 sm:pb-4">
          <div className="flex min-w-0 items-start gap-3">
            {Icono ? (
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-600">
                <Icono size={18} strokeWidth={2} />
              </span>
            ) : null}
            <div className="min-w-0 pt-0.5">
              <h3 className="text-base font-semibold text-neutral-900">{titulo}</h3>
              {subtitulo ? <p className="mt-0.5 text-sm text-neutral-500">{subtitulo}</p> : null}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="flex size-8 shrink-0 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-600"
          >
            <X size={18} />
          </button>
        </div>

        {/* Cifras clave */}
        {resumen && resumen.length > 0 ? (
          <div className="mx-6 mb-1 grid shrink-0 grid-cols-2 gap-px overflow-hidden rounded-xl bg-neutral-200 sm:mx-7 sm:grid-cols-4">
            {resumen.map((r) => (
              <div key={r.label} className="bg-neutral-50 px-3 py-2.5">
                <p className="text-[11px] font-medium text-neutral-500">{r.label}</p>
                <p className={`mt-0.5 text-sm font-semibold tabular-nums ${TONO_RESUMEN[r.tono ?? 'neutro']}`}>
                  {r.valor}
                </p>
              </div>
            ))}
          </div>
        ) : null}

        {/* Tabla.
            OJO: el `sticky` y el `bg-white` van en las CELDAS, no en `<thead>`/`<tfoot>`/`<tr>` —
            Chrome no pinta el fondo de esos elementos de tabla, así que un thead sticky con
            `bg-white` deja ver las filas por debajo y el encabezado se vuelve ilegible apenas hay
            scroll (se notaba al abrir un mes completo). Por lo mismo el borde va como `inset
            box-shadow`: un `border` en celda sticky se corta al desplazarse. */}
        <div className="custom-scroll min-h-0 flex-1 overflow-auto px-6 sm:px-7">
          <table className="w-full border-separate border-spacing-0 text-sm">
            <thead>
              <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
                {columnas.map((c) => (
                  <th
                    key={c.key}
                    className={`sticky top-0 z-10 whitespace-nowrap bg-white px-3 py-2.5 shadow-[inset_0_-1px_0_var(--color-neutral-200)] ${
                      c.align === 'right' ? 'text-right' : ''
                    }`}
                  >
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filas.map((fila, i) => (
                <tr key={i} className="group">
                  {columnas.map((c) => (
                    <td
                      key={c.key}
                      className={`px-3 py-2.5 align-top text-neutral-700 shadow-[inset_0_-1px_0_var(--color-neutral-100)] transition-colors group-hover:bg-primary-50/40 ${
                        c.align === 'right' ? 'text-right tabular-nums' : ''
                      }`}
                    >
                      {fila[c.key] ?? <span className="text-neutral-300">—</span>}
                    </td>
                  ))}
                </tr>
              ))}
              {filas.length === 0 ? (
                <tr>
                  <td colSpan={columnas.length} className="px-3 py-10 text-center text-sm text-neutral-400">
                    {vacioLabel}
                  </td>
                </tr>
              ) : null}
            </tbody>
            {total && filas.length > 0 ? (
              <tfoot>
                <tr className="text-sm font-semibold text-neutral-900">
                  {columnas.map((c) => (
                    <td
                      key={c.key}
                      className={`sticky bottom-0 z-10 bg-white px-3 py-3 shadow-[inset_0_2px_0_var(--color-neutral-200)] ${
                        c.align === 'right' ? 'text-right tabular-nums' : ''
                      }`}
                    >
                      {total[c.key] ?? null}
                    </td>
                  ))}
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>

        {/* Pie */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-neutral-100 p-5 sm:px-7">
          <span className="text-xs text-neutral-400">
            {filas.length} {filas.length === 1 ? 'registro' : 'registros'}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-200"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}
