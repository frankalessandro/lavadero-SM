import { createFileRoute, Link } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { fetchProductosOperativo } from '../../../data/productos'
import { queryKeys } from '../../../lib/queryKeys'
import { HistorialVentas } from '../../../components/ventas/HistorialVentas'

export const Route = createFileRoute('/jefe-zona/ventas/historial')({
  component: HistorialVentasPage,
})

function HistorialVentasPage() {
  return (
    <div className="flex flex-col gap-4">
      <Link
        to="/jefe-zona/ventas"
        className="flex w-fit items-center gap-1.5 text-sm font-medium text-neutral-500 transition-colors hover:text-primary-700"
      >
        <ArrowLeft size={15} /> Volver a Ventas
      </Link>
      <HistorialVentas cargarProductos={fetchProductosOperativo} queryKeyProductos={queryKeys.productosOperativo} />
    </div>
  )
}
