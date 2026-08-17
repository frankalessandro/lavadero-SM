import { createFileRoute } from '@tanstack/react-router'
import { ListChecks } from 'lucide-react'
import { ComingSoon } from '../../../components/layout/ComingSoon'

export const Route = createFileRoute('/jefe-zona/seguimiento/')({
  component: () => (
    <ComingSoon
      title="Seguimiento de servicios"
      description="Vista En proceso → Listo → Entregado, con tiempo en patio y reasignación de lavador."
      icon={ListChecks}
    />
  ),
})
