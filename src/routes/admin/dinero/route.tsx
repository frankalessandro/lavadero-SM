import { createFileRoute, Outlet } from '@tanstack/react-router'
import { SectionTabs } from '../../../components/layout/SectionTabs'
import { tabsDe } from '../../../lib/adminNav'

// Pestañas definidas en src/lib/adminNav.ts (fuente única del menú de gerencia).
const TABS = tabsDe('/admin/dinero')

export const Route = createFileRoute('/admin/dinero')({
  component: SeccionLayout,
})

function SeccionLayout() {
  return (
    <div className="flex flex-col gap-6">
      <SectionTabs tabs={TABS} />
      <Outlet />
    </div>
  )
}
