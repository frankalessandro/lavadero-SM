import { createFileRoute, Link } from '@tanstack/react-router'
import { Droplets, ClipboardList, Users, Wallet, ArrowRight } from 'lucide-react'
import { StatCard } from '../../components/layout/StatCard'
import { Card } from '../../components/layout/Card'

export const Route = createFileRoute('/jefe-zona/')({
  component: JefeZonaDashboard,
})

function JefeZonaDashboard() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-start gap-3 rounded-2xl bg-primary-600 p-5 text-white shadow-card sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold">Recepción de lavado</h2>
          <p className="text-sm text-primary-100">Ingreso de vehículos, combos y cobro — la pantalla principal para celular.</p>
        </div>
        <Link
          to="/recepcion"
          className="flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-primary-700 transition-colors hover:bg-primary-50"
        >
          Abrir recepción <ArrowRight size={15} />
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Lavados de hoy" value="—" hint="Sin datos aún" icon={Droplets} />
        <StatCard label="En proceso" value="—" hint="Sin datos aún" icon={ClipboardList} />
        <StatCard label="Lavadores en turno" value="—" hint="Sin datos aún" icon={Users} />
        <StatCard label="Caja del día" value="—" hint="Sin datos aún" icon={Wallet} />
      </div>

      <Card className="text-left">
        <h2 className="mb-1 text-sm font-semibold text-neutral-900">Panel en construcción</h2>
        <p className="text-sm text-neutral-500">
          Sin costos, márgenes ni histórico financiero — este dashboard es solo operativo (M10).
        </p>
      </Card>
    </div>
  )
}
