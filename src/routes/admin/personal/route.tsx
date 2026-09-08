import { createFileRoute, Outlet } from '@tanstack/react-router'
import { Users, UserCog, IdCard } from 'lucide-react'
import { SectionTabs, type SectionTab } from '../../../components/layout/SectionTabs'

// Personal = la gente. Tres listas distintas a propósito:
//  · Lavadores — quienes lavan (comisión, rotación, nunca se eliminan — regla 5).
//  · Personal de caja — las PERSONAS que abren caja y responden por un turno. No son usuarios de
//    Supabase: hay una sola cuenta por rol, compartida, así que la persona se identifica acá y no
//    por el login (ver 0043_personal_operativo.sql). Es el roster del selector de "quién abre el
//    turno" y el sujeto de la comisión de jefe de patio.
//  · Usuarios del sistema — las CUENTAS con las que se entra (una por rol) y su estado.
const TABS: SectionTab[] = [
  { to: '/admin/personal/lavadores', label: 'Lavadores', icon: Users },
  { to: '/admin/personal/caja', label: 'Personal de caja', icon: IdCard },
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
