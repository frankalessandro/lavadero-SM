import { createFileRoute } from '@tanstack/react-router'
import { CronogramaPanel } from '../../../../components/cronograma/CronogramaPanel'
import { PageHeader } from '../../../../components/layout/PageHeader'
import { fechaLocalISO } from '../../../../lib/periodo'

export const Route = createFileRoute('/admin/personal/cronograma/')({
  component: CronogramaAdminPage,
})

function CronogramaAdminPage() {
  const { auth } = Route.useRouteContext()
  const actor = auth?.perfil.nombre?.trim() || 'Gerencia'

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Cronograma de lavadores"
        description="Descansos, quién entra a las 7am y lava el baño, quién sale a las 7pm, y permisos — por mes."
        help={{
          body: 'La rotación se genera sola: de lunes a jueves descansa un lavador por día, el que descansó entra a las 7am y lava el baño, y el que descansa mañana sale a las 7pm. Viernes a domingo trabajan todos.\n\nToca un día para cambiarlo a mano (si los muchachos se cambiaron entre ellos), marcar el baño como hecho o registrar un permiso. Con permiso no se marca asistencia. El jefe de patio ve y edita el mismo cronograma desde Asistencia. Todo cambio queda en Auditoría.',
        }}
      />
      <CronogramaPanel actor={actor} hoyISO={fechaLocalISO(new Date())} />
    </div>
  )
}
