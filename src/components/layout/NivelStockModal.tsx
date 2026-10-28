import { Package } from 'lucide-react'
import { NIVEL_LABEL, NIVEL_BADGE_CLASS, type NivelStock } from '../../lib/nivelStock'
import { Modal } from './Modal'

export interface ProductoNivelFila {
  id: string
  nombre: string
  unidad: string
  stock: number
}

// Detalle de un nivel de stock (bajo/medio/bueno) — antes era solo el `title` (tooltip) de la
// tarjeta de nivel en /admin/inventario/stock y /jefe-zona/inventario, que en celular no se ve
// y con muchos productos queda ilegible. Mismo componente para los dos paneles: ninguno de los
// dos muestra costo acá (jefe de zona no lo ve por rol, y esta es una lista operativa de "qué
// reponer", no de valorización — esa ya vive en la tarjeta de "Valorización total"). En
// escritorio la lista va en dos columnas.
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
    <Modal
      title={NIVEL_LABEL[nivel]}
      subtitle={`${productos.length} producto${productos.length === 1 ? '' : 's'}`}
      icon={Package}
      tone={nivel === 'bajo' ? 'danger' : nivel === 'medio' ? 'warning' : 'success'}
      size="lg"
      onClose={onClose}
    >
      {productos.length === 0 ? (
        <p className="rounded-xl bg-neutral-50 py-6 text-center text-sm text-neutral-400">Sin productos en este nivel.</p>
      ) : (
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {productos.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 rounded-xl border border-neutral-100 px-3 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-neutral-900">{p.nombre}</p>
                <p className="text-xs text-neutral-500">{p.unidad}</p>
              </div>
              <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${NIVEL_BADGE_CLASS[nivel]}`}>
                {p.stock} {p.unidad}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  )
}
