import { ShieldCheck } from 'lucide-react'
import { Modal } from './Modal'
import { Button } from './Button'

const COP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })
const FECHA_HORA = new Intl.DateTimeFormat('es-CO', { dateStyle: 'short', timeStyle: 'short' })

export interface DetalleOrdenJefeZonaFila {
  consecutivo: number
  creadoEn: string
  placa: string
  tipoNombre: string
  comboNombre: string
  adicionales: string[]
  precio: number
  comisionJefeZona: number
}

interface Props {
  responsable: string
  filas: DetalleOrdenJefeZonaFila[]
  onClose: () => void
}

// Modal de solo lectura que se abre desde la tarjeta de "Comisiones pendientes" del jefe de patio:
// cada orden sin liquidar de ese responsable, con fecha, vehículo, servicio y cuánto le toca de
// comisión (2,5% o 3,5% del precio de lista según el combo — es por orden, no por cada servicio suelto).
export function DetalleOrdenesJefeZonaModal({ responsable, filas, onClose }: Props) {
  const totalComision = filas.reduce((s, f) => s + f.comisionJefeZona, 0)
  const totalPrecio = filas.reduce((s, f) => s + f.precio, 0)

  return (
    <Modal
      title={`Órdenes sin liquidar — ${responsable}`}
      subtitle={
        <>
          {filas.length} orden{filas.length === 1 ? '' : 'es'} · comisión por cobrar{' '}
          <span className="font-semibold text-neutral-700">{COP.format(totalComision)}</span>
        </>
      }
      icon={ShieldCheck}
      size="xl"
      flush
      onClose={onClose}
      footer={
        <Button variant="ghost" onClick={onClose}>
          Cerrar
        </Button>
      }
    >
        <div className="custom-scroll overflow-x-auto px-3 py-2 sm:px-4">
          <table className="w-full min-w-[30rem] text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-xs font-medium uppercase tracking-wide text-neutral-500">
                <th className="px-3 py-2.5">Fecha</th>
                <th className="px-3 py-2.5">Vehículo</th>
                <th className="px-3 py-2.5">Servicio</th>
                <th className="px-3 py-2.5 text-right">Precio</th>
                <th className="px-3 py-2.5 text-right">Le toca (2,5% / 3,5%)</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.consecutivo} className="border-b border-neutral-100 last:border-0">
                  <td className="px-3 py-2.5 align-top text-neutral-600">
                    <span className="whitespace-nowrap">{FECHA_HORA.format(new Date(f.creadoEn))}</span>
                    <span className="mt-0.5 block text-[11px] text-neutral-400">#{f.consecutivo}</span>
                  </td>
                  <td className="px-3 py-2.5 align-top">
                    <span className="font-mono font-semibold text-neutral-900">{f.placa}</span>
                    <span className="mt-0.5 block text-[11px] text-neutral-400">{f.tipoNombre}</span>
                  </td>
                  <td className="px-3 py-2.5 align-top text-neutral-700">
                    {f.comboNombre}
                    {f.adicionales.length > 0 ? (
                      <span className="mt-0.5 block text-[11px] text-neutral-400">+ {f.adicionales.join(', ')}</span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2.5 align-top text-right text-neutral-600">{COP.format(f.precio)}</td>
                  <td className="px-3 py-2.5 align-top text-right font-medium text-neutral-900">
                    {COP.format(f.comisionJefeZona)}
                  </td>
                </tr>
              ))}
              {filas.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-neutral-400">
                    No hay órdenes sin liquidar para este responsable.
                  </td>
                </tr>
              ) : null}
            </tbody>
            {filas.length > 0 ? (
              <tfoot>
                <tr className="border-t border-neutral-200 font-medium text-neutral-900">
                  <td className="px-3 py-2.5" colSpan={3}>
                    Total
                  </td>
                  <td className="px-3 py-2.5 text-right text-neutral-600">{COP.format(totalPrecio)}</td>
                  <td className="px-3 py-2.5 text-right">{COP.format(totalComision)}</td>
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
    </Modal>
  )
}
