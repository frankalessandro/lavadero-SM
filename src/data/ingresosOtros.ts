import { db } from '../lib/db'
import { paginar } from '../lib/paginar'
import {
  anularIngresoOtroInputSchema,
  categoriaIngresoInputSchema,
  categoriaIngresoSchema,
  ingresoOtroInputSchema,
  ingresoOtroSchema,
  type CategoriaIngreso,
  type CategoriaIngresoInput,
  type IngresoOtro,
  type IngresoOtroInput,
} from '../schemas/ingresoOtro'

const CATEGORIA_SELECT = 'id, nombre, activo'

export async function fetchCategoriasIngreso(): Promise<CategoriaIngreso[]> {
  const { data, error } = await db
    .from('categorias_ingreso')
    .select(CATEGORIA_SELECT)
    .order('activo', { ascending: false })
    .order('nombre')
  if (error) throw new Error(error.message)
  return categoriaIngresoSchema.array().parse(data ?? [])
}

export async function createCategoriaIngreso(input: CategoriaIngresoInput): Promise<CategoriaIngreso> {
  const parsed = categoriaIngresoInputSchema.parse(input)
  const { data, error } = await db
    .from('categorias_ingreso')
    .insert({ nombre: parsed.nombre })
    .select(CATEGORIA_SELECT)
    .single()
  if (error) {
    // Índice único por nombre sin distinguir mayúsculas (0078).
    if (error.code === '23505') throw new Error('Ya existe una categoría con ese nombre')
    throw new Error(error.message)
  }
  return categoriaIngresoSchema.parse(data)
}

export async function setCategoriaIngresoActivo(id: string, activo: boolean): Promise<CategoriaIngreso> {
  const { data, error } = await db
    .from('categorias_ingreso')
    .update({ activo })
    .eq('id', id)
    .select(CATEGORIA_SELECT)
    .single()
  if (error) throw new Error(error.message)
  return categoriaIngresoSchema.parse(data)
}

// Embed por FK de PostgREST: trae el nombre de la categoría en la misma consulta.
const INGRESO_SELECT =
  'id, consecutivo, fecha, categoriaId:categoria_id, categoria:categorias_ingreso(nombre), descripcion, monto, metodoPago:metodo_pago, registradoPor:registrado_por, estado, motivoAnulacion:motivo_anulacion, anuladaPor:anulada_por, anuladaEn:anulada_en, creadoEn:creado_en'

interface IngresoRow {
  categoria: { nombre: string } | null
  [campo: string]: unknown
}

export interface IngresoOtroConCategoria extends IngresoOtro {
  categoriaNombre: string
}

function mapIngresoRow(row: IngresoRow): IngresoOtroConCategoria {
  const { categoria, ...rest } = row
  return { ...ingresoOtroSchema.parse(rest), categoriaNombre: categoria?.nombre ?? '' }
}

/** Ingresos (activos y anulados) con `fecha` entre las dos fechas YYYY-MM-DD, ambas inclusivas. */
export async function fetchIngresosOtros(desde: string, hasta: string): Promise<IngresoOtroConCategoria[]> {
  const data = await paginar<IngresoRow>((a, b) =>
    db
      .from('ingresos_otros')
      .select(INGRESO_SELECT)
      .gte('fecha', desde)
      .lte('fecha', hasta)
      .order('fecha', { ascending: false })
      .order('consecutivo', { ascending: false })
      .order('id')
      .range(a, b),
  )
  return data.map(mapIngresoRow)
}

export async function createIngresoOtro(input: IngresoOtroInput): Promise<IngresoOtroConCategoria> {
  const parsed = ingresoOtroInputSchema.parse(input)
  const { data, error } = await db
    .rpc('registrar_ingreso_otro', {
      p_fecha: parsed.fecha,
      p_categoria_id: parsed.categoriaId,
      p_descripcion: parsed.descripcion,
      p_monto: parsed.monto,
      p_metodo_pago: parsed.metodoPago,
    })
    .select(INGRESO_SELECT)
    .single()
  if (error) throw new Error(error.message)
  return mapIngresoRow(data as unknown as IngresoRow)
}

export async function anularIngresoOtro(id: string, input: { motivo: string }): Promise<IngresoOtroConCategoria> {
  const parsed = anularIngresoOtroInputSchema.parse(input)
  const { data, error } = await db
    .rpc('anular_ingreso_otro', { p_ingreso_id: id, p_motivo: parsed.motivo })
    .select(INGRESO_SELECT)
    .single()
  if (error) throw new Error(error.message)
  return mapIngresoRow(data as unknown as IngresoRow)
}
