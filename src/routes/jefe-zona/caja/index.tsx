import { createFileRoute } from '@tanstack/react-router'
import { Wallet } from 'lucide-react'
import { ComingSoon } from '../../../components/layout/ComingSoon'

export const Route = createFileRoute('/jefe-zona/caja/')({
  component: () => (
    <ComingSoon
      title="Caja del día"
      description="Apertura de turno, ingresos por método de pago, arqueo ciego al cierre."
      icon={Wallet}
    />
  ),
})
