import { db } from '../lib/db'
import {
  anularDeudaLavadorInputSchema,
  deudaLavadorSchema,
  prestamoLavadorInputSchema,
  type AnularDeudaLavadorInput,
  type DeudaLavador,
  type PrestamoLavadorInput,
} from '../schemas/deudaLavador'

export type { DeudaLavador, PrestamoLavadorInput, AnularDeudaLavadorInput } from '../schemas/deudaLavador'

const DEUDA_SELECT =
  'id, lavadorId:lavador_id, tipo, monto, turnoId:turno_id, cuentaId:cuenta_id, liquidacionId:liquidacion_id, motivo, registradoPor:registrado_por, estado, motivoAnulacion:motivo_anulacion, anuladaPor:anulada_por, anuladaEn:anulada_en, creadoEn:creado_en'

// Deuda pendiente de UN lavador = suma de sus filas 'activo' (prestamo/consumo positivos,
// liquidacion negativo) — no hay columna de saldo aparte, siempre se deriva del ledger completo.
export async function fetchDeudaPendiente(lavadorId: string): Promise<number> {
  const { data, error } = await db
    .from('deudas_lavador')
    .select('monto')
    .eq('lavador_id', lavadorId)
    .eq('estado', 'activo')
  if (error) throw new Error(error.message)
  return (data ?? []).reduce((total, d) => total + (d.monto as number), 0)
}

// Deuda pendiente de TODOS los lavadores activos en una sola consulta — para no hacer N llamadas
// en la tarjeta de "Comisiones pendientes" (una por lavador).
export async function fetchDeudaPendientePorLavador(): Promise<Map<string, number>> {
  const { data, error } = await db.from('deudas_lavador').select('lavador_id, monto').eq('estado', 'activo')
  if (error) throw new Error(error.message)
  const mapa = new Map<string, number>()
  for (const fila of data as { lavador_id: string; monto: number }[]) {
    mapa.set(fila.lavador_id, (mapa.get(fila.lavador_id) ?? 0) + fila.monto)
  }
  return mapa
}

// Historial completo (para el expediente del lavador / auditoría) — incluye anuladas para no
// perder el rastro (regla 13).
export async function fetchDeudasDeLavador(lavadorId: string): Promise<DeudaLavador[]> {
  const { data, error } = await db
    .from('deudas_lavador')
    .select(DEUDA_SELECT)
    .eq('lavador_id', lavadorId)
    .order('creado_en', { ascending: false })
  if (error) throw new Error(error.message)
  return deudaLavadorSchema.array().parse(data)
}

// Préstamos cargados a la caja de un turno — expediente del turno (mismo patrón que
// fetchGastosDeTurno/fetchComprasDeTurno) y arqueo (ver prestamosDeCaja en src/data/turnos.ts).
export async function fetchPrestamosDeTurno(turnoId: string): Promise<DeudaLavador[]> {
  if (!turnoId) return []
  const { data, error } = await db
    .from('deudas_lavador')
    .select(DEUDA_SELECT)
    .eq('turno_id', turnoId)
    .eq('tipo', 'prestamo')
    .order('creado_en', { ascending: true })
  if (error) throw new Error(error.message)
  return deudaLavadorSchema.array().parse(data)
}

// Efectivo entregado de la caja del turno — sale de inmediato del efectivo esperado (regla
// confirmada por Alessandro, 2026-09-14, mismo mecanismo que gastos.origen='caja'/0064) y además
// queda como deuda del lavador, a descontar en su próxima liquidación.
export async function registrarPrestamo(input: PrestamoLavadorInput): Promise<DeudaLavador> {
  const parsed = prestamoLavadorInputSchema.parse(input)
  const { data, error } = await db
    .rpc('registrar_prestamo_lavador', {
      p_lavador_id: parsed.lavadorId,
      p_monto: parsed.monto,
      p_motivo: parsed.motivo ?? null,
      p_turno_id: parsed.turnoId,
      p_registrado_por: parsed.registradoPor,
    })
    .select(DEUDA_SELECT)
    .single()
  if (error) throw new Error(error.message)
  return deudaLavadorSchema.parse(data)
}

// Regla de negocio 13: no se borra, se anula con motivo. Solo tiene sentido sobre 'prestamo' —
// anular un 'consumo' implicaría también revertir el stock/costo de la venta que lo generó (no
// contemplado en esta pasada); anular una fila 'liquidacion' rompería la aritmética de esa
// liquidación ya generada. La RPC de anulación de liquidación (0049) es el camino correcto si el
// error está ahí.
export async function anularPrestamo(id: string, input: AnularDeudaLavadorInput): Promise<DeudaLavador> {
  const parsed = anularDeudaLavadorInputSchema.parse(input)
  const { data, error } = await db
    .from('deudas_lavador')
    .update({
      estado: 'anulado',
      motivo_anulacion: parsed.motivo,
      anulada_por: parsed.anuladaPor,
      anulada_en: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('tipo', 'prestamo')
    .eq('estado', 'activo')
    .select(DEUDA_SELECT)
    .single()
  if (error) throw new Error(error.message)
  return deudaLavadorSchema.parse(data)
}
