import { createFileRoute, Outlet } from '@tanstack/react-router'
import { Wallet, Receipt, Boxes } from 'lucide-react'
import { SectionTabs, type SectionTab } from '../../../components/layout/SectionTabs'

// Dinero = lo que entra, lo que sale y a quién se le paga. Inventario vive acá (y no en
// Operación) porque es un centro de costo con dos caras de plata: la valorización del stock y las
// ventas de mostrador, que entran al arqueo de caja igual que un lavado cobrado.
const TABS: SectionTab[] = [
  { to: '/admin/dinero/liquidaciones', label: 'Liquidaciones', icon: Wallet },
  { to: '/admin/dinero/gastos', label: 'Gastos', icon: Receipt },
  { to: '/admin/dinero/inventario', label: 'Inventario y ventas', icon: Boxes },
]

export const Route = createFileRoute('/admin/dinero')({
  component: DineroLayout,
})

function DineroLayout() {
  return (
    <div className="flex flex-col gap-5">
      <SectionTabs tabs={TABS} />
      <Outlet />
    </div>
  )
}
