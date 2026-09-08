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
} from '../schemas/conteoInventario'

const CONTEO_SELECT =
  'id, turnoId:turno_id, momento, contadoPor:contado_por, contadoPorPersonaId:contado_por_persona_id, justificacion, creadoEn:creado_en'

const LINEA_SELECT =
  'id, conteoId:conteo_id, productoId:producto_id, esperado, contado, enCuentasPendientes:en_cuentas_pendientes, diferencia, valorDiferencia:valor_diferencia, respondePersonaId:responde_persona_id, motivo, ajusteMovimientoId:ajuste_movimiento_id, estadoFaltante:estado_faltante'

// ¿Este turno ya tiene el conteo de apertura / de cierre? La UI de `/jefe-zona/caja` lo usa para
// decidir si muestra el paso de conteo.
export async function fetchConteoDeTurno(
  turnoId: string,
  momento: MomentoConteo,
): Promise<ConteoInventario | undefined> {
  const { data, error } = await db
    .from('conteos_inventario')
    .select(CONTEO_SELECT)
    .eq('turno_id', turnoId)
    .eq('momento', momento)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data ? conteoInventarioSchema.parse(data) : undefined
}

// Lo que "debería haber" de cada producto vendible — se llama DESPUÉS del conteo ciego, para
// revelar la comparación. Va por RPC porque suma `movimientos_inventario` (admin-only) y resta
// las unidades en cuentas/órdenes abiertas.
export async function previewConteo(turnoId: string, momento: MomentoConteo): Promise<PreviewLineaConteo[]> {
  const { data, error } = await db.rpc('preview_conteo_inventario', {
    p_turno_id: turnoId,
    p_momento: momento,
  })
  if (error) throw new Error(error.message)
  return previewLineaConteoSchema.array().parse(
    (data as Record<string, unknown>[]).map((row) => ({
      productoId: row.producto_id,
      nombre: row.nombre,
      unidadMedida: row.unidad_medida,
      esperado: row.esperado,
      enCuentasPendientes: row.en_cuentas_pendientes,
    })),
  )
}

export async function abrirConteoInventario(
  turnoId: string,
  lineas: ConteoLineaInput[],
  justificacion: string | undefined,
): Promise<ConteoInventario> {
  const { data, error } = await db
    .rpc('abrir_conteo_inventario', {
      p_turno_id: turnoId,
      p_lineas: lineas.map((l) => ({ producto_id: l.productoId, contado: l.contado })),
      p_justificacion: justificacion ?? null,
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
): Promise<ConteoInventario> {
  const { data, error } = await db
    .rpc('cerrar_conteo_inventario', {
      p_turno_id: turnoId,
      p_lineas: lineas.map((l) => ({
        producto_id: l.productoId,
        contado: l.contado,
        responde_persona_id: l.respondePersonaId ?? null,
        motivo: l.motivo ?? null,
      })),
      p_justificacion: justificacion ?? null,
    })
    .select(CONTEO_SELECT)
    .single()
  if (error) throw new Error(error.message)
  return conteoInventarioSchema.parse(data)
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
    .select(`${LINEA_SELECT}, productos(nombre), personal_operativo(nombre), conteos_inventario(turno_id, creado_en)`)
    .eq('estado_faltante', 'pendiente')
    .order('id', { ascending: false })
  if (error) throw new Error(error.message)

  return (data as unknown as Record<string, unknown>[]).map((row) => {
    const conteo = row.conteos_inventario as { turno_id: string; creado_en: string } | null
    return {
      linea: conteoLineaSchema.parse(row),
      productoNombre: (row.productos as { nombre: string } | null)?.nombre ?? '—',
      respondeNombre: (row.personal_operativo as { nombre: string } | null)?.nombre ?? 'Sin asignar',
      turnoId: conteo?.turno_id ?? '',
      fecha: conteo?.creado_en ?? '',
    }
  })
}
