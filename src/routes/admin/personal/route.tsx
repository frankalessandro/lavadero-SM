import { createFileRoute, Outlet } from '@tanstack/react-router'
import { Users, UserCog } from 'lucide-react'
import { SectionTabs, type SectionTab } from '../../../components/layout/SectionTabs'

// Personal = la gente. Dos listas distintas a propósito: Lavadores son quienes lavan (cobran
// comisión, entran en la rotación, nunca se eliminan — regla de negocio 5) y Usuarios son quienes
// entran al sistema con un rol. Un lavador normalmente NO tiene usuario, y un vigilante sí.
const TABS: SectionTab[] = [
  { to: '/admin/personal/lavadores', label: 'Lavadores', icon: Users },
  { to: '/admin/personal/usuarios', label: 'Usuarios del sistema', icon: UserCog },
]

export const Route = createFileRoute('/admin/personal')({
  component: PersonalLayout,
})

function PersonalLayout() {
  return (
    <div className="flex flex-col gap-5">
      <SectionTabs tabs={TABS} />
      <Outlet />
    </div>
  )
}
