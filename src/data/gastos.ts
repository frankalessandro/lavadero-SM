import { db } from '../lib/db'
import {
  categoriaGastoInputSchema,
  categoriaGastoSchema,
  gastoInputSchema,
  gastoSchema,
  type CategoriaGasto,
  type CategoriaGastoInput,
  type Gasto,
  type GastoInput,
} from '../schemas/gasto'

export async function fetchCategoriasGasto(): Promise<CategoriaGasto[]> {
  const { data, error } = await db
    .from('categorias_gasto')
    .select('*')
    .order('activo', { ascending: false })
    .order('nombre')
  if (error) throw new Error(error.message)
  return categoriaGastoSchema.array().parse(data)
}

export async function createCategoriaGasto(input: CategoriaGastoInput): Promise<CategoriaGasto> {
  const parsed = categoriaGastoInputSchema.parse(input)
  const { data, error } = await db.from('categorias_gasto').insert(parsed).select().single()
  if (error) throw new Error(error.message)
  return categoriaGastoSchema.parse(data)
}

export async function setCategoriaGastoActivo(id: string, activo: boolean): Promise<CategoriaGasto> {
  const { data, error } = await db.from('categorias_gasto').update({ activo }).eq('id', id).select().single()
  if (error) throw new Error(error.message)
  return categoriaGastoSchema.parse(data)
}

// select con embedding vía FK de PostgREST: categorias_gasto(nombre) resuelve el nombre de la
// categoría en la misma consulta (confirmado con curl contra categoria_id -> categorias_gasto(id)).
const GASTO_SELECT =
  'id, fecha, categoriaId:categoria_id, categoriaNombre:categorias_gasto(nombre), descripcion, monto, responsable, origen, creadoEn:creado_en'

interface GastoRow {
  id: string
  fecha: string
  categoriaId: string
  categoriaNombre: { nombre: string } | null
  descripcion: string
  monto: number
  responsable: string
  origen: 'caja' | 'otro'
  creadoEn: string
}

export interface GastoConCategoria extends Gasto {
  categoriaNombre: string
}

function mapGastoRow(row: GastoRow): GastoConCategoria {
  const { categoriaNombre, ...rest } = row
  return {
    ...gastoSchema.parse(rest),
    categoriaNombre: categoriaNombre?.nombre ?? '',
  }
}

export async function fetchGastos(desdeISO?: string, hastaISO?: string): Promise<GastoConCategoria[]> {
  let query = db
    .from('gastos')
    .select(GASTO_SELECT)
    .order('fecha', { ascending: false })
    .order('creado_en', { ascending: false })
  if (desdeISO) query = query.gte('fecha', desdeISO)
  if (hastaISO) query = query.lte('fecha', hastaISO)
  const { data, error } = await query
  if (error) throw new Error(error.message)
  return (data as unknown as GastoRow[]).map(mapGastoRow)
}

export async function createGasto(input: GastoInput): Promise<Gasto> {
  const parsed = gastoInputSchema.parse(input)
  const payload = {
    fecha: parsed.fecha,
    categoria_id: parsed.categoriaId,
    descripcion: parsed.descripcion,
    monto: parsed.monto,
    responsable: parsed.responsable,
    origen: parsed.origen,
  }
  const { data, error } = await db.from('gastos').insert(payload).select().single()
  if (error) throw new Error(error.message)
  return gastoSchema.parse(data)
}

export interface TotalPorCategoria {
  categoriaId: string
  categoriaNombre: string
  total: number
}

export async function fetchTotalGastosPorCategoria(
  desdeISO: string,
  hastaISO: string,
): Promise<TotalPorCategoria[]> {
  const gastos = await fetchGastos(desdeISO, hastaISO)
  const totales = new Map<string, TotalPorCategoria>()
  for (const gasto of gastos) {
    const existente = totales.get(gasto.categoriaId)
    if (existente) {
      existente.total += gasto.monto
    } else {
      totales.set(gasto.categoriaId, {
        categoriaId: gasto.categoriaId,
        categoriaNombre: gasto.categoriaNombre,
        total: gasto.monto,
      })
    }
  }
  return Array.from(totales.values()).sort((a, b) => b.total - a.total)
}
