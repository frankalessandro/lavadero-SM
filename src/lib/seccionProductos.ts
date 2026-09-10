import { SECCION_PRODUCTO_LABEL, type Producto, type SeccionProducto } from '../schemas/producto'

export interface GrupoSeccion {
  key: SeccionProducto | 'otros'
  label: string
  productos: Producto[]
}

// Agrupa productos vendibles por sección (0058), en orden fijo bebidas → snacks → "Sin sección"
// — esta última solo aparece si algún producto quedó sin clasificar. Compartido por el conteo de
// inventario y las pantallas de venta; en `lib/` y no en un componente por
// `react-refresh/only-export-components` (mismo motivo que `src/lib/pagoLineas.ts`).
export function agruparPorSeccion(productos: Producto[]): GrupoSeccion[] {
  const orden: (SeccionProducto | 'otros')[] = ['bebida', 'snack', 'otros']
  const buckets = new Map<SeccionProducto | 'otros', Producto[]>()
  for (const p of productos) {
    const k = p.seccion ?? 'otros'
    const lista = buckets.get(k) ?? []
    lista.push(p)
    buckets.set(k, lista)
  }
  return orden
    .filter((k) => buckets.has(k))
    .map((k) => ({
      key: k,
      label: k === 'otros' ? 'Sin sección' : SECCION_PRODUCTO_LABEL[k],
      productos: buckets.get(k)!,
    }))
}
