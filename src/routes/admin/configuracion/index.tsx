import { createFileRoute } from '@tanstack/react-router'
import { Settings } from 'lucide-react'
import { ComingSoon } from '../../../components/layout/ComingSoon'

export const Route = createFileRoute('/admin/configuracion/')({
  component: () => (
    <ComingSoon
      title="Configuración"
      description="Porcentaje de comisión del lavador, base de cálculo, descuentos, categorías de gasto y datos del negocio para el tiquete."
      icon={Settings}
    />
  ),
})
