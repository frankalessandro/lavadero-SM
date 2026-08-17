import { createFileRoute, Link } from '@tanstack/react-router'
import { fetchServiceById } from '../../data/services'

export const Route = createFileRoute('/services/$serviceId')({
  loader: ({ params }) => fetchServiceById(params.serviceId),
  pendingComponent: () => <p>Cargando servicio…</p>,
  errorComponent: ({ error }) => (
    <div className="route-status--error">
      <p>{error.message}</p>
      <Link to="/services">Volver a servicios</Link>
    </div>
  ),
  component: ServiceDetail,
})

function ServiceDetail() {
  const service = Route.useLoaderData()

  return (
    <section>
      <Link to="/services">← Volver a servicios</Link>
      <h1>{service.vehicle}</h1>
      <dl>
        <dt>Patente</dt>
        <dd>{service.plate}</dd>
        <dt>Estado</dt>
        <dd>{service.status}</dd>
        <dt>Precio</dt>
        <dd>${service.price}</dd>
      </dl>
    </section>
  )
}
