import { db } from '../lib/db'
import {
  entradaInputSchema,
  estanciaParqueaderoSchema,
  type EntradaInput,
  type EstanciaParqueadero,
  type ModalidadParqueadero,
  type MetodoPagoParqueadero,
  type ClaseVehiculoParqueadero,
} from '../schemas/estanciaParqueadero'
import { fetchTurnoAbierto } from './turnos'

const ESTANCIA_SELECT =
  'id, consecutivo, placa, modalidad, claseVehiculo:clase_vehiculo, horaIngreso:hora_ingreso, horaSalida:hora_salida, cobro, multa, metodoPago:metodo_pago, estado'

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

// Salidas (con cobro) cuya `hora_salida` cae en [desdeISO, hastaISO) — fuente de "ingresos de
// parqueadero" en el histórico de rentabilidad (/admin/rentabilidad). Se trae `horaSalida`
// para poder agrupar el cobro por día calendario local.
export async function fetchSalidasParqueaderoEnRango(
  desdeISO: string,
  hastaISO: string,
): Promise<{ cobro: number; horaSalida: string }[]> {
  const { data, error } = await db
    .from('estancias_parqueadero')
    .select('cobro, horaSalida:hora_salida')
    .eq('estado', 'fuera')
    .gte('hora_salida', desdeISO)
    .lt('hora_salida', hastaISO)
  if (error) throw new Error(error.message)
  return ((data ?? []) as { cobro: number | null; horaSalida: string }[]).map((e) => ({
    cobro: e.cobro ?? 0,
    horaSalida: e.horaSalida,
  }))
}

// Tarifa de la noche para una clase — solo para el aviso "se cobra $X al retiro" al registrar la
// entrada. El cobro real lo fija la base al salir (registrar_salida_parqueadero).
export async function tarifaNoche(clase: ClaseVehiculoParqueadero): Promise<number> {
  const { data, error } = await db
    .from('tarifas_parqueadero')
    .select('precio')
    .eq('modalidad', 'noche')
    .eq('clase_vehiculo', clase)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data?.precio ?? 0
}

export interface CobroPrevisto {
  tarifa: number
  multa: number
  total: number
  fueraDeVentana: boolean
}

// Lo que se cobraría si el vehículo sale AHORA — misma cuenta que la RPC de salida (0075), sin
// modificar nada. La pantalla nunca calcula el cobro por su lado.
export async function fetchCobroPrevisto(estanciaId: string): Promise<CobroPrevisto> {
  const { data, error } = await db.rpc('cobro_previsto_parqueadero', { p_estancia_id: estanciaId })
  if (error) throw new Error(error.message)
  const row = (data as Record<string, unknown>[])[0] ?? {}
  return {
    tarifa: Number(row.tarifa ?? 0),
    multa: Number(row.multa ?? 0),
    total: Number(row.total ?? 0),
    fueraDeVentana: Boolean(row.fuera_de_ventana),
  }
}

// Última estancia de una placa (autocompletado en la entrada: trae clase y modalidad de la vez
// pasada, M4 "autocompletado de placa desde el histórico").
export async function fetchUltimaEstanciaPorPlaca(placa: string): Promise<EstanciaParqueadero | undefined> {
  const normalizada = placa.trim().toUpperCase()
  if (normalizada.length < 5) return undefined
  const { data, error } = await db
    .from('estancias_parqueadero')
    .select(ESTANCIA_SELECT)
    .eq('placa', normalizada)
    .order('hora_ingreso', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data ? estanciaParqueaderoSchema.parse(data) : undefined
}

export async function registrarEntrada(input: EntradaInput): Promise<EstanciaParqueadero> {
  const parsed = entradaInputSchema.parse(input)
  const turno = await fetchTurnoAbierto('vigilante')
  if (!turno) {
    throw new Error('No hay turno de caja abierto — ábrelo antes de registrar una entrada.')
  }
  const { data, error } = await db
    .from('estancias_parqueadero')
    .insert({ placa: parsed.placa, modalidad: parsed.modalidad, clase_vehiculo: parsed.claseVehiculo })
    .select(ESTANCIA_SELECT)
    .single()
  if (error) throw new Error(error.message)
  return estanciaParqueaderoSchema.parse(data)
}

// Va por la RPC `registrar_salida_parqueadero` (0045), no por un UPDATE suelto: la salida es el
// momento en que se fija el cobro (regla 17), así que la tarifa, el turno al que se imputa y el
// cambio de estado tienen que resolverse en la base, en una transacción, y no en tres llamadas
// desde el cliente. Desde 0045 el vigilante ya no tiene UPDATE directo sobre `estancias_parqueadero`.
export async function registrarSalida(
  id: string,
  metodoPago?: MetodoPagoParqueadero,
): Promise<EstanciaParqueadero> {
  const { data, error } = await db
    .rpc('registrar_salida_parqueadero', { p_estancia_id: id, p_metodo_pago: metodoPago ?? null })
    .select(ESTANCIA_SELECT)
    .single()
  if (error) throw new Error(error.message)
  return estanciaParqueaderoSchema.parse(data)
}

export interface LavadoHoy {
  consecutivo: number
  estado: 'en_proceso' | 'listo' | 'entregado'
  creadoEn: string
  entregadaEn?: string
}

// ¿Esta placa pasó por el lavadero hoy? (regla de negocio 8: un vehículo lavado no genera cobro
// de parqueadero combinado). Va por la RPC `lavado_hoy_por_placa` (0050) porque el vigilante no
// tiene acceso de lectura a `ordenes` — la RPC devuelve solo consecutivo/estado/horas, sin datos
// sensibles. `p_desde` = inicio del día en hora local (Supabase corre en UTC).
export async function fetchLavadoHoyPorPlaca(placa: string): Promise<LavadoHoy | undefined> {
  const normalizada = placa.trim().toUpperCase()
  if (!normalizada) return undefined
  const desde = new Date()
  desde.setHours(0, 0, 0, 0)
  const { data, error } = await db.rpc('lavado_hoy_por_placa', {
    p_placa: normalizada,
    p_desde: desde.toISOString(),
  })
  if (error) throw new Error(error.message)
  const row = (data as Record<string, unknown>[])[0]
  if (!row) return undefined
  return {
    consecutivo: row.consecutivo as number,
    estado: row.estado as LavadoHoy['estado'],
    creadoEn: row.creado_en as string,
    entregadaEn: (row.entregada_en as string | null) ?? undefined,
  }
}

// Ventana de salida (regla de negocio 7), espejo de `interno.fuera_de_ventana_salida` (0075):
// el límite son las 8:00 am siguientes al ingreso. Noche y mensualidad; fijo nunca. Antes se
// marcaba "tarde" cualquier salida entre 8 am y 7 pm sin mirar el ingreso, así que un carro que
// entraba a las 10:00 y salía a las 15:00 del mismo día aparecía como fuera de ventana.
export function fueraDeVentanaSalida(modalidad: ModalidadParqueadero, horaIngreso: string, ahora = new Date()): boolean {
  if (modalidad === 'fijo') return false
  const ingreso = new Date(horaIngreso)
  const limite = new Date(ingreso)
  limite.setHours(8, 0, 0, 0)
  if (ingreso >= limite) limite.setDate(limite.getDate() + 1)
  return ahora > limite
}
