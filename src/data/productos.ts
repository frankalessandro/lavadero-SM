import { db } from '../lib/db'
import { productoInputSchema, productoSchema, type Producto, type ProductoInput } from '../schemas/producto'

const PRODUCTO_SELECT = 'id, nombre, unidadMedida:unidad_medida, stockMinimo:stock_minimo, activo, precioVenta:precio_venta'

export async function fetchProductos(): Promise<Producto[]> {
  const { data, error } = await db.from('productos').select(PRODUCTO_SELECT).order('nombre')
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
