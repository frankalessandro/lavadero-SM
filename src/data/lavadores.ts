import type { Lavador } from '../schemas/lavador'

// 4 lavadores por prestación de servicios (Plan §3) — uno con pago diario por estar en periodo de inicio.
const LAVADORES: Lavador[] = [
  { id: 'l1', nombre: 'Carlos Pérez', activo: true, pagoDiario: false },
  { id: 'l2', nombre: 'Luis Gómez', activo: true, pagoDiario: false },
  { id: 'l3', nombre: 'Andrés Ruiz', activo: true, pagoDiario: false },
  { id: 'l4', nombre: 'Miguel Torres', activo: true, pagoDiario: true },
]

// Cola de rotación por orden de llegada (M9, simplificada — sin registro de asistencia todavía).
// El primero de la cola es la sugerencia automática; al asignar (sugerido o elegido manualmente),
// ese lavador pasa al final y conserva su posición para la siguiente ronda (regla de negocio 9/10).
let COLA: string[] = LAVADORES.filter((l) => l.activo).map((l) => l.id)

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export async function fetchLavadores(): Promise<Lavador[]> {
  await delay(200)
  return [...LAVADORES]
}

export function suggestNextLavador(): string | undefined {
  return COLA[0]
}

export function registrarAsignacion(lavadorId: string) {
  COLA = COLA.filter((id) => id !== lavadorId)
  COLA.push(lavadorId)
}

export function getCola(): string[] {
  return [...COLA]
}
