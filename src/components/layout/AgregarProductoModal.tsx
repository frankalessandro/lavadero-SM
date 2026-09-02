import { useState, type FormEvent } from 'react'
import { X, Minus, Plus } from 'lucide-react'
import type { Producto } from '../../schemas/producto'

const COP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })

// Cargar productos de nevera a un destino pendiente (una orden en espera, o una cuenta abierta a
// nombre de alguien) — se acumulan como 'pendiente' y se cobran juntos al entregar/cerrar. Hoja
// anclada abajo en móvil (mismo patrón que CobroModal), grilla de productos como botones grandes
// + carrito con steppers. Genérico: el caller decide a qué destino va cada línea (`onAgregar`).
export function AgregarProductoModal({
  titulo,
  subtitulo,
  productos,
  stockPorProducto,
  onClose,
  onAgregar,
}: {
  titulo: string
  subtitulo: string
  productos: Producto[]
  stockPorProducto: Map<string, number>
  onClose: () => void
  onAgregar: (productoId: string, cantidad: number) => Promise<void>
}) {
  const [carrito, setCarrito] = useState<Map<string, number>>(new Map())
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  function setCantidad(productoId: string, cantidad: number) {
    setCarrito((prev) => {
      const siguiente = new Map(prev)
      if (cantidad <= 0) siguiente.delete(productoId)
      else siguiente.set(productoId, cantidad)
      return siguiente
    })
  }

  const lineas = [...carrito.entries()]
  const total = lineas.reduce((suma, [id, cant]) => {
    const p = productos.find((x) => x.id === id)
    return suma + (p?.precioVenta ?? 0) * cant
  }, 0)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (lineas.length === 0) return
    setError(null)
    setSaving(true)
    try {
      for (const [productoId, cantidad] of lineas) {
        await onAgregar(productoId, cantidad)
      }
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo agregar el producto')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center bg-neutral-900/40 backdrop-blur-[2px] sm:items-center sm:p-4">
      <div className="flex max-h-[90vh] w-full max-w-sm flex-col rounded-t-2xl bg-white p-5 shadow-card-hover sm:rounded-2xl sm:p-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-neutral-900">{titulo}</h3>
            <p className="text-xs text-neutral-500">{subtitulo}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex size-8 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-neutral-100"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-col gap-4">
          <div className="custom-scroll grid min-h-0 grid-cols-2 gap-2 overflow-y-auto">
            {productos.map((p) => {
              const stock = stockPorProducto.get(p.id) ?? 0
              const cant = carrito.get(p.id) ?? 0
              const agotado = stock <= 0
              return (
                <div
                  key={p.id}
                  className={`flex flex-col gap-1.5 rounded-lg border p-2.5 text-left transition-colors ${
                    cant > 0 ? 'border-primary-500 bg-primary-50' : 'border-neutral-200'
                  } ${agotado ? 'opacity-50' : ''}`}
                >
                  <button
                    type="button"
                    disabled={agotado}
                    onClick={() => setCantidad(p.id, cant + 1)}
                    className="text-left disabled:cursor-not-allowed"
                  >
                    <span className="block text-sm font-medium text-neutral-800">{p.nombre}</span>
                    <span className="block text-xs text-neutral-500">
                      {COP.format(p.precioVenta ?? 0)} · stock {stock}
                    </span>
                  </button>
                  {cant > 0 ? (
                    <div className="flex items-center justify-between rounded-md bg-white px-1 py-0.5">
                      <button
                        type="button"
                        onClick={() => setCantidad(p.id, cant - 1)}
                        className="flex size-6 items-center justify-center rounded text-neutral-600 hover:bg-neutral-100"
                      >
                        <Minus size={13} />
                      </button>
                      <span className="text-sm font-semibold text-neutral-900">{cant}</span>
                      <button
                        type="button"
                        onClick={() => setCantidad(p.id, cant + 1)}
                        className="flex size-6 items-center justify-center rounded text-neutral-600 hover:bg-neutral-100"
                      >
                        <Plus size={13} />
                      </button>
                    </div>
                  ) : null}
                </div>
              )
            })}
            {productos.length === 0 ? (
              <p className="col-span-2 py-6 text-center text-xs text-neutral-400">
                No hay productos con precio de venta configurado.
              </p>
            ) : null}
          </div>

          {error ? <p className="text-xs text-danger-600">{error}</p> : null}

          <button
            type="submit"
            disabled={saving || lineas.length === 0}
            className="flex items-center justify-center gap-2 rounded-lg bg-primary-600 py-3 text-sm font-semibold text-white shadow-nav-active transition-colors hover:bg-primary-700 disabled:opacity-60"
          >
            <Plus size={16} />
            {saving
              ? 'Agregando…'
              : lineas.length === 0
                ? 'Elige productos'
                : `Agregar ${lineas.reduce((s, [, c]) => s + c, 0)} · ${COP.format(total)}`}
          </button>
        </form>
      </div>
    </div>
  )
}
