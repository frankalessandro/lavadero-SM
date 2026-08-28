import { db } from '../lib/db'
import { productoInputSchema, productoSchema, type Producto, type ProductoInput } from '../schemas/producto'

const PRODUCTO_SELECT = 'id, nombre, unidadMedida:unidad_medida, stockMinimo:stock_minimo, activo, precioVenta:precio_venta, costo'

// Sin la columna `costo` — jefe de zona no ve costos (CLAUDE.md §Roles). Es lo que expone la
// vista productos_operativo (0034).
const PRODUCTO_OPERATIVO_SELECT = 'id, nombre, unidadMedida:unidad_medida, stockMinimo:stock_minimo, activo, precioVenta:precio_venta'

// Catálogo completo, con `costo` — solo lo llama el panel de admin. RLS deja leer `productos`
// (tabla base) a admin y a jefe_zona, así que el candado real del costo es que jefe_zona use
// fetchProductosOperativo() en su lugar, no esta función.
export async function fetchProductos(): Promise<Producto[]> {
  const { data, error } = await db.from('productos').select(PRODUCTO_SELECT).order('nombre')
  if (error) throw new Error(error.message)
  return productoSchema.array().parse(data)
}

// Igual que fetchProductos pero contra la vista productos_operativo, que no expone `costo`. Lo
// usan las pantallas de jefe de zona (ventas, inventario) — nada de costos al bundle de ese rol.
export async function fetchProductosOperativo(): Promise<Producto[]> {
  const { data, error } = await db.from('productos_operativo').select(PRODUCTO_OPERATIVO_SELECT).order('nombre')
  if (error) throw new Error(error.message)
  return productoSchema.array().parse(data)
}

// Regla "nunca se elimina" (regla 5/13, aplicada también a maestros): se inactiva, no se borra.
export async function createProducto(input: ProductoInput): Promise<Producto> {
  const parsed = productoInputSchema.parse(input)
  const { data, error } = await db
    .from('productos')
    .insert({
      nombre: parsed.nombre,
      unidad_medida: parsed.unidadMedida,
      stock_minimo: parsed.stockMinimo,
      precio_venta: parsed.precioVenta ?? null,
      costo: parsed.costo ?? null,
    })
    .select(PRODUCTO_SELECT)
    .single()
  if (error) throw new Error(error.message)
  return productoSchema.parse(data)
}

export async function updateProducto(id: string, input: ProductoInput): Promise<Producto> {
  const parsed = productoInputSchema.parse(input)
  const { data, error } = await db
    .from('productos')
    .update({
      nombre: parsed.nombre,
      unidad_medida: parsed.unidadMedida,
      stock_minimo: parsed.stockMinimo,
      precio_venta: parsed.precioVenta ?? null,
      costo: parsed.costo ?? null,
    })
    .eq('id', id)
    .select(PRODUCTO_SELECT)
    .single()
  if (error) throw new Error(error.message)
  return productoSchema.parse(data)
}

export async function setProductoActivo(id: string, activo: boolean): Promise<Producto> {
  const { data, error } = await db
    .from('productos')
    .update({ activo })
    .eq('id', id)
    .select(PRODUCTO_SELECT)
    .single()
  if (error) throw new Error(error.message)
  return productoSchema.parse(data)
}
