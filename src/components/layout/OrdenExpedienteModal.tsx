import { useEffect, useState } from 'react'
import { ClipboardList } from 'lucide-react'
import { fetchPagosDeOrden } from '../../data/pagos'
import { fetchVentasDeOrden } from '../../data/ventas'
import type { Orden } from '../../schemas/orden'
import type { Pago } from '../../schemas/pago'
import type { Venta } from '../../schemas/venta'
import { OrdenDetalleCard } from './OrdenDetalleCard'
import { Modal } from './Modal'

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
    <Modal
      title={
        <span className="flex items-baseline gap-2">
          <span className="font-mono">{orden.placa}</span>
          <span className="text-xs font-normal text-neutral-400">#{orden.consecutivo}</span>
        </span>
      }
      subtitle={orden.clienteNombre}
      icon={ClipboardList}
      size="lg"
      onClose={onClose}
    >
      <OrdenDetalleCard
        orden={orden}
        pagos={pagos}
        productos={productos}
        comboNombre={comboNombre}
        lavadorNombre={lavadorNombre}
        productoNombre={productoNombre}
      />
    </Modal>
  )
}
