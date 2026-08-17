import { createFileRoute } from '@tanstack/react-router'
import { Tag } from 'lucide-react'
import { ComingSoon } from '../../../components/layout/ComingSoon'

export const Route = createFileRoute('/admin/lista-precios/')({
  component: () => (
    <ComingSoon
      title="Lista de precios"
      description="Matriz de precios: cada combo tiene un precio distinto según el tipo de vehículo. Depende de que existan combos configurados."
      icon={Tag}
    />
  ),
})
