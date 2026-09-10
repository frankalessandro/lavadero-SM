import { useEffect, useMemo, useState } from 'react'
import { Mail, MessageCircle, Phone, X } from 'lucide-react'
import { fetchExpedienteCliente, type ExpedienteCliente } from '../../data/clientes'
import { OrdenDetalleCard, Dato } from './OrdenDetalleCard'

const COP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })
const FECHA_HORA = new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short' })

interface Props {
  placa: string
  nombreFallback: string
  tipoNombre: (id: string) => string
  comboNombre: (id: string | undefined) => string
  lavadorNombre: (id: string | undefined) => string | undefined
  productoNombre: (id: string) => string
  onClose: () => void
}

// Expediente del cliente: todo lo que el sistema sabe de una placa — contacto, y cada servicio
// con sus horas, combo, lavador, precio, descuento, desglose del pago y productos comprados.
export function ClienteExpedienteModal({
  placa,
  nombreFallback,
  tipoNombre,
  comboNombre,
  lavadorNombre,
  productoNombre,
  onClose,
}: Props) {
  const [data, setData] = useState<ExpedienteCliente | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    fetchExpedienteCliente(placa)
      .then((d) => {
        if (vivo) setData(d)
      })
      .catch((e) => {
        if (vivo) setError(e instanceof Error ? e.message : 'No se pudo cargar el expediente')
      })
    return () => {
      vivo = false
    }
  }, [placa])

  const resumen = useMemo(() => {
    if (!data) return null
    const reales = data.ordenes.filter((o) => o.estado !== 'anulada')
    const entregadas = reales.filter((o) => o.estado === 'entregado')
    const rep = data.ordenes[0] // más reciente
    return {
      rep,
      totalServicios: reales.length,
      anuladas: data.ordenes.length - reales.length,
      gastado: entregadas.reduce((s, o) => s + o.precio - o.descuento, 0),
      primera: reales.length ? reales[reales.length - 1].creadoEn : undefined,
      ultima: reales.length ? reales[0].creadoEn : undefined,
    }
  }, [data])

  const telefono = resumen?.rep?.clienteTelefono
  const correo = resumen?.rep?.clienteCorreo

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-neutral-900/40 p-4">
      <div className="my-6 w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-card-hover">
        <div className="flex items-start justify-between gap-3 border-b border-neutral-100 p-6">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-neutral-900">
              {resumen?.rep?.clienteNombre || nombreFallback}
            </h2>
            <p className="font-mono text-sm text-neutral-500">{placa}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex size-8 shrink-0 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-neutral-100"
          >
            <X size={18} />
          </button>
        </div>

        {error ? (
          <p className="p-6 text-sm text-danger-600">{error}</p>
        ) : !data ? (
          <p className="p-6 text-sm text-neutral-400">Cargando…</p>
        ) : (
          <div className="flex flex-col gap-4 p-6">
            {/* Cabecera de contacto + números */}
            <div className="grid grid-cols-1 gap-4 rounded-xl bg-neutral-50 p-4 sm:grid-cols-4">
              <Dato label="Teléfono">
                {telefono ? (
                  <span className="flex items-center gap-1.5">
                    {telefono}
                    <a
                      href={`https://wa.me/${(telefono.replace(/\D/g, '').length === 10 ? '57' : '') + telefono.replace(/\D/g, '')}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-success-600"
                      title="WhatsApp"
                    >
                      <MessageCircle size={14} />
                    </a>
                    <a href={`tel:${telefono.replace(/\s+/g, '')}`} className="text-primary-600" title="Llamar">
                      <Phone size={14} />
                    </a>
                  </span>
                ) : (
                  '—'
                )}
              </Dato>
              <Dato label="Correo">
                {correo ? (
                  <a href={`mailto:${correo}`} className="flex items-center gap-1.5 break-all text-primary-700">
                    <Mail size={14} className="shrink-0" /> {correo}
                  </a>
                ) : (
                  '—'
                )}
              </Dato>
              <Dato label="Vehículo">{tipoNombre(resumen?.rep?.tipoVehiculoId ?? '')}</Dato>
              <Dato label="Servicios">
                {resumen?.totalServicios}
                {resumen && resumen.anuladas > 0 ? (
                  <span className="text-xs text-neutral-400"> (+{resumen.anuladas} anulada{resumen.anuladas === 1 ? '' : 's'})</span>
                ) : null}
              </Dato>
              <Dato label="Total gastado">{COP.format(resumen?.gastado ?? 0)}</Dato>
              <Dato label="Primera visita">
                {resumen?.primera ? FECHA_HORA.format(new Date(resumen.primera)) : '—'}
              </Dato>
              <Dato label="Última visita">
                {resumen?.ultima ? FECHA_HORA.format(new Date(resumen.ultima)) : '—'}
              </Dato>
            </div>

            {/* Un bloque por servicio */}
            <div className="flex flex-col gap-3">
              {data.ordenes.map((o) => (
                <OrdenDetalleCard
                  key={o.id}
                  orden={o}
                  pagos={data.pagosPorOrden.get(o.id)}
                  productos={data.productosPorOrden.get(o.id)}
                  comboNombre={comboNombre}
                  lavadorNombre={lavadorNombre}
                  productoNombre={productoNombre}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
