import type { ComponentType } from 'react'
import {
  LayoutDashboard,
  TrendingUp,
  ClipboardList,
  Coins,
  Package,
  Users,
  Settings,
  BookUser,
  ClipboardCheck,
  ScrollText,
  FileSpreadsheet,
  Wallet,
  HandCoins,
  Receipt,
  Banknote,
  Boxes,
  Wrench,
  Car,
  CircleParking,
  UserCog,
} from 'lucide-react'

type Icono = ComponentType<{ size?: number; strokeWidth?: number }>

export interface AdminTab {
  to: string
  label: string
  icon: Icono
}

export interface AdminSeccion {
  to: string
  label: string
  icon: Icono
  /** Grupo del sidebar — ordena el menú por frecuencia de uso, no por tabla de BD. */
  grupo: string
  /** Sección con pestañas: el ítem sigue activo mientras se navega entre ellas. */
  exact?: boolean
  tabs?: AdminTab[]
}

// Fuente única del menú de gerencia: la usan el sidebar, las barras de pestañas de cada sección y
// el título del Topbar. Vive fuera de los archivos de ruta para que ninguna ruta importe a otra
// (autoCodeSplitting del router las parte en chunks separados).
export const ADMIN_SECCIONES: AdminSeccion[] = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, grupo: 'Hoy' },
  {
    to: '/admin/operacion',
    label: 'Operación',
    icon: ClipboardList,
    grupo: 'Hoy',
    exact: false,
    tabs: [
      { to: '/admin/operacion/ordenes', label: 'Órdenes', icon: ClipboardList },
      { to: '/admin/operacion/parqueadero', label: 'Parqueadero', icon: CircleParking },
      { to: '/admin/operacion/turnos', label: 'Turnos y arqueos', icon: ClipboardCheck },
      { to: '/admin/operacion/clientes', label: 'Clientes', icon: BookUser },
      { to: '/admin/operacion/auditoria', label: 'Auditoría', icon: ScrollText },
    ],
  },
  { to: '/admin/rentabilidad', label: 'Rentabilidad', icon: TrendingUp, grupo: 'Análisis' },
  { to: '/admin/reportes', label: 'Reportes', icon: FileSpreadsheet, grupo: 'Análisis' },
  {
    to: '/admin/dinero',
    label: 'Dinero',
    icon: Coins,
    grupo: 'Gestión',
    exact: false,
    tabs: [
      { to: '/admin/dinero/liquidaciones', label: 'Liquidaciones', icon: Wallet },
      { to: '/admin/dinero/deudas', label: 'Deudas', icon: HandCoins },
      { to: '/admin/dinero/gastos', label: 'Gastos', icon: Receipt },
      { to: '/admin/dinero/ingresos', label: 'Otros ingresos', icon: Banknote },
      { to: '/admin/dinero/inventario', label: 'Inventario', icon: Boxes },
    ],
  },
  {
    to: '/admin/personal',
    label: 'Personal',
    icon: Users,
    grupo: 'Gestión',
    exact: false,
    tabs: [
      { to: '/admin/personal/lavadores', label: 'Lavadores', icon: Users },
      { to: '/admin/personal/usuarios', label: 'Usuarios', icon: UserCog },
    ],
  },
  {
    to: '/admin/catalogo',
    label: 'Catálogo y precios',
    icon: Package,
    grupo: 'Ajustes',
    exact: false,
    tabs: [
      { to: '/admin/catalogo/combos', label: 'Combos y precios', icon: Package },
      { to: '/admin/catalogo/servicios', label: 'Servicios', icon: Wrench },
      { to: '/admin/catalogo/tipos-vehiculo', label: 'Tipos de vehículo', icon: Car },
      { to: '/admin/catalogo/parqueadero', label: 'Parqueadero', icon: CircleParking },
    ],
  },
  { to: '/admin/configuracion', label: 'Configuración', icon: Settings, grupo: 'Ajustes' },
]

export function tabsDe(seccionTo: string): AdminTab[] {
  return ADMIN_SECCIONES.find((s) => s.to === seccionTo)?.tabs ?? []
}

export interface UbicacionAdmin {
  seccion: string
  seccionTo: string
  icon: Icono
  pagina?: string
}

/** Sección + pestaña activas para el título del Topbar (ej. "Dinero" › "Liquidaciones"). Sirve
 *  para cualquier área con menú (gerencia, jefe de patio): la primera sección es la raíz. */
export function ubicacionEn(secciones: AdminSeccion[], pathname: string): UbicacionAdmin {
  const raiz = secciones[0]
  const limpio = pathname.replace(/\/+$/, '') || raiz.to
  const directa = secciones.find((s) => !s.tabs && s.to === limpio)
  if (directa) return { seccion: directa.label, seccionTo: directa.to, icon: directa.icon }
  for (const s of secciones) {
    const tab = s.tabs?.find((t) => limpio === t.to || limpio.startsWith(`${t.to}/`))
    if (tab) return { seccion: s.label, seccionTo: s.to, icon: s.icon, pagina: tab.label }
  }
  const padre = secciones.find((s) => s.to !== raiz.to && limpio.startsWith(s.to)) ?? raiz
  return { seccion: padre.label, seccionTo: padre.to, icon: padre.icon }
}

export function ubicacionAdmin(pathname: string): UbicacionAdmin {
  return ubicacionEn(ADMIN_SECCIONES, pathname)
}
