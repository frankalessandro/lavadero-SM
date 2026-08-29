import { db } from '../lib/db'
import { pagoSchema, type Pago, type PagoLineaInput } from '../schemas/pago'

const PAGO_SELECT =
  'id, ordenId:orden_id, ventaGrupoId:venta_grupo_id, metodoPago:metodo_pago, monto, referenciaPago:referencia_pago, turnoId:turno_id, anulado, esCorreccion:es_correccion, motivoCorreccion:motivo_correccion, corregidoPor:corregido_por, corregidoEn:corregido_en, creadoEn:creado_en'

function inicioDeHoyISO(): string {
  const ahora = new Date()
  return new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate()).toISOString()
}

// Líneas de pago VIGENTES (no anuladas) de un cobro — para reimprimir el comprobante y para
// precargar el modal de corrección de reparto.
export async function fetchPagosDeOrden(ordenId: string): Promise<Pago[]> {
  const { data, error } = await db
    .from('pagos')
    .select(PAGO_SELECT)
    .eq('orden_id', ordenId)
    .eq('anulado', false)
    .order('creado_en', { ascending: true })
  if (error) throw new Error(error.message)
  return pagoSchema.array().parse(data)
}

export async function fetchPagosDeGrupo(ventaGrupoId: string): Promise<Pago[]> {
  const { data, error } = await db
    .from('pagos')
    .select(PAGO_SELECT)
    .eq('venta_grupo_id', ventaGrupoId)
    .eq('anulado', false)
    .order('creado_en', { ascending: true })
  if (error) throw new Error(error.message)
  return pagoSchema.array().parse(data)
}

// Todas las líneas de pago cuyo cobro cae en [desdeISO, hastaISO) — para los dashboards de admin
// (ingresos por método) y el reporte de correcciones. Incluye las anuladas; el llamador filtra.
export async function fetchPagosEnRango(desdeISO: string, hastaISO: string): Promise<Pago[]> {
  const { data, error } = await db
    .from('pagos')
    .select(PAGO_SELECT)
    .gte('creado_en', desdeISO)
    .lt('creado_en', hastaISO)
    .order('creado_en', { ascending: false })
  if (error) throw new Error(error.message)
  return pagoSchema.array().parse(data)
}

export async function fetchPagosHoy(): Promise<Pago[]> {
  const ahora = new Date()
  return fetchPagosEnRango(inicioDeHoyISO(), new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() + 1).toISOString())
}

// Ingresos en EFECTIVO imputados a un turno (para el arqueo) — solo líneas vigentes.
export async function fetchEfectivoDeTurno(turnoId: string): Promise<{ lavados: number; ventas: number }> {
  const { data, error } = await db
    .from('pagos')
    .select('monto, orden_id, venta_grupo_id')
    .eq('turno_id', turnoId)
    .eq('metodo_pago', 'efectivo')
    .eq('anulado', false)
  if (error) throw new Error(error.message)
  const filas = (data ?? []) as { monto: number; orden_id: string | null; venta_grupo_id: string | null }[]
  let lavados = 0
  let ventas = 0
  for (const f of filas) {
    if (f.orden_id) lavados += f.monto
    else ventas += f.monto
  }
  return { lavados, ventas }
}

export type CorreccionTarget = { ordenId: string } | { ventaGrupoId: string }

// Corrige el REPARTO de un cobro ya registrado (solo cómo se repartió entre métodos, el total no
// cambia). Va por la RPC `corregir_pagos` (0036): marca las líneas vigentes como anuladas con
// motivo/quién/cuándo (regla 13) e inserta las nuevas, imputadas al turno del cobro original. Si
// ese turno ya está cerrado, sus columnas de arqueo NO se recalculan (regla 14) — la corrección
// solo se ve en el reporte de correcciones de admin.
export async function corregirReparto(
  target: CorreccionTarget,
  pagos: PagoLineaInput[],
  motivo: string,
  corregidoPor: string,
): Promise<Pago[]> {
  const p_target =
    'ordenId' in target ? { orden_id: target.ordenId } : { venta_grupo_id: target.ventaGrupoId }
  const { data, error } = await db
    .rpc('corregir_pagos', {
      p_target,
      p_pagos: pagos.map((l) => ({ metodo: l.metodo, monto: l.monto, referencia: l.referencia ?? null })),
      p_motivo: motivo,
      p_corregido_por: corregidoPor,
    })
    .select(PAGO_SELECT)
  if (error) throw new Error(error.message)
  return pagoSchema.array().parse(data)
}

export interface CorreccionReparto {
  fecha: string
  ordenId?: string
  ventaGrupoId?: string
  motivo: string
  corregidoPor: string
  turnoId?: string
  // Reparto antes (líneas anuladas por esta corrección) y después (líneas es_correccion).
  antes: { metodoPago: string; monto: number }[]
  despues: { metodoPago: string; monto: number }[]
}

// Reconstruye las correcciones de reparto de un rango: agrupa por `corregido_en` (timestamp
// exacto que comparten las líneas anuladas y sus reemplazos de una misma corrección).
export async function fetchCorreccionesEnRango(desdeISO: string, hastaISO: string): Promise<CorreccionReparto[]> {
  const { data, error } = await db
    .from('pagos')
    .select(PAGO_SELECT)
    .not('corregido_en', 'is', null)
    .gte('corregido_en', desdeISO)
    .lt('corregido_en', hastaISO)
    .order('corregido_en', { ascending: false })
  if (error) throw new Error(error.message)
  const filas = pagoSchema.array().parse(data)

  const porCorreccion = new Map<string, CorreccionReparto>()
  for (const p of filas) {
    const clave = `${p.corregidoEn}`
    let c = porCorreccion.get(clave)
    if (!c) {
      c = {
        fecha: p.corregidoEn ?? p.creadoEn,
        ordenId: p.ordenId,
        ventaGrupoId: p.ventaGrupoId,
        motivo: p.motivoCorreccion ?? '',
        corregidoPor: p.corregidoPor ?? '',
        turnoId: p.turnoId,
        antes: [],
        despues: [],
      }
      porCorreccion.set(clave, c)
    }
    if (p.esCorreccion) c.despues.push({ metodoPago: p.metodoPago, monto: p.monto })
    else c.antes.push({ metodoPago: p.metodoPago, monto: p.monto })
  }
  return [...porCorreccion.values()]
}
