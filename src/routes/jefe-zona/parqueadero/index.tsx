import { createFileRoute } from '@tanstack/react-router'
import { SuscriptoresParqueadero } from '../../../components/parqueadero/SuscriptoresParqueadero'
import { PageHeader } from '../../../components/layout/PageHeader'

export const Route = createFileRoute('/jefe-zona/parqueadero/')({
  component: ParqueaderoJefeZona,
})

function ParqueaderoJefeZona() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Parqueadero"
        description="Suscriptores de mensualidad y fijo 24h: cobra la renovación y avisa antes del vencimiento."
        help={{
          body: 'A los suscriptores les pueden pagar tanto el jefe de patio como el vigilante. El valor del mes sale de la tarifa de su tipo de vehículo y condición — no se digita.\n\nTocar una suscripción abre todo: cobrar la renovación (efectivo, transferencia o datáfono), avisar por WhatsApp, ver los pagos, editar los datos o inactivarla. Para cobrar necesitas tu turno abierto.',
        }}
      />
      <SuscriptoresParqueadero />
    </div>
  )
}
