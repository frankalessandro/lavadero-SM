export type ServiceStatus = 'pending' | 'in_progress' | 'done'

export interface Service {
  id: string
  vehicle: string
  plate: string
  status: ServiceStatus
  price: number
}

const SERVICES: Service[] = [
  { id: '1', vehicle: 'Toyota Corolla', plate: 'AB123CD', status: 'done', price: 8000 },
  { id: '2', vehicle: 'Ford Ranger', plate: 'AC456EF', status: 'in_progress', price: 15000 },
  { id: '3', vehicle: 'VW Gol', plate: 'AD789GH', status: 'pending', price: 6000 },
  { id: '4', vehicle: 'Chevrolet Onix', plate: 'AE012IJ', status: 'pending', price: 7000 },
  { id: '5', vehicle: 'Renault Kangoo', plate: 'AF345KL', status: 'done', price: 12000 },
]

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export async function fetchServices(params: {
  status?: ServiceStatus
  q?: string
}): Promise<Service[]> {
  await delay(400)
  return SERVICES.filter((service) => {
    const matchesStatus = !params.status || service.status === params.status
    const matchesQuery =
      !params.q ||
      service.vehicle.toLowerCase().includes(params.q.toLowerCase()) ||
      service.plate.toLowerCase().includes(params.q.toLowerCase())
    return matchesStatus && matchesQuery
  })
}

export async function fetchServiceById(id: string): Promise<Service> {
  await delay(400)
  const service = SERVICES.find((item) => item.id === id)
  if (!service) {
    throw new Error(`Service ${id} not found`)
  }
  return service
}
