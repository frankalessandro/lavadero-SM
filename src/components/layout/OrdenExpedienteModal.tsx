import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { fetchPagosDeOrden } from '../../data/pagos'
import { fetchVentasDeOrden } from '../../data/ventas'
import type { Orden } from '../../schemas/orden'
import type { Pago } from '../../schemas/pago'
import type { Venta } from '../../schemas/venta'
import { OrdenDetalleCard } from './OrdenDetalleCard'

interface Props {
  orden: Orden
  comboNombre: (id: string | undefined) => string
  lavadorNombre: (id: string | undefined) => string | undefined
  productoNombre: (id: string) => string
  onClose: () => void
}

// Detalle de una sola orden — trae su pago partido y sus productos y los pasa a OrdenDetalleCard.
export function OrdenExpedienteModal({ orden, comboNombre, lavadorNombre, productoNombre, onClose }: Props) {
  const [pagos, setPagos] = useState<Pago[]>([])
  const [productos, setProductos] = useState<Venta[]>([])

  useEffect(() => {
    let vivo = true
    Promise.all([fetchPagosDeOrden(orden.id), fetchVentasDeOrden(orden.id)])
      .then(([p, v]) => {
        if (!vivo) return
        setPagos(p)
        setProductos(v)
      })
      .catch(() => {})
    return () => {
      vivo = false
    }
  }, [orden.id])

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-neutral-900/40 p-4" onClick={onClose}>
      <div className="my-6 w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
        <div className="mb-2 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="flex size-8 items-center justify-center rounded-lg bg-white text-neutral-400 shadow-card transition-colors hover:bg-neutral-100"
          >
            <X size={18} />
          </button>
        </div>
        <OrdenDetalleCard
          orden={orden}
          pagos={pagos}
          productos={productos}
          comboNombre={comboNombre}
          lavadorNombre={lavadorNombre}
          productoNombre={productoNombre}
        />
      </div>
    </div>
  )
}
