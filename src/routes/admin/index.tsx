import { createFileRoute } from '@tanstack/react-router'
import { Droplets, Users, CircleParking, Wallet } from 'lucide-react'
import { StatCard } from '../../components/layout/StatCard'
import { Card } from '../../components/layout/Card'

export const Route = createFileRoute('/admin/')({
  component: AdminDashboard,
})

function AdminDashboard() {
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Lavados de hoy" value="—" hint="Sin datos aún" icon={Droplets} />
        <StatCard label="Lavadores en turno" value="—" hint="Sin datos aún" icon={Users} />
        <StatCard label="Ocupación parqueadero" value="—" hint="Sin datos aún" icon={CircleParking} />
        <StatCard label="Caja esperada" value="—" hint="Sin datos aún" icon={Wallet} />
      </div>

      <Card className="text-left">
        <h2 className="mb-1 text-sm font-semibold text-neutral-900">Panel en construcción</h2>
        <p className="text-sm text-neutral-500">
          Los indicadores se conectan cuando el turno de caja y las órdenes tengan datos reales.
          Por ahora, usa el menú para administrar los maestros de M1 (tipos de vehículo, combos,
          precios, tarifas de parqueadero y lavadores).
        </p>
      </Card>
    </div>
  )
}
