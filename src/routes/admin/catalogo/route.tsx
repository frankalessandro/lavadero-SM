import { createFileRoute, Outlet } from '@tanstack/react-router'
import { Package, Wrench, Car, CircleParking } from 'lucide-react'
import { SectionTabs, type SectionTab } from '../../../components/layout/SectionTabs'

// Catálogo y precios = qué se vende y a cuánto. Las cuatro pestañas son una sola tarea repartida:
// un combo se compone de servicios y se cotiza por tipo de vehículo, así que definir un precio
// obliga a moverse entre las tres primeras. Combos va de primero a propósito: es la única que se
// toca seguido — Servicios y Tipos de vehículo existen sobre todo para alimentarla.
const TABS: SectionTab[] = [
  { to: '/admin/catalogo/combos', label: 'Combos y precios', icon: Package },
  { to: '/admin/catalogo/servicios', label: 'Servicios', icon: Wrench },
  { to: '/admin/catalogo/tipos-vehiculo', label: 'Tipos de vehículo', icon: Car },
  { to: '/admin/catalogo/parqueadero', label: 'Parqueadero', icon: CircleParking },
]

export const Route = createFileRoute('/admin/catalogo')({
  component: CatalogoLayout,
})

function CatalogoLayout() {
  return (
    <div className="flex flex-col gap-5">
      <SectionTabs tabs={TABS} />
      <Outlet />
    </div>
  )
}
