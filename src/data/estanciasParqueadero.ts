import {
  entradaInputSchema,
  type EntradaInput,
  type EstanciaParqueadero,
  type ModalidadParqueadero,
} from '../schemas/estanciaParqueadero'

// Tarifa de noche fija (Plan §5). Mensualidad y fijo 24h no cobran por movimiento individual
// — se facturan aparte (mensualidad) o ya están cubiertos (fijo) — regla de negocio 17.
const TARIFA_NOCHE = 8000

let ESTANCIAS: EstanciaParqueadero[] = []

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function esHoy(iso: string) {
  const fecha = new Date(iso)
  const hoy = new Date()
  return (
    fecha.getFullYear() === hoy.getFullYear() &&
    fecha.getMonth() === hoy.getMonth() &&
    fecha.getDate() === hoy.getDate()
  )
}

export async function fetchEstanciasAdentro(): Promise<EstanciaParqueadero[]> {
  await delay(250)
  return ESTANCIAS.filter((e) => e.estado === 'adentro').sort(
    (a, b) => new Date(b.horaIngreso).getTime() - new Date(a.horaIngreso).getTime(),
  )
}

export async function fetchResumenHoy(): Promise<{ vehiculosAdentro: number; dineroHoy: number }> {
  await delay(150)
  const vehiculosAdentro = ESTANCIAS.filter((e) => e.estado === 'adentro').length
  const dineroHoy = ESTANCIAS.filter((e) => e.horaSalida && esHoy(e.horaSalida) && e.cobro).reduce(
    (total, e) => total + (e.cobro ?? 0),
    0,
  )
  return { vehiculosAdentro, dineroHoy }
}

export function cobroPorModalidad(modalidad: ModalidadParqueadero): number {
  return modalidad === 'noche' ? TARIFA_NOCHE : 0
}

export async function registrarEntrada(input: EntradaInput): Promise<EstanciaParqueadero> {
  const parsed = entradaInputSchema.parse(input)
  await delay(250)
  const estancia: EstanciaParqueadero = {
    id: crypto.randomUUID(),
    placa: parsed.placa,
    modalidad: parsed.modalidad,
    horaIngreso: new Date().toISOString(),
    estado: 'adentro',
  }
  ESTANCIAS = [...ESTANCIAS, estancia]
  return estancia
}

export async function registrarSalida(
  id: string,
  metodoPago?: 'efectivo' | 'transferencia',
): Promise<EstanciaParqueadero> {
  await delay(250)
  let actualizada: EstanciaParqueadero | undefined
  ESTANCIAS = ESTANCIAS.map((e) => {
    if (e.id !== id) return e
    actualizada = {
      ...e,
      estado: 'fuera',
      horaSalida: new Date().toISOString(),
      cobro: cobroPorModalidad(e.modalidad),
      metodoPago,
    }
    return actualizada
  })
  if (!actualizada) throw new Error(`Estancia ${id} no encontrada`)
  return actualizada
}

// Ventana de salida 7:00–8:00am para noche y mensualidad (regla de negocio 7).
export function fueraDeVentanaSalida(modalidad: ModalidadParqueadero, ahora = new Date()): boolean {
  if (modalidad === 'fijo') return false
  const hora = ahora.getHours() + ahora.getMinutes() / 60
  return hora >= 8 && hora < 19
}
