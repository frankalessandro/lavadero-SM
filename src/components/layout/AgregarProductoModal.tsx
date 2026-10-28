import { useRef, useState } from 'react'
import { Minus, PackagePlus, Plus } from 'lucide-react'
import type { Producto } from '../../schemas/producto'
import { agruparPorSeccion } from '../../lib/seccionProductos'
import { toast } from '../../lib/toast'
import { Modal } from './Modal'
import { Button } from './Button'

const COP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })

// Cargar productos de nevera a un destino pendiente (una orden en espera, o una cuenta abierta a
// nombre de alguien) — se acumulan como 'pendiente' y se cobran juntos al entregar/cerrar. Grilla
// de productos como botones grandes (un toque suma uno) con stepper al elegir; el pie dice cuántos
// van y cuánto suman. Genérico: el caller decide a qué destino va cada línea (`onAgregar`).
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
  // DISPONIBLE por producto (stock − lo ya cargado a órdenes/cuentas sin cobrar), no el stock
  // bruto: lo comprometido ya salió de la nevera. Es el mismo criterio con que valida la RPC.
  stockPorProducto: Map<string, number>
  onClose: () => void
  onAgregar: (productoId: string, cantidad: number) => Promise<void>
}) {
  const [carrito, setCarrito] = useState<Map<string, number>>(new Map())
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const enVueloRef = useRef(false)

  // Solo lo que hay en nevera. Un agotado no se puede vender igual (la RPC lo rechaza), así que
  // ocupar media grilla con tiles grises solo estorba en una pantalla que se opera con el pulgar.
  // Se filtra ANTES de agrupar para que una sección sin existencias no deje su encabezado huérfano.
  // Ojo: esto NO toca `productos.activo` — "agotado" es transitorio y el producto sigue en el
  // catálogo, en el formulario de entrada y en el conteo ciego de turno. Inactivarlo al llegar a 0
  // lo sacaría de esos tres, y el jefe de patio no puede reactivarlo (solo tiene SELECT por RLS).
  const disponibles = productos.filter((p) => (stockPorProducto.get(p.id) ?? 0) > 0)

  function setCantidad(productoId: string, cantidad: number) {
    setCarrito((prev) => {
      const siguiente = new Map(prev)
      if (cantidad <= 0) siguiente.delete(productoId)
      else siguiente.set(productoId, cantidad)
      return siguiente
    })
  }

  const lineas = [...carrito.entries()]
  const unidades = lineas.reduce((s, [, c]) => s + c, 0)
  const total = lineas.reduce((suma, [id, cant]) => {
    const p = productos.find((x) => x.id === id)
    return suma + (p?.precioVenta ?? 0) * cant
  }, 0)

  async function handleSubmit() {
    if (enVueloRef.current) return
    if (lineas.length === 0) return
    setError(null)
    enVueloRef.current = true
    setSaving(true)
    try {
      for (const [productoId, cantidad] of lineas) {
        await onAgregar(productoId, cantidad)
      }
      onClose()
      toast.exito(unidades === 1 ? 'Producto agregado' : `${unidades} productos agregados`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo agregar el producto')
      toast.desdeError(err, 'No se pudo agregar el producto')
    } finally {
      enVueloRef.current = false
      setSaving(false)
    }
  }

  return (
    <Modal
      title={titulo}
      subtitle={subtitulo}
      icon={PackagePlus}
      onClose={onClose}
      footer={
        <>
          <span className="mr-auto hidden self-center text-sm text-neutral-500 sm:block">
            {unidades > 0 ? (
              <>
                {unidades} {unidades === 1 ? 'producto' : 'productos'} · <span className="font-semibold text-neutral-900">{COP.format(total)}</span>
              </>
            ) : (
              'Toca un producto para sumarlo'
            )}
          </span>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" icon={Plus} loading={saving} disabled={lineas.length === 0} onClick={() => void handleSubmit()}>
            {lineas.length === 0 ? 'Elige productos' : `Agregar ${unidades} · ${COP.format(total)}`}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        {disponibles.length === 0 ? (
          <p className="rounded-xl bg-neutral-50 px-4 py-6 text-center text-sm text-neutral-500">
            {productos.length === 0
              ? 'No hay productos con precio de venta configurado.'
              : 'No hay productos con existencias. Registra una entrada en Inventario para poder venderlos.'}
          </p>
        ) : null}
        {agruparPorSeccion(disponibles).map((g) => (
          <section key={g.key} className="flex flex-col gap-2">
            <h4 className="text-[11px] font-semibold tracking-wide text-neutral-500 uppercase">{g.label}</h4>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {g.productos.map((p) => {
                const stock = stockPorProducto.get(p.id) ?? 0
                const cant = carrito.get(p.id) ?? 0
                const tope = cant >= stock
                return (
                  <div
                    key={p.id}
                    className={`flex flex-col justify-between gap-2 rounded-xl border p-3 transition-colors ${
                      cant > 0 ? 'border-primary-500 bg-primary-50/60 ring-1 ring-primary-500' : 'border-neutral-200 hover:border-neutral-300'
                    }`}
                  >
                    <button
                      type="button"
                      disabled={tope}
                      onClick={() => setCantidad(p.id, cant + 1)}
                      className="flex flex-col gap-0.5 text-left disabled:cursor-not-allowed"
                    >
                      <span className="text-sm leading-snug font-medium text-neutral-800">{p.nombre}</span>
                      <span className="text-sm font-semibold text-neutral-900">{COP.format(p.precioVenta ?? 0)}</span>
                      <span className={`text-[11px] ${stock <= 3 ? 'font-medium text-warning-700' : 'text-neutral-400'}`}>
                        {stock === 1 ? 'Queda 1' : `Quedan ${stock}`}
                      </span>
                    </button>
                    {cant > 0 ? (
                      <div className="flex items-center justify-between rounded-lg bg-white p-0.5 shadow-card">
                        <button
                          type="button"
                          onClick={() => setCantidad(p.id, cant - 1)}
                          aria-label={`Quitar uno de ${p.nombre}`}
                          className="flex size-8 items-center justify-center rounded-md text-neutral-600 transition-colors hover:bg-neutral-100"
                        >
                          <Minus size={14} />
                        </button>
                        <span className="text-sm font-bold text-neutral-900">{cant}</span>
                        <button
                          type="button"
                          disabled={tope}
                          onClick={() => setCantidad(p.id, cant + 1)}
                          aria-label={`Sumar uno de ${p.nombre}`}
                          className="flex size-8 items-center justify-center rounded-md text-neutral-600 transition-colors hover:bg-neutral-100 disabled:opacity-30"
                        >
                          <Plus size={14} />
                        </button>
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </div>
          </section>
        ))}

        {error ? <p className="rounded-lg bg-danger-50 px-3 py-2.5 text-sm text-danger-700">{error}</p> : null}
      </div>
    </Modal>
  )
}
