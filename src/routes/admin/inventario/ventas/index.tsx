import { createFileRoute } from '@tanstack/react-router'
import { fetchProductos } from '../../../../data/productos'
import { queryKeys } from '../../../../lib/queryKeys'
import { HistorialVentas } from '../../../../components/ventas/HistorialVentas'

export const Route = createFileRoute('/admin/inventario/ventas/')({
  component: VentasHistorialPage,
})

function VentasHistorialPage() {
  return <HistorialVentas cargarProductos={fetchProductos} queryKeyProductos={queryKeys.productosAdmin} esAdmin />
}
