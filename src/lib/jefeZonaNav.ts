import { LayoutDashboard, Wallet, ShoppingCart, Boxes, Coins, CalendarCheck, CircleParking } from 'lucide-react'
import { ubicacionEn, type AdminSeccion, type UbicacionAdmin } from './adminNav'

// Menú del jefe de patio, mismo formato que el de gerencia (src/lib/adminNav.ts) para que las dos
// áreas se lean igual. "Recepción" no tiene ítem propio a propósito: el dashboard (= seguimiento)
// abre con el acceso a recepción, un ítem aparte solo duplicaba ese enlace. Ventas e Inventario
// van separados porque tienen ritmos distintos: vender es de caja y frecuente, inventario es control.
export const JEFE_ZONA_SECCIONES: AdminSeccion[] = [
  { to: '/jefe-zona', label: 'Seguimiento', icon: LayoutDashboard, grupo: 'Turno' },
  { to: '/jefe-zona/caja', label: 'Caja', icon: Wallet, grupo: 'Turno' },
  { to: '/jefe-zona/ventas', label: 'Ventas', icon: ShoppingCart, grupo: 'Turno' },
  { to: '/jefe-zona/parqueadero', label: 'Parqueadero', icon: CircleParking, grupo: 'Turno' },
  { to: '/jefe-zona/inventario', label: 'Inventario', icon: Boxes, grupo: 'Control' },
  { to: '/jefe-zona/asistencia', label: 'Asistencia', icon: CalendarCheck, grupo: 'Control' },
  { to: '/jefe-zona/liquidaciones', label: 'Liquidaciones', icon: Coins, grupo: 'Control' },
]

export function ubicacionJefeZona(pathname: string): UbicacionAdmin {
  return ubicacionEn(JEFE_ZONA_SECCIONES, pathname)
}
