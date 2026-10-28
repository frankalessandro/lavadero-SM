import { db } from '../lib/db'
import {
  abonoInputSchema,
  deudaPersonalSchema,
  prestamoInputSchema,
  type AbonoInput,
  type DeudaPersonal,
  type Deudor,
  type PrestamoInput,
  type DescuentoDeuda,
  type SaldoDeuda,
  SALDO_DEUDA_CERO,
} from '../schemas/deudaPersonal'
export type { DeudaPersonal, Deudor, PrestamoInput, AbonoInput, SaldoDeuda, DescuentoDeuda } from '../schemas/deudaPersonal'
export { fetchPersonasDeudoras } from './perfiles'

const DEUDA_SELECT =
  'id, lavadorId:lavador_id, personaId:persona_id, tipo, bolsa, monto, turnoId:turno_id, cuentaId:cuenta_id, liquidacionId:liquidacion_id, liquidacionJefeZonaId:liquidacion_jefe_zona_id, conteoLineaId:conteo_linea_id, metodoAbono:metodo_abono, motivo, registradoPor:registrado_por, estado, motivoAnulacion:motivo_anulacion, anuladaPor:anulada_por, anuladaEn:anulada_en, creadoEn:creado_en'

const deudorParams = (deudor: Deudor) => ({
  p_lavador_id: deudor.tipo === 'lavador' ? deudor.id : null,
  p_persona_id: deudor.tipo === 'persona' ? deudor.id : null,
})

// Saldos de todo el personal por bolsa en una consulta (0089): préstamos y tienda, contando en
// tienda lo pendiente de sus cuentas abiertas vinculadas — tarjetas de comisiones, colilla, deudas.
export async function fetchSaldosDeuda(): Promise<{ porLavador: Map<string, SaldoDeuda>; porPersona: Map<string, SaldoDeuda> }> {
  const { data, error } = await db.rpc('saldos_deuda_personal')
  if (error) throw new Error(error.message)
  const porLavador = new Map<string, SaldoDeuda>()
  const porPersona = new Map<string, SaldoDeuda>()
  for (const fila of (data ?? []) as {
    lavador_id: string | null
    persona_id: string | null
    prestamo: number
    tienda: number
    tienda_en_cuenta: number
  }[]) {
    const saldo: SaldoDeuda = {
      prestamo: fila.prestamo,
      tienda: fila.tienda,
      enCuenta: fila.tienda_en_cuenta,
      total: fila.prestamo + fila.tienda,
    }
    if (fila.lavador_id) porLavador.set(fila.lavador_id, saldo)
    else if (fila.persona_id) porPersona.set(fila.persona_id, saldo)
  }
  return { porLavador, porPersona }
}

export async function fetchSaldoDeuda(deudor: Deudor): Promise<SaldoDeuda> {
  const { porLavador, porPersona } = await fetchSaldosDeuda()
  return (deudor.tipo === 'lavador' ? porLavador : porPersona).get(deudor.id) ?? SALDO_DEUDA_CERO
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

// Abono entre semana a préstamos o a tienda: en efectivo entra a la caja del turno abierto (suma al
// arqueo); por fuera (directo a gerencia, transferencia) no toca caja y pide explicar cómo se pagó.
// Nunca deja saldo a favor. Un abono a tienda primero pasa al ledger lo pendiente de sus cuentas
// abiertas (lo hace la base, 0089) — la cuenta sigue abierta.
export async function registrarAbono(input: AbonoInput): Promise<DeudaPersonal> {
  const parsed = abonoInputSchema.parse(input)
  const { data, error } = await db
    .rpc('registrar_abono_deuda', {
      ...deudorParams(parsed.deudor),
      p_monto: parsed.monto,
      p_metodo: parsed.metodo,
      p_motivo: parsed.motivo ?? null,
      p_bolsa: parsed.bolsa,
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

// Descuento de deuda al generar una liquidación (lavador o jefe de patio), por bolsa: cada parte
// no puede pasar su bolsa y la suma no puede pasar la comisión del corte.
export function validarDescuentoDeuda(descuento: DescuentoDeuda, saldo: SaldoDeuda, comisionBruta: number): DescuentoDeuda {
  const limpio = { prestamo: Math.round(descuento.prestamo), tienda: Math.round(descuento.tienda) }
  if (limpio.prestamo < 0 || limpio.prestamo > Math.max(0, saldo.prestamo)) {
    throw new Error(`El descuento de préstamos debe estar entre $0 y $${Math.max(0, saldo.prestamo)}`)
  }
  if (limpio.tienda < 0 || limpio.tienda > Math.max(0, saldo.tienda)) {
    throw new Error(`El descuento de tienda debe estar entre $0 y $${Math.max(0, saldo.tienda)}`)
  }
  if (limpio.prestamo + limpio.tienda > comisionBruta) {
    throw new Error(`El descuento total no puede pasar la comisión del corte ($${comisionBruta})`)
  }
  return limpio
}

// Filas 'liquidacion' del ledger, una por bolsa con descuento — en un solo insert (atómico entre
// sí). La de tienda hace que la base pase primero al ledger lo pendiente de sus cuentas abiertas.
export async function registrarDescuentoLiquidacion(
  deudor: Deudor,
  descuento: DescuentoDeuda,
  liquidacion: { liquidacion_id: string } | { liquidacion_jefe_zona_id: string },
  periodoInicio: string,
  periodoFin: string,
): Promise<void> {
  const filas = (['prestamo', 'tienda'] as const)
    .filter((bolsa) => descuento[bolsa] > 0)
    .map((bolsa) => ({
      lavador_id: deudor.tipo === 'lavador' ? deudor.id : null,
      persona_id: deudor.tipo === 'persona' ? deudor.id : null,
      tipo: 'liquidacion',
      bolsa,
      monto: -descuento[bolsa],
      ...liquidacion,
      motivo: `Descontado al liquidar (periodo ${periodoInicio} → ${periodoFin})`,
      registrado_por: 'Generación de liquidación',
    }))
  if (filas.length === 0) return
  const { error } = await db.from('deudas_personal').insert(filas)
  if (error) throw new Error(error.message)
}
