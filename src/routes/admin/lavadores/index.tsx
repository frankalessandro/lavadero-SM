import { createFileRoute } from '@tanstack/react-router'
import { Users } from 'lucide-react'
import { ComingSoon } from '../../../components/layout/ComingSoon'

export const Route = createFileRoute('/admin/lavadores/')({
  component: () => (
    <ComingSoon
      title="Lavadores"
      description="Perfil de lavadores: datos personales, fecha de ingreso, estado activo/inactivo (nunca se eliminan) y excepción de pago diario."
      icon={Users}
    />
  ),
})
