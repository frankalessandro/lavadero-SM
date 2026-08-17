import { createFileRoute } from '@tanstack/react-router'
import { CircleParking } from 'lucide-react'
import { ComingSoon } from '../../../components/layout/ComingSoon'

export const Route = createFileRoute('/admin/parqueadero/')({
  component: () => (
    <ComingSoon
      title="Tarifas de parqueadero"
      description="Configuración de las 3 modalidades independientes: noche ($8.000), mensualidad y fijo 24h."
      icon={CircleParking}
    />
  ),
})
