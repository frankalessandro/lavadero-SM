import { db } from '../lib/db'
import {
  abonoInputSchema,
  deudaPersonalSchema,
  prestamoInputSchema,
  type AbonoInput,
  type DeudaPersonal,
  type Deudor,
  type PrestamoInput,
} from '../schemas/deudaPersonal'
export type { DeudaPersonal, Deudor, PrestamoInput, AbonoInput } from '../schemas/deudaPersonal'
export { fetchPersonasDeudoras } from './perfiles'

const DEUDA_SELECT =
  'id, lavadorId:lavador_id, personaId:persona_id, tipo, monto, turnoId:turno_id, cuentaId:cuenta_id, liquidacionId:liquidacion_id, liquidacionJefeZonaId:liquidacion_jefe_zona_id, conteoLineaId:conteo_linea_id, metodoAbono:metodo_abono, motivo, registradoPor:registrado_por, estado, motivoAnulacion:motivo_anulacion, anuladaPor:anulada_por, anuladaEn:anulada_en, creadoEn:creado_en'

const deudorParams = (deudor: Deudor) => ({
  p_lavador_id: deudor.tipo === 'lavador' ? deudor.id : null,
  p_persona_id: deudor.tipo === 'persona' ? deudor.id : null,
})

async function saldoPor(columna: 'lavador_id' | 'persona_id'): Promise<Map<string, number>> {
  const { data, error } = await db.from('deudas_personal').select(`${columna}, monto`).eq('estado', 'activo').not(columna, 'is', null)
  if (error) throw new Error(error.message)
  const mapa = new Map<string, number>()
  for (const fila of data as Record<string, string | number>[]) {
    const id = fila[columna] as string
    mapa.set(id, (mapa.get(id) ?? 0) + (fila.monto as number))
  }
  return mapa
}

// Deuda pendiente de TODOS en una consulta — tarjetas de comisiones y pantalla de deudas.
export const fetchDeudaPendientePorLavador = () => saldoPor('lavador_id')
export const fetchDeudaPendientePorPersona = () => saldoPor('persona_id')

export async function fetchDeudaPendiente(deudor: Deudor): Promise<number> {
  const { data, error } = await db
    .from('deudas_personal')
    .select('monto')
    .eq(deudor.tipo === 'lavador' ? 'lavador_id' : 'persona_id', deudor.id)
    .eq('estado', 'activo')
  if (error) throw new Error(error.message)
  return (data ?? []).reduce((total, d) => total + (d.monto as number), 0)
}

// Historial completo de un deudor — incluye anuladas (regla 13).
export async function fetchMovimientosDeuda(deudor: Deudor): Promise<DeudaPersonal[]> {
  const { data, error } = await db
    .from('deudas_personal')
    .select(DEUDA_SELECT)
    .eq(deudor.tipo === 'lavador' ? 'lavador_id' : 'persona_id', deudor.id)
    .order('creado_en', { ascending: false })
  if (error) throw new Error(error.message)
  return deudaPersonalSchema.array().parse(data)
}

// Lo que movió efectivo de la caja de un turno: préstamos (salen) y abonos en efectivo (entran).
export async function fetchPrestamosDeTurno(turnoId: string): Promise<DeudaPersonal[]> {
  if (!turnoId) return []
  const { data, error } = await db
    .from('deudas_personal')
    .select(DEUDA_SELECT)
    .eq('turno_id', turnoId)
    .in('tipo', ['prestamo', 'abono'])
    .order('creado_en', { ascending: true })
  if (error) throw new Error(error.message)
  return deudaPersonalSchema.array().parse(data)
}

// Efectivo de la caja del turno abierto (0070): el servidor exige turno y lo pone a nombre de su
// responsable. Sale del efectivo esperado del arqueo.
export async function registrarPrestamo(input: PrestamoInput): Promise<DeudaPersonal> {
  const parsed = prestamoInputSchema.parse(input)
  const { data, error } = await db
    .rpc('registrar_prestamo_personal', { ...deudorParams(parsed.deudor), p_monto: parsed.monto, p_motivo: parsed.motivo ?? null })
    .select(DEUDA_SELECT)
    .single()
  if (error) throw new Error(error.message)
  return deudaPersonalSchema.parse(data)
}

// Abono entre semana: en efectivo entra a la caja del turno abierto (suma al arqueo); por fuera
// (transferencia, nómina) no toca caja y pide explicar cómo se pagó. Nunca deja saldo a favor.
export async function registrarAbono(input: AbonoInput): Promise<DeudaPersonal> {
  const parsed = abonoInputSchema.parse(input)
  const { data, error } = await db
    .rpc('registrar_abono_deuda', {
      ...deudorParams(parsed.deudor),
      p_monto: parsed.monto,
      p_metodo: parsed.metodo,
      p_motivo: parsed.motivo ?? null,
    })
    .select(DEUDA_SELECT)
    .single()
  if (error) throw new Error(error.message)
  return deudaPersonalSchema.parse(data)
}

// Solo admin: préstamo, abono o faltante. Un faltante anulado vuelve a "por revisar".
export async function anularDeuda(id: string, motivo: string): Promise<void> {
  const { error } = await db.rpc('anular_deuda', { p_id: id, p_motivo: motivo })
  if (error) throw new Error(error.message)
}

// Solo admin: el faltante del conteo se vuelve deuda (a costo) de esa persona.
export async function cobrarFaltante(lineaId: string, personaId?: string): Promise<void> {
  const { error } = await db.rpc('cobrar_faltante', { p_linea_id: lineaId, p_persona_id: personaId ?? null })
  if (error) throw new Error(error.message)
}

export async function descartarFaltante(lineaId: string, motivo: string): Promise<void> {
  const { error } = await db.rpc('descartar_faltante', { p_linea_id: lineaId, p_motivo: motivo })
  if (error) throw new Error(error.message)
}
