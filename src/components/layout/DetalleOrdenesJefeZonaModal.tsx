import { X, ShieldCheck } from 'lucide-react'

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
// comisión (3% del precio de lista de la orden — es por orden, no por cada servicio suelto).
export function DetalleOrdenesJefeZonaModal({ responsable, filas, onClose }: Props) {
  const totalComision = filas.reduce((s, f) => s + f.comisionJefeZona, 0)
  const totalPrecio = filas.reduce((s, f) => s + f.precio, 0)

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-neutral-900/40 p-4 backdrop-blur-[2px]">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl bg-white p-6 shadow-card-hover sm:p-7">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-600">
              <ShieldCheck size={18} strokeWidth={2} />
            </span>
            <div className="min-w-0 pt-1">
              <h3 className="text-base font-semibold text-neutral-900">Órdenes sin liquidar — {responsable}</h3>
              <p className="mt-1 text-sm text-neutral-500">
                {filas.length} orden{filas.length === 1 ? '' : 'es'} · comisión de jefe de patio por cobrar{' '}
                <span className="font-medium text-neutral-700">{COP.format(totalComision)}</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex size-8 shrink-0 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-600"
          >
            <X size={18} />
          </button>
        </div>

        <div className="mt-5 -mx-1 flex-1 overflow-y-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-xs font-medium uppercase tracking-wide text-neutral-500">
                <th className="px-3 py-2.5">Fecha</th>
                <th className="px-3 py-2.5">Vehículo</th>
                <th className="px-3 py-2.5">Servicio</th>
                <th className="px-3 py-2.5 text-right">Precio</th>
                <th className="px-3 py-2.5 text-right">Le toca (3%)</th>
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

        <div className="mt-5 flex justify-end border-t border-neutral-100 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm font-medium text-neutral-600 transition-colors hover:bg-neutral-100"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}
