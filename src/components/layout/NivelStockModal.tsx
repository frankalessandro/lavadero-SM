import { X } from 'lucide-react'
import { NIVEL_LABEL, NIVEL_BADGE_CLASS, type NivelStock } from '../../lib/nivelStock'

export interface ProductoNivelFila {
  id: string
  nombre: string
  unidad: string
  stock: number
  stockMinimo: number
}

// Detalle de un nivel de stock (bajo/medio/bueno) — antes era solo el `title` (tooltip) de la
// tarjeta de nivel en /admin/dinero/inventario y /jefe-zona/inventario, que en celular no se ve
// y con muchos productos queda ilegible. Mismo componente para los dos paneles: ninguno de los
// dos muestra costo acá (jefe de zona no lo ve por rol, y esta es una lista operativa de "qué
// reponer", no de valorización — esa ya vive en la tarjeta de "Valorización total").
export function NivelStockModal({
  nivel,
  productos,
  onClose,
}: {
  nivel: NivelStock
  productos: ProductoNivelFila[]
  onClose: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-20 flex items-center justify-center bg-neutral-900/40 p-4 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-card-hover sm:p-7"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-neutral-900">{NIVEL_LABEL[nivel]}</h3>
            <p className="text-xs text-neutral-500">
              {productos.length} producto{productos.length === 1 ? '' : 's'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex size-8 shrink-0 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-neutral-100"
            aria-label="Cerrar"
          >
            <X size={18} />
          </button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto">
          {productos.length === 0 ? (
            <p className="py-6 text-center text-sm text-neutral-400">Sin productos en este nivel.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-neutral-100">
              {productos.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-neutral-900">{p.nombre}</p>
                    <p className="text-xs text-neutral-500">
                      Mínimo: {p.stockMinimo} {p.unidad}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${NIVEL_BADGE_CLASS[nivel]}`}
                  >
                    {p.stock} {p.unidad}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
