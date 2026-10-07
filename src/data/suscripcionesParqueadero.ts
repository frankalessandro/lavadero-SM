import { db } from '../lib/db'
import type { MetodoPagoBase } from '../schemas/orden'
import {
  actualizarSuscripcionInputSchema,
  crearSuscripcionInputSchema,
  pagoSuscripcionSchema,
  suscripcionParqueaderoSchema,
  type ActualizarSuscripcionInput,
  type CrearSuscripcionInput,
  type PagoSuscripcion,
  type SuscripcionParqueadero,
} from '../schemas/suscripcionParqueadero'

const SELECT =
  'id, placa, titular, telefono, modalidad, claseVehiculo:clase_vehiculo, valor, fechaInicio:fecha_inicio, fechaFin:fecha_fin, activo, nota, creadoPor:creado_por, creadoEn:creado_en'

export async function fetchSuscripciones(): Promise<SuscripcionParqueadero[]> {
  const { data, error } = await db
    .from('suscripciones_parqueadero')
    .select(SELECT)
    .order('activo', { ascending: false })
    .order('fecha_fin', { ascending: true })
  if (error) throw new Error(error.message)
  return suscripcionParqueaderoSchema.array().parse(data)
}

// Todo lo que escribe va por RPC (0084): el valor lo fija la base desde la tarifa, el pago queda
// con su método y su turno, y quien registra es la cuenta autenticada.
export async function crearSuscripcion(input: CrearSuscripcionInput): Promise<void> {
  const p = crearSuscripcionInputSchema.parse(input)
  const { error } = await db.rpc('crear_suscripcion_parqueadero', {
    p_placa: p.placa,
    p_titular: p.titular,
    p_telefono: p.telefono || null,
    p_clase: p.claseVehiculo,
    p_modalidad: p.modalidad,
    p_fecha_inicio: p.fechaInicio,
    p_metodo_pago: p.metodoPago,
    p_nota: p.nota || null,
  })
  if (error) throw new Error(error.message)
}

export async function actualizarSuscripcion(id: string, input: ActualizarSuscripcionInput): Promise<void> {
  const p = actualizarSuscripcionInputSchema.parse(input)
  const { error } = await db.rpc('actualizar_suscripcion_parqueadero', {
    p_id: id,
    p_placa: p.placa,
    p_titular: p.titular,
    p_telefono: p.telefono || null,
    p_nota: p.nota || null,
  })
  if (error) throw new Error(error.message)
}

// Regla 5: se inactiva, no se borra.
export async function setSuscripcionActiva(id: string, activo: boolean): Promise<void> {
  const { error } = await db.rpc('cambiar_estado_suscripcion_parqueadero', { p_id: id, p_activo: activo })
  if (error) throw new Error(error.message)
}

// Todas las suscripciones de una placa (activas e inactivas) — para el perfil de la placa.
export async function fetchSuscripcionesPorPlaca(placa: string): Promise<SuscripcionParqueadero[]> {
  const normalizada = placa.trim().toUpperCase()
  if (!normalizada) return []
  const { data, error } = await db
    .from('suscripciones_parqueadero')
    .select(SELECT)
    .eq('placa', normalizada)
    .order('activo', { ascending: false })
    .order('fecha_fin', { ascending: false })
  if (error) throw new Error(error.message)
  return suscripcionParqueaderoSchema.array().parse(data)
}

// La suscripción activa de una placa — para el aviso de la portería del vigilante. Si hay más de
// una activa (renovación cargada por adelantado) se devuelve la de vencimiento más lejano.
export async function fetchSuscripcionActivaPorPlaca(
  placa: string,
): Promise<SuscripcionParqueadero | undefined> {
  const normalizada = placa.trim().toUpperCase()
  if (!normalizada) return undefined
  const { data, error } = await db
    .from('suscripciones_parqueadero')
    .select(SELECT)
    .eq('placa', normalizada)
    .eq('activo', true)
    .order('fecha_fin', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data ? suscripcionParqueaderoSchema.parse(data) : undefined
}

const PAGO_SELECT =
  'id, suscripcionId:suscripcion_id, monto, metodoPago:metodo_pago, fechaPago:fecha_pago, periodoInicio:periodo_inicio, periodoFin:periodo_fin, registradoPor:registrado_por, creadoEn:creado_en'

export async function fetchPagosSuscripcion(suscripcionId: string): Promise<PagoSuscripcion[]> {
  const { data, error } = await db
    .from('pagos_suscripcion_parqueadero')
    .select(PAGO_SELECT)
    .eq('suscripcion_id', suscripcionId)
    .order('periodo_inicio', { ascending: false })
  if (error) throw new Error(error.message)
  return pagoSuscripcionSchema.array().parse(data)
}

// Cobra un mes más al valor de la tarifa y registra el pago en una sola transacción (RPC 0084): si
// sigue vigente el mes nuevo arranca donde termina el actual; si ya venció, el día del pago. La
// fecha solo la respeta la base para gerencia; para jefe de patio y vigilante el pago es de hoy.
export async function renovarSuscripcion(
  suscripcionId: string,
  metodoPago: MetodoPagoBase,
  fechaPago: string,
): Promise<void> {
  const { error } = await db.rpc('renovar_suscripcion_parqueadero', {
    p_suscripcion_id: suscripcionId,
    p_metodo_pago: metodoPago,
    p_fecha_pago: fechaPago,
  })
  if (error) throw new Error(error.message)
}

// El pago más reciente de cada suscripción (por periodo cubierto) — para la bandera de "pago
// registrado" en la lista sin pedir el historial de cada una.
export async function fetchUltimosPagos(): Promise<Map<string, PagoSuscripcion>> {
  const { data, error } = await db
    .from('pagos_suscripcion_parqueadero')
    .select(PAGO_SELECT)
    .order('periodo_fin', { ascending: false })
    .order('fecha_pago', { ascending: false })
  if (error) throw new Error(error.message)
  const ultimos = new Map<string, PagoSuscripcion>()
  for (const pago of pagoSuscripcionSchema.array().parse(data)) {
    if (!ultimos.has(pago.suscripcionId)) ultimos.set(pago.suscripcionId, pago)
  }
  return ultimos
}

// Registra un pago que YA se había recibido para el ciclo actual (0085): no mueve la vigencia ni
// entra al turno de quien lo registra.
export async function confirmarPagoCiclo(
  suscripcionId: string,
  metodoPago: MetodoPagoBase,
  fechaPago: string,
): Promise<void> {
  const { error } = await db.rpc('confirmar_pago_ciclo_suscripcion', {
    p_suscripcion_id: suscripcionId,
    p_metodo_pago: metodoPago,
    p_fecha_pago: fechaPago,
  })
  if (error) throw new Error(error.message)
}
