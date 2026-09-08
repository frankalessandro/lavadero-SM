import { createFileRoute, Outlet } from '@tanstack/react-router'
import { ClipboardList, BookUser, ClipboardCheck, ScrollText } from 'lucide-react'
import { SectionTabs, type SectionTab } from '../../../components/layout/SectionTabs'

// Operación = el registro de lo que pasó. Las tres primeras pestañas son la misma actividad vista
// de tres formas: orden por orden (Órdenes), agrupada por placa (Clientes — vista derivada del
// mismo histórico, no una tabla aparte) y cerrada por turno (Turnos y arqueos). Auditoría es la
// cuarta cara: no *qué* pasó sino *quién lo hizo* — la bitácora de 0044, que cruza todas las
// entidades (órdenes, precios, inventario, configuración) y por eso no cabe en ninguna de las otras.
const TABS: SectionTab[] = [
  { to: '/admin/operacion/ordenes', label: 'Órdenes', icon: ClipboardList },
  { to: '/admin/operacion/clientes', label: 'Clientes', icon: BookUser },
  { to: '/admin/operacion/turnos', label: 'Turnos y arqueos', icon: ClipboardCheck },
  { to: '/admin/operacion/auditoria', label: 'Auditoría', icon: ScrollText },
]

export const Route = createFileRoute('/admin/operacion')({
  component: OperacionLayout,
})

function OperacionLayout() {
  return (
    <div className="flex flex-col gap-5">
      <SectionTabs tabs={TABS} />
      <Outlet />
    </div>
  )
}
