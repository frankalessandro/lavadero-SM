import { useRef, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { anularVentaInputSchema } from '../../schemas/venta'
import type { Venta } from '../../schemas/venta'
import { toast } from '../../lib/toast'
import { DestinoProductoAnulado } from './DestinoProductoAnulado'
import { Modal } from './Modal'
import { Button } from './Button'

const COP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })

// Quitar un producto ya cargado a un destino pendiente (orden o cuenta abierta) antes de
// cobrar/cerrar — regla de negocio 13: se anula con motivo, no se borra, queda visible en
// reportes. Desde 0068 se declara si el producto volvió a la nevera o se consumió: si se
// consumió, sale del inventario aunque no se cobre.
export function QuitarProductoModal({
  venta,
  productoNombre,
  onClose,
  onQuitar,
}: {
  venta: Venta
  productoNombre: string
  onClose: () => void
  onQuitar: (venta: Venta, motivo: string, seConsumio: boolean) => Promise<void>
}) {
  const [motivo, setMotivo] = useState('Quitado antes de cobrar')
  const [seConsumio, setSeConsumio] = useState<boolean | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const enVueloRef = useRef(false)

  async function handleSubmit() {
    if (enVueloRef.current) return
    const parsed = anularVentaInputSchema.pick({ motivo: true, seConsumio: true }).safeParse({ motivo, seConsumio })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Indica un motivo')
      return
    }
    setError(null)
    enVueloRef.current = true
    setSaving(true)
    try {
      await onQuitar(venta, parsed.data.motivo, parsed.data.seConsumio)
      toast.exito('Producto quitado')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo quitar el producto')
      toast.desdeError(err, 'No se pudo quitar el producto')
      enVueloRef.current = false
      setSaving(false)
    }
  }

  return (
    <Modal
      title="Quitar producto"
      subtitle="Queda anulado con el motivo, visible en reportes."
      icon={Trash2}
      tone="danger"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="danger" loading={saving} disabled={seConsumio === null} onClick={() => void handleSubmit()}>
            Quitar producto
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="flex items-center justify-between gap-3 rounded-xl border border-neutral-100 px-4 py-3">
          <span className="flex min-w-0 items-center gap-2 text-sm font-medium text-neutral-800">
            <span className="truncate">{productoNombre}</span>
            <span className="shrink-0 rounded-md bg-neutral-100 px-1.5 py-0.5 text-[11px] font-semibold text-neutral-500">×{venta.cantidad}</span>
          </span>
          <span className="shrink-0 text-sm font-bold text-neutral-900">{COP.format(venta.total)}</span>
        </div>

        <DestinoProductoAnulado value={seConsumio} onChange={setSeConsumio} />

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-neutral-700">Motivo</span>
          <textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            rows={2}
            className="resize-none rounded-lg border border-neutral-300 px-3 py-2.5 text-sm outline-none transition-colors focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
          />
        </label>

        {error ? <p className="rounded-lg bg-danger-50 px-3 py-2.5 text-sm text-danger-700">{error}</p> : null}
      </div>
    </Modal>
  )
}
