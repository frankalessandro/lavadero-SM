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
  type LineaNegocio,
} from '../schemas/gasto'

const CATEGORIA_SELECT = 'id, nombre, activo, linea'

// `linea` viaja como null desde Postgres (NULL = gasto general, ver 0059) y el schema la declara
// `.optional()`, así que se normaliza acá — mismo criterio que `turnoId` en `mapGastoRow`.
function mapCategoriaRow(row: unknown): CategoriaGasto {
  const { linea, ...rest } = row as { linea: LineaNegocio | null }
  return categoriaGastoSchema.parse({ ...rest, linea: linea ?? undefined })
}

export async function fetchCategoriasGasto(): Promise<CategoriaGasto[]> {
  const { data, error } = await db
    .from('categorias_gasto')
    .select(CATEGORIA_SELECT)
    .order('activo', { ascending: false })
    .order('nombre')
  if (error) throw new Error(error.message)
  return (data ?? []).map(mapCategoriaRow)
}

export async function createCategoriaGasto(input: CategoriaGastoInput): Promise<CategoriaGasto> {
  const parsed = categoriaGastoInputSchema.parse(input)
  const payload = { nombre: parsed.nombre, linea: parsed.linea ?? null }
  const { data, error } = await db.from('categorias_gasto').insert(payload).select(CATEGORIA_SELECT).single()
  if (error) throw new Error(error.message)
  return mapCategoriaRow(data)
}

// Editar la línea de una categoría re-imputa TODOS sus gastos, históricos incluidos — la
// rentabilidad agrupa por la línea vigente de la categoría, no por una copia guardada en el gasto.
// Es deliberado: si una categoría estaba mal clasificada, el reporte del mes pasado también lo
// estaba, y arreglarla debe arreglar el histórico. No confundir con el snapshot de precios/costos
// (regla 13), que sí congela lo que se cobró — acá no se está reescribiendo ninguna cifra.
export async function updateCategoriaGasto(id: string, input: CategoriaGastoInput): Promise<CategoriaGasto> {
  const parsed = categoriaGastoInputSchema.parse(input)
  const payload = { nombre: parsed.nombre, linea: parsed.linea ?? null }
  const { data, error } = await db
    .from('categorias_gasto')
    .update(payload)
    .eq('id', id)
    .select(CATEGORIA_SELECT)
    .single()
  if (error) throw new Error(error.message)
  return mapCategoriaRow(data)
}

export async function setCategoriaGastoActivo(id: string, activo: boolean): Promise<CategoriaGasto> {
  const { data, error } = await db
    .from('categorias_gasto')
    .update({ activo })
    .eq('id', id)
    .select(CATEGORIA_SELECT)
    .single()
  if (error) throw new Error(error.message)
  return mapCategoriaRow(data)
}

// select con embedding vía FK de PostgREST: categorias_gasto(nombre) resuelve el nombre de la
// categoría en la misma consulta (confirmado con curl contra categoria_id -> categorias_gasto(id)).
// El embed trae `linea` junto al nombre para que la rentabilidad pueda repartir los gastos por
// línea de negocio (0059) sin una segunda consulta a `categorias_gasto`.
const GASTO_SELECT =
  'id, fecha, categoriaId:categoria_id, categoria:categorias_gasto(nombre, linea), descripcion, monto, responsable, origen, turnoId:turno_id, creadoEn:creado_en'

interface GastoRow {
  id: string
  fecha: string
  categoriaId: string
  categoria: { nombre: string; linea: LineaNegocio | null } | null
  descripcion: string
  monto: number
  responsable: string
  origen: 'caja' | 'otro'
  turnoId: string | null
  creadoEn: string
}

export interface GastoConCategoria extends Gasto {
  categoriaNombre: string
  /** `undefined` = categoría sin línea → gasto general, se resta del consolidado (ver 0059). */
  categoriaLinea?: LineaNegocio
}

function mapGastoRow(row: GastoRow): GastoConCategoria {
  const { categoria, turnoId, ...rest } = row
  return {
    // `turno_id` viaja como null desde Postgres y el schema lo declara `.optional()` (no
    // `.nullable()`), así que se normaliza acá — mismo criterio que el resto del data layer.
    ...gastoSchema.parse({ ...rest, turnoId: turnoId ?? undefined }),
    categoriaNombre: categoria?.nombre ?? '',
    categoriaLinea: categoria?.linea ?? undefined,
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

// Gastos de caja menuda imputados a un turno (`origen: 'caja'` + `turno_id`) — es lo que
// `calcularValorEsperado` resta del arqueo. Se pide el turno explícito en vez de resolver el
// abierto acá dentro para que el llamador no pueda imputar por accidente a un turno distinto al
// que está viendo en pantalla.
export async function fetchGastosDeTurno(turnoId: string): Promise<GastoConCategoria[]> {
  const { data, error } = await db
    .from('gastos')
    .select(GASTO_SELECT)
    .eq('turno_id', turnoId)
    .eq('origen', 'caja')
    .order('creado_en', { ascending: false })
  if (error) throw new Error(error.message)
  return (data as unknown as GastoRow[]).map(mapGastoRow)
}

export async function createGasto(input: GastoInput): Promise<GastoConCategoria> {
  const parsed = gastoInputSchema.parse(input)
  const payload = {
    fecha: parsed.fecha,
    categoria_id: parsed.categoriaId,
    descripcion: parsed.descripcion,
    monto: parsed.monto,
    responsable: parsed.responsable,
    origen: parsed.origen,
    // Sin esto ningún gasto reducía el arqueo: la columna existe desde 0007 y
    // `calcularValorEsperado` la consulta, pero nadie la escribía (ver 0042).
    turno_id: parsed.turnoId ?? null,
  }
  const { data, error } = await db.from('gastos').insert(payload).select(GASTO_SELECT).single()
  if (error) throw new Error(error.message)
  return mapGastoRow(data as unknown as GastoRow)
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
