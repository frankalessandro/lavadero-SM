import { z } from 'zod'
import { db } from '../lib/db'
import {
  conteoInventarioSchema,
  conteoLineaSchema,
  previewLineaConteoSchema,
  type ConteoInventario,
  type ConteoLinea,
  type ConteoLineaInput,
  type MomentoConteo,
  type PreviewLineaConteo,
  pendienteCobroSchema,
  type PendienteCobro,
} from '../schemas/conteoInventario'

const CONTEO_SELECT =
  'id, turnoId:turno_id, momento, contadoPor:contado_por, contadoPorPersonaId:contado_por_persona_id, justificacion, creadoEn:creado_en, pendientesConfirmados:pendientes_confirmados'

// Todos los conteos de un turno en orden (reinicio/apertura, traspasos, cierre) — expediente de admin.
export async function fetchConteosDeTurno(turnoId: string): Promise<ConteoInventario[]> {
  const { data, error } = await db
    .from('conteos_inventario')
    .select(CONTEO_SELECT)
    .eq('turno_id', turnoId)
    .order('creado_en', { ascending: true })
  if (error) throw new Error(error.message)
  return conteoInventarioSchema.array().parse(data)
}

const LINEA_SELECT =
  'id, conteoId:conteo_id, productoId:producto_id, esperado, contado, contadoInicial:contado_inicial, enCuentasPendientes:en_cuentas_pendientes, diferencia, valorDiferencia:valor_diferencia, respondePersonaId:responde_persona_id, motivo, ajusteMovimientoId:ajuste_movimiento_id, estadoFaltante:estado_faltante'

// ¿Este turno ya tiene el conteo de apertura / de cierre? La UI de `/jefe-zona/caja` lo usa para
// decidir si muestra el paso de conteo. Para 'apertura' también vale un conteo 'reinicio' (0067):
// el turno donde se cargó la base ya arrancó contado.
export async function fetchConteoDeTurno(
  turnoId: string,
  momento: MomentoConteo,
): Promise<ConteoInventario | undefined> {
  const { data, error } = await db
    .from('conteos_inventario')
    .select(CONTEO_SELECT)
    .eq('turno_id', turnoId)
    .in('momento', momento === 'apertura' ? ['apertura', 'reinicio'] : ['cierre'])
    .order('creado_en', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data ? conteoInventarioSchema.parse(data) : undefined
}

// Hora del servidor al empezar a contar (0068). Se manda al revelar y al registrar: cualquier
// producto que se haya movido después (venta, carga a una orden, anulación) hay que recontarlo.
export async function marcaConteo(): Promise<string> {
  const { data, error } = await db.rpc('marca_conteo_inventario')
  if (error) throw new Error(error.message)
  return z.string().parse(data)
}

// Lo que "debería haber" de cada producto vendible — se llama DESPUÉS del conteo ciego, para
// revelar la comparación. Va por RPC porque suma `movimientos_inventario` (admin-only) y resta
// las unidades en cuentas/órdenes abiertas.
export async function previewConteo(
  turnoId: string,
  momento: MomentoConteo,
  desde: string,
): Promise<PreviewLineaConteo[]> {
  const { data, error } = await db.rpc('preview_conteo_inventario', {
    p_turno_id: turnoId,
    p_momento: momento,
    p_desde: desde,
  })
  if (error) throw new Error(error.message)
  return previewLineaConteoSchema.array().parse(
    (data as Record<string, unknown>[]).map((row) => ({
      productoId: row.producto_id,
      nombre: row.nombre,
      unidadMedida: row.unidad_medida,
      esperado: row.esperado,
      enCuentasPendientes: row.en_cuentas_pendientes,
      anterior: row.anterior,
      anteriorEn: row.anterior_en,
      vendido: row.vendido,
      entradas: row.entradas,
      otros: row.otros,
      movido: row.movido,
      marca: row.marca,
    })),
  )
}

// Cuentas abiertas y órdenes con productos cargados sin cobrar — el cierre y el traspaso exigen
// confirmarlas una por una (0068).
export async function fetchPendientesPorConfirmar(): Promise<PendienteCobro[]> {
  const { data, error } = await db.rpc('pendientes_por_confirmar')
  if (error) throw new Error(error.message)
  return pendienteCobroSchema.array().parse(data)
}

export function lineasPayload(lineas: ConteoLineaInput[]) {
  return lineas.map((l) => ({
    producto_id: l.productoId,
    contado: l.contado,
    contado_inicial: l.contadoInicial ?? null,
    responde_persona_id: l.respondePersonaId ?? null,
    motivo: l.motivo ?? null,
  }))
}

export async function abrirConteoInventario(
  turnoId: string,
  lineas: ConteoLineaInput[],
  justificacion: string | undefined,
  desde: string,
): Promise<ConteoInventario> {
  const { data, error } = await db
    .rpc('abrir_conteo_inventario', {
      p_turno_id: turnoId,
      p_lineas: lineasPayload(lineas),
      p_justificacion: justificacion ?? null,
      p_desde: desde,
    })
    .select(CONTEO_SELECT)
    .single()
  if (error) throw new Error(error.message)
  return conteoInventarioSchema.parse(data)
}

export async function cerrarConteoInventario(
  turnoId: string,
  lineas: ConteoLineaInput[],
  justificacion: string | undefined,
  desde: string,
  confirmados: string[],
): Promise<ConteoInventario> {
  const { data, error } = await db
    .rpc('cerrar_conteo_inventario', {
      p_turno_id: turnoId,
      p_lineas: lineasPayload(lineas),
      p_justificacion: justificacion ?? null,
      p_desde: desde,
      p_confirmados: confirmados,
    })
    .select(CONTEO_SELECT)
    .single()
  if (error) throw new Error(error.message)
  return conteoInventarioSchema.parse(data)
}

export interface ConteoLineaConProducto extends ConteoLinea {
  productoNombre: string
}

// Todas las líneas de un conteo (admin-only, lleva el valor a costo) — para el expediente del
// turno.
export async function fetchLineasDeConteo(conteoId: string): Promise<ConteoLineaConProducto[]> {
  const { data, error } = await db
    .from('conteos_inventario_lineas')
    .select(`${LINEA_SELECT}, productos(nombre)`)
    .eq('conteo_id', conteoId)
  if (error) throw new Error(error.message)
  return (data as unknown as Record<string, unknown>[]).map((row) => ({
    ...conteoLineaSchema.parse(row),
    productoNombre: (row.productos as { nombre: string } | null)?.nombre ?? '—',
  }))
}

export interface FaltantePendiente {
  linea: ConteoLinea
  productoNombre: string
  respondeNombre: string
  turnoId: string
  fecha: string
}

// Reporte de admin: faltantes de inventario sin resolver, con nombre de producto y de la persona
// que responde. Solo admin (la policy de `conteos_inventario_lineas` es admin-only).
export async function fetchFaltantesPendientes(): Promise<FaltantePendiente[]> {
  const { data, error } = await db
    .from('conteos_inventario_lineas')
    .select(`${LINEA_SELECT}, productos(nombre), perfiles(nombre), conteos_inventario(turno_id, creado_en)`)
    .eq('estado_faltante', 'pendiente')
    .order('id', { ascending: false })
  if (error) throw new Error(error.message)

  return (data as unknown as Record<string, unknown>[]).map((row) => {
    const conteo = row.conteos_inventario as { turno_id: string; creado_en: string } | null
    return {
      linea: conteoLineaSchema.parse(row),
      productoNombre: (row.productos as { nombre: string } | null)?.nombre ?? '—',
      // Sin persona = faltante de apertura (0068): se perdió entre turnos, nadie tenía la nevera a cargo.
      respondeNombre: (row.perfiles as { nombre: string | null } | null)?.nombre ?? 'Entre turnos (sin responsable)',
      turnoId: conteo?.turno_id ?? '',
      fecha: conteo?.creado_en ?? '',
    }
  })
}
