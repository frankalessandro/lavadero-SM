import type { ReactNode } from 'react'
import { Car, Sparkles } from 'lucide-react'
import { METODO_PAGO_LABEL } from '../../lib/metodoPago'
import { ESTADO_ORDEN_CLASS, ESTADO_ORDEN_LABEL, duracion } from '../../lib/ordenFormato'
import type { Orden } from '../../schemas/orden'
import type { Pago } from '../../schemas/pago'
import type { Venta } from '../../schemas/venta'
import { Card } from './Card'

const COP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })
const FECHA_HORA = new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short' })
const HORA = new Intl.DateTimeFormat('es-CO', { timeStyle: 'short' })

export function Dato({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">{label}</p>
      <p className="text-sm text-neutral-800">{children}</p>
    </div>
  )
}

interface OrdenDetalleCardProps {
  orden: Orden
  pagos?: Pago[]
  productos?: Venta[]
  comboNombre: (id: string | undefined) => string
  lavadorNombre: (id: string | undefined) => string | undefined
  productoNombre: (id: string) => string
}

// Tarjeta con todo el detalle de una orden — horas, combo, lavador(es), dinero, desglose del
// pago partido, productos y (si aplica) la anulación. Compartida por el expediente del cliente,
// el del lavador y el del turno.
export function OrdenDetalleCard({
  orden: o,
  pagos = [],
  productos = [],
  comboNombre,
  lavadorNombre,
  productoNombre,
}: OrdenDetalleCardProps) {
  const lav1 = lavadorNombre(o.lavadorId)
  const lav2 = lavadorNombre(o.lavadorId2)
  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-mono text-sm font-semibold text-neutral-900">
          #{o.consecutivo} · {o.placa}
        </span>
        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${ESTADO_ORDEN_CLASS[o.estado]}`}>
          {ESTADO_ORDEN_LABEL[o.estado]}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Dato label="Ingreso">{FECHA_HORA.format(new Date(o.creadoEn))}</Dato>
        <Dato label="Listo">{o.listaEn ? HORA.format(new Date(o.listaEn)) : '—'}</Dato>
        <Dato label="Entrega">{o.entregadaEn ? FECHA_HORA.format(new Date(o.entregadaEn)) : '—'}</Dato>
        <Dato label="Duración lavado">{duracion(o.tiempoLavadoSegundos)}</Dato>
        <Dato label="Espera de entrega">{duracion(o.tiempoEsperaEntregaSegundos)}</Dato>
        <Dato label="Lavador">
          {lav1 ?? 'Sin asignar'}
          {lav2 ? ` + ${lav2}` : ''}
        </Dato>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <span className="inline-flex items-center gap-1 rounded-md bg-primary-50 px-2 py-1 font-medium text-primary-700">
          <Sparkles size={12} /> {comboNombre(o.comboId)}
        </span>
        {o.serviciosAdicionales.map((s) => (
          <span
            key={s.servicioId}
            className="inline-flex items-center gap-1 rounded-md bg-neutral-100 px-2 py-1 text-neutral-600"
          >
            + {s.nombre} · {COP.format(s.precio)}
          </span>
        ))}
        {o.altoCilindraje ? (
          <span className="inline-flex items-center gap-1 rounded-md bg-warning-50 px-2 py-1 font-medium text-warning-700">
            <Car size={12} /> Alto cilindraje
          </span>
        ) : null}
      </div>

      <div className="rounded-lg bg-neutral-50 p-3 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-neutral-500">Precio</span>
          <span className="text-neutral-800">{COP.format(o.precio)}</span>
        </div>
        {o.descuento > 0 ? (
          <div className="flex items-center justify-between text-danger-600">
            <span>
              Descuento{o.descuentoPct ? ` (${o.descuentoPct}%)` : ''}
              {o.descuentoMotivo ? ` · ${o.descuentoMotivo}` : ''}
            </span>
            <span>−{COP.format(o.descuento)}</span>
          </div>
        ) : null}
        {productos.map((v) => (
          <div key={v.id} className="flex items-center justify-between text-neutral-600">
            <span>
              {v.cantidad} × {productoNombre(v.productoId)}
            </span>
            <span>{COP.format(v.total)}</span>
          </div>
        ))}
        <div className="mt-1 flex items-center justify-between border-t border-neutral-200 pt-1 font-semibold text-neutral-900">
          <span>Total cobrado</span>
          <span>{COP.format(o.precio - o.descuento + productos.reduce((s, v) => s + v.total, 0))}</span>
        </div>
        <div className="mt-1.5 text-xs text-neutral-500">
          Método:{' '}
          {o.metodoPago ? METODO_PAGO_LABEL[o.metodoPago] : o.estado === 'entregado' ? 'Cortesía' : '—'}
          {o.referenciaPago ? ` · Ref. ${o.referenciaPago}` : ''}
        </div>
        {pagos.length > 1 ? (
          <ul className="mt-1 flex flex-col gap-0.5 text-xs text-neutral-500">
            {pagos.map((p) => (
              <li key={p.id} className="flex items-center justify-between">
                <span>
                  {METODO_PAGO_LABEL[p.metodoPago]}
                  {p.referenciaPago ? ` · ${p.referenciaPago}` : ''}
                  {p.esCorreccion ? ' · corrección' : ''}
                </span>
                <span>{COP.format(p.monto)}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {o.observaciones ? <p className="text-xs text-neutral-500">Obs.: {o.observaciones}</p> : null}

      {o.estado === 'anulada' ? (
        <p className="rounded-lg bg-danger-50 px-3 py-2 text-xs text-danger-700">
          Anulada: {o.motivoAnulacion ?? '—'}
          {o.anuladaPor ? ` · ${o.anuladaPor}` : ''}
          {o.anuladaEn ? ` · ${FECHA_HORA.format(new Date(o.anuladaEn))}` : ''}
        </p>
      ) : null}
    </Card>
  )
}
