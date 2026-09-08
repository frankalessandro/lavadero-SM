import { useEffect, useMemo, useState } from 'react'
import { Car, Mail, MessageCircle, Phone, Sparkles, X } from 'lucide-react'
import { fetchExpedienteCliente, type ExpedienteCliente } from '../../data/clientes'
import { METODO_PAGO_LABEL } from '../../lib/metodoPago'
import type { EstadoOrden } from '../../schemas/orden'
import { Card } from './Card'

const COP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })
const FECHA_HORA = new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short' })
const HORA = new Intl.DateTimeFormat('es-CO', { timeStyle: 'short' })

const ESTADO_LABEL: Record<EstadoOrden, string> = {
  en_proceso: 'En proceso',
  listo: 'Listo',
  entregado: 'Entregado',
  anulada: 'Anulada',
}
const ESTADO_CLASS: Record<EstadoOrden, string> = {
  en_proceso: 'bg-warning-50 text-warning-700',
  listo: 'bg-primary-50 text-primary-700',
  entregado: 'bg-success-50 text-success-700',
  anulada: 'bg-danger-50 text-danger-700',
}

function duracion(segundos?: number): string {
  if (segundos == null) return '—'
  const min = Math.round(segundos / 60)
  if (min < 60) return `${min} min`
  return `${Math.floor(min / 60)} h ${min % 60} min`
}

function Dato({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">{label}</p>
      <p className="text-sm text-neutral-800">{children}</p>
    </div>
  )
}

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
      <div className="my-6 w-full max-w-2xl rounded-2xl bg-white shadow-card-hover">
        <div className="flex items-start justify-between gap-3 border-b border-neutral-100 p-6">
          <div>
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
            <div className="grid grid-cols-2 gap-4 rounded-xl bg-neutral-50 p-4 sm:grid-cols-4">
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
                  <a href={`mailto:${correo}`} className="flex items-center gap-1.5 text-primary-700">
                    <Mail size={14} /> {correo}
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
              {data.ordenes.map((o) => {
                const pagos = data.pagosPorOrden.get(o.id) ?? []
                const productos = data.productosPorOrden.get(o.id) ?? []
                const lav1 = lavadorNombre(o.lavadorId)
                const lav2 = lavadorNombre(o.lavadorId2)
                return (
                  <Card key={o.id} className="flex flex-col gap-3 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-mono text-sm font-semibold text-neutral-900">#{o.consecutivo}</span>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${ESTADO_CLASS[o.estado]}`}>
                        {ESTADO_LABEL[o.estado]}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                      <Dato label="Ingreso">{FECHA_HORA.format(new Date(o.creadoEn))}</Dato>
                      <Dato label="Listo">{o.listaEn ? HORA.format(new Date(o.listaEn)) : '—'}</Dato>
                      <Dato label="Entrega">
                        {o.entregadaEn ? FECHA_HORA.format(new Date(o.entregadaEn)) : '—'}
                      </Dato>
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
                        <span key={s.servicioId} className="inline-flex items-center gap-1 rounded-md bg-neutral-100 px-2 py-1 text-neutral-600">
                          + {s.nombre} · {COP.format(s.precio)}
                        </span>
                      ))}
                      {o.altoCilindraje ? (
                        <span className="inline-flex items-center gap-1 rounded-md bg-warning-50 px-2 py-1 font-medium text-warning-700">
                          <Car size={12} /> Alto cilindraje
                        </span>
                      ) : null}
                    </div>

                    {/* Dinero */}
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
                        <span>
                          {COP.format(
                            o.precio - o.descuento + productos.reduce((s, v) => s + v.total, 0),
                          )}
                        </span>
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

                    {o.observaciones ? (
                      <p className="text-xs text-neutral-500">Obs.: {o.observaciones}</p>
                    ) : null}

                    {o.estado === 'anulada' ? (
                      <p className="rounded-lg bg-danger-50 px-3 py-2 text-xs text-danger-700">
                        Anulada: {o.motivoAnulacion ?? '—'}
                        {o.anuladaPor ? ` · ${o.anuladaPor}` : ''}
                        {o.anuladaEn ? ` · ${FECHA_HORA.format(new Date(o.anuladaEn))}` : ''}
                      </p>
                    ) : null}
                  </Card>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
