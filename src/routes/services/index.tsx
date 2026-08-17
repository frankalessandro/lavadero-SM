import { createFileRoute, Link } from '@tanstack/react-router'
import { z } from 'zod'
import { fetchServices, type ServiceStatus } from '../../data/services'

const servicesSearchSchema = z.object({
  q: z.string().optional().catch(undefined),
  status: z.enum(['pending', 'in_progress', 'done']).optional().catch(undefined),
})

export const Route = createFileRoute('/services/')({
  validateSearch: servicesSearchSchema,
  loaderDeps: ({ search }) => ({ q: search.q, status: search.status }),
  loader: ({ deps }) => fetchServices(deps),
  pendingComponent: () => <p>Buscando servicios…</p>,
  errorComponent: ({ error }) => <p className="route-status--error">{error.message}</p>,
  component: ServicesList,
})

const STATUSES: ServiceStatus[] = ['pending', 'in_progress', 'done']

function ServicesList() {
  const services = Route.useLoaderData()
  const { q, status } = Route.useSearch()
  const navigate = Route.useNavigate()

  return (
    <section>
      <h1>Servicios</h1>

      <div className="filters">
        <input
          type="search"
          placeholder="Buscar por vehículo o patente…"
          defaultValue={q ?? ''}
          onChange={(event) => {
            const value = event.target.value
            navigate({
              search: (prev) => ({ ...prev, q: value || undefined }),
              replace: true,
            })
          }}
        />
        <select
          value={status ?? ''}
          onChange={(event) => {
            const value = event.target.value as ServiceStatus | ''
            navigate({
              search: (prev) => ({ ...prev, status: value || undefined }),
            })
          }}
        >
          <option value="">Todos los estados</option>
          {STATUSES.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </div>

      <ul className="service-list">
        {services.map((service) => (
          <li key={service.id}>
            <Link to="/services/$serviceId" params={{ serviceId: service.id }} preload="intent">
              {service.vehicle} — {service.plate} ({service.status})
            </Link>
          </li>
        ))}
        {services.length === 0 ? <li>No hay servicios que coincidan.</li> : null}
      </ul>
    </section>
  )
}
