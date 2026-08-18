import { db } from '../lib/db'
import {
  entradaInputSchema,
  estanciaParqueaderoSchema,
  type EntradaInput,
  type EstanciaParqueadero,
  type ModalidadParqueadero,
} from '../schemas/estanciaParqueadero'
import { fetchTurnoAbierto } from './turnos'

const ESTANCIA_SELECT =
  'id, placa, modalidad, horaIngreso:hora_ingreso, horaSalida:hora_salida, cobro, metodoPago:metodo_pago, estado'

function inicioDeHoyISO(): string {
  const ahora = new Date()
  return new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate()).toISOString()
}

export async function fetchEstanciasAdentro(): Promise<EstanciaParqueadero[]> {
  const { data, error } = await db
    .from('estancias_parqueadero')
    .select(ESTANCIA_SELECT)
    .eq('estado', 'adentro')
    .order('hora_ingreso', { ascending: false })
  if (error) throw new Error(error.message)
  return estanciaParqueaderoSchema.array().parse(data)
}

export async function fetchResumenHoy(): Promise<{ vehiculosAdentro: number; dineroHoy: number }> {
  const [adentroRes, salidasRes] = await Promise.all([
    db.from('estancias_parqueadero').select('id', { count: 'exact', head: true }).eq('estado', 'adentro'),
    db.from('estancias_parqueadero').select('cobro').eq('estado', 'fuera').gte('hora_salida', inicioDeHoyISO()),
  ])
  if (adentroRes.error) throw new Error(adentroRes.error.message)
  if (salidasRes.error) throw new Error(salidasRes.error.message)

  const dineroHoy = (salidasRes.data ?? []).reduce((total, e) => total + (e.cobro ?? 0), 0)
  return { vehiculosAdentro: adentroRes.count ?? 0, dineroHoy }
}

// Mensualidad y fijo 24h no cobran por movimiento individual — se facturan aparte (mensualidad)
// o ya están cubiertos (fijo) — regla de negocio 17. La tarifa viene de M1 (admin), no hardcodeada.
export async function cobroPorModalidad(modalidad: ModalidadParqueadero): Promise<number> {
  if (modalidad !== 'noche') return 0
  const { data, error } = await db.from('tarifas_parqueadero').select('precio').eq('modalidad', 'noche').single()
  if (error) throw new Error(error.message)
  return data.precio ?? 0
}

export async function registrarEntrada(input: EntradaInput): Promise<EstanciaParqueadero> {
  const parsed = entradaInputSchema.parse(input)
  const turno = await fetchTurnoAbierto('vigilante')
  if (!turno) {
    throw new Error('No hay turno de caja abierto — ábrelo antes de registrar una entrada.')
  }
  const { data, error } = await db
    .from('estancias_parqueadero')
    .insert({ placa: parsed.placa, modalidad: parsed.modalidad })
    .select(ESTANCIA_SELECT)
    .single()
  if (error) throw new Error(error.message)
  return estanciaParqueaderoSchema.parse(data)
}

export async function registrarSalida(
  id: string,
  metodoPago?: 'efectivo' | 'transferencia',
): Promise<EstanciaParqueadero> {
  const { data: actual, error: fetchError } = await db
    .from('estancias_parqueadero')
    .select('modalidad')
    .eq('id', id)
    .single()
  if (fetchError) throw new Error(fetchError.message)

  const cobro = await cobroPorModalidad(actual.modalidad as ModalidadParqueadero)
  const turno = await fetchTurnoAbierto('vigilante')

  const { data, error } = await db
    .from('estancias_parqueadero')
    .update({
      estado: 'fuera',
      hora_salida: new Date().toISOString(),
      cobro,
      metodo_pago: cobro > 0 ? metodoPago : undefined,
      turno_id: turno?.id,
    })
    .eq('id', id)
    .select(ESTANCIA_SELECT)
    .single()
  if (error) throw new Error(error.message)
  return estanciaParqueaderoSchema.parse(data)
}

// Ventana de salida 7:00–8:00am para noche y mensualidad (regla de negocio 7).
export function fueraDeVentanaSalida(modalidad: ModalidadParqueadero, ahora = new Date()): boolean {
  if (modalidad === 'fijo') return false
  const hora = ahora.getHours() + ahora.getMinutes() / 60
  return hora >= 8 && hora < 19
}
