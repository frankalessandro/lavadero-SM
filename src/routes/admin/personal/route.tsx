import { createFileRoute, Outlet } from '@tanstack/react-router'
import { Users, UserCog } from 'lucide-react'
import { SectionTabs, type SectionTab } from '../../../components/layout/SectionTabs'

// Personal = la gente. Dos listas distintas a propósito:
//  · Lavadores — quienes lavan (comisión, rotación, nunca se eliminan — regla 5). No tienen
//    cuenta: no entran al sistema, se les registra la asistencia y se les liquida.
//  · Usuarios del sistema — las CUENTAS con las que se entra, una por persona, con sus roles.
//
// Hubo una tercera, "Personal de caja" (el roster `personal_operativo` de 0043), que existía
// porque la cuenta era una por rol y compartida, así que no identificaba a nadie. Desde 0056 hay
// una cuenta por persona y esa lista desapareció: la cuenta ES la persona, y responder por una
// caja es simplemente tener ese rol.
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
