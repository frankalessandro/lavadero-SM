import { createFileRoute } from '@tanstack/react-router'
import { Sparkles } from 'lucide-react'
import { ComingSoon } from '../../../components/layout/ComingSoon'

export const Route = createFileRoute('/admin/combos/')({
  component: () => (
    <ComingSoon
      title="Combos"
      description="Catálogo de combos de lavado (autos/camionetas y motos), con estado activo/inactivo. Próximo en construirse sobre la base de tipos de vehículo."
      icon={Sparkles}
    />
  ),
})
