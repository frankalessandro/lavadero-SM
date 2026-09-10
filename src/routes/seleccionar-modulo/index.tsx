import { useState } from 'react'
import { createFileRoute, redirect } from '@tanstack/react-router'
import { LayoutDashboard, ClipboardList, Droplets, LogOut, ChevronRight } from 'lucide-react'
import { Card } from '../../components/layout/Card'
import { ROL_HOME, signOut } from '../../lib/auth'
import { setRolActivo } from '../../data/perfiles'
import { ROL_LABEL, type Rol } from '../../schemas/perfil'
import logoMark from '../../assets/logo-mark.png'

const ROL_ICON: Record<Rol, typeof LayoutDashboard> = {
  admin: LayoutDashboard,
  jefe_zona: ClipboardList,
  vigilante: Droplets,
}

const ROL_DESC: Record<Rol, string> = {
  admin: 'Dashboards, rentabilidad, catálogo, personal y auditoría',
  jefe_zona: 'Recepción, seguimiento, caja, ventas e inventario',
  vigilante: 'Parqueadero y caja de la noche',
}

export const Route = createFileRoute('/seleccionar-modulo/')({
  beforeLoad: ({ context }) => {
    if (!context.auth) throw redirect({ to: '/login' })
    if (context.auth.perfil.debeCambiarPassword) throw redirect({ to: '/cambiar-password' })
    const { roles } = context.auth.perfil
    if (roles.length === 0) throw redirect({ to: '/login' })
    if (roles.length === 1) throw redirect({ to: ROL_HOME[roles[0]] })
  },
  component: SeleccionarModuloPage,
})

function SeleccionarModuloPage() {
  const { auth } = Route.useRouteContext()
  const [entrando, setEntrando] = useState<Rol | null>(null)
  const roles = auth?.perfil.roles ?? []

  async function elegir(rol: Rol) {
    setEntrando(rol)
    try {
      // En local guarda en sessionStorage en vez de llamar la RPC (ver setRolActivo) — mismo
      // efecto: el hard-nav de abajo hace que App vuelva a resolver el contexto y ya lo vea.
      await setRolActivo(rol)
      window.location.assign(ROL_HOME[rol])
    } catch {
      setEntrando(null)
    }
  }

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-neutral-50 px-4">
      <Card className="w-full max-w-md p-6 sm:p-7">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <img src={logoMark} alt="Carwash SM" className="size-14 shrink-0 object-contain" />
          <h1 className="text-lg font-semibold text-neutral-900">¿A qué módulo quieres entrar?</h1>
          {auth?.perfil.nombre ? <p className="text-sm text-neutral-500">{auth.perfil.nombre}</p> : null}
        </div>

        <div className="flex flex-col gap-3">
          {roles.map((rol) => {
            const Icon = ROL_ICON[rol]
            return (
              <button
                key={rol}
                type="button"
                disabled={entrando !== null}
                onClick={() => void elegir(rol)}
                className="group flex items-center gap-3 rounded-xl border border-neutral-200 p-4 text-left transition-colors hover:border-primary-300 hover:bg-primary-50/50 disabled:opacity-60"
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-600">
                  <Icon size={20} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-neutral-900">{ROL_LABEL[rol]}</span>
                  <span className="block text-xs text-neutral-500">{ROL_DESC[rol]}</span>
                </span>
                <ChevronRight size={18} className="shrink-0 text-neutral-300 transition-colors group-hover:text-primary-600" />
              </button>
            )
          })}
        </div>

        <button
          type="button"
          onClick={() => void signOut().then(() => window.location.assign('/login'))}
          className="mt-5 flex w-full items-center justify-center gap-1.5 rounded-lg py-2.5 text-sm font-medium text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
        >
          <LogOut size={15} />
          Cerrar sesión
        </button>
      </Card>
    </div>
  )
}
