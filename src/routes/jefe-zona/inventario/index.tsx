import { createFileRoute } from '@tanstack/react-router'
import { Boxes } from 'lucide-react'
import { ComingSoon } from '../../../components/layout/ComingSoon'

export const Route = createFileRoute('/jefe-zona/inventario/')({
  component: () => (
    <ComingSoon
      title="Inventario"
      description="Movimientos manuales de productos e insumos, stock actual y alertas de stock mínimo."
      icon={Boxes}
    />
  ),
})
