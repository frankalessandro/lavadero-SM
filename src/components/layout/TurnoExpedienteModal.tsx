import { useEffect, useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { fetchExpedienteTurno, type ExpedienteTurno } from '../../data/expedienteTurno'
import { METODO_PAGO_LABEL } from '../../lib/metodoPago'
import type { TurnoCaja } from '../../schemas/turnoCaja'
import { Card } from './Card'
import { OrdenDetalleCard } from './OrdenDetalleCard'

const COP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })
const FECHA_HORA = new Intl.DateTimeFormat('es-CO', { dateStyle: 'short', timeStyle: 'short' })

interface Props {
  turno: TurnoCaja
  comboNombre: (id: string | undefined) => string
  lavadorNombre: (id: string | undefined) => string | undefined
  productoNombre: (id: string) => string
  onClose: () => void
}

// Expediente del turno: reconstruye el arqueo linea por linea, el reparto de pagos por metodo,
// los conteos de inventario, y lista ordenes/ventas/gastos/traspasos del turno.
export function TurnoExpedienteModal({ turno, comboNombre, lavadorNombre, productoNombre, onClose }: Props) {
  const [data, setData] = useState<ExpedienteTurno | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    fetchExpedienteTurno(turno)
      .then((d) => vivo && setData(d))
      .catch((e) => vivo && setError(e instanceof Error ? e.message : 'No se pudo cargar el expediente'))
    return () => {
      vivo = false
    }
  }, [turno])

  const porMetodo = useMemo(() => {
    const m = { efectivo: 0, transferencia: 0, datafono: 0 }
    for (const p of data?.pagos ?? []) {
      if (p.anulado) continue
      m[p.metodoPago] += p.monto
    }
    return m
  }, [data])

  const cierreDif = turno.diferencia ?? 0

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-neutral-900/40 p-4">
      <div className="my-6 w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-card-hover">
        <div className="flex items-start justify-between gap-3 border-b border-neutral-100 p-6">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-neutral-900">
              Turno {turno.rol === 'jefe_zona' ? 'jefe de zona' : 'vigilante'} · {turno.responsable}
            </h2>
            <p className="text-sm text-neutral-500">
              {FECHA_HORA.format(new Date(turno.abiertoEn))} →{' '}
              {turno.cerrado && turno.cerradoEn ? FECHA_HORA.format(new Date(turno.cerradoEn)) : 'abierto'}
            </p>
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
            {/* Reconstrucción del arqueo */}
            <Card className="flex flex-col gap-2 p-4">
              <h3 className="text-sm font-semibold text-neutral-900">Arqueo del turno</h3>
              {data.desglose ? (
                <div className="flex flex-col gap-1 text-sm">
                  <Linea label="Base inicial" valor={data.desglose.base} />
                  <Linea label="+ Lavados en efectivo" valor={data.desglose.ingresosLavados} />
                  <Linea label="+ Ventas de productos en efectivo" valor={data.desglose.ingresosVentas} />
                  <Linea label="− Gastos de caja" valor={-data.desglose.gastos} />
                  <div className="mt-1 flex items-center justify-between border-t border-neutral-200 pt-1 font-semibold">
                    <span>Esperado</span>
                    <span>{COP.format(turno.cerrado ? (turno.valorEsperado ?? 0) : data.desglose.total)}</span>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-neutral-400">Sin datos suficientes para el desglose.</p>
              )}
              {turno.cerrado ? (
                <div
                  className={`mt-1 flex items-center justify-between rounded-lg px-3 py-2 text-sm ${
                    cierreDif === 0
                      ? 'bg-success-50 text-success-700'
                      : cierreDif < 0
                        ? 'bg-danger-50 text-danger-700'
                        : 'bg-warning-50 text-warning-700'
                  }`}
                >
                  <span>
                    Conteo físico {COP.format(turno.conteoFisico ?? 0)} · diferencia
                  </span>
                  <span className="font-semibold">{COP.format(cierreDif)}</span>
                </div>
              ) : null}
              {turno.justificacionDiferencia ? (
                <p className="text-xs text-neutral-500">Justificación: {turno.justificacionDiferencia}</p>
              ) : null}
              {turno.cerrado ? (
                <p className="text-xs text-neutral-400">
                  Cerró: {turno.cerradoPor ?? '—'}
                  {turno.recibidoPor ? ` · Recibió: ${turno.recibidoPor}` : ''}
                </p>
              ) : null}
            </Card>

            {/* Pagos por método */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {(['efectivo', 'transferencia', 'datafono'] as const).map((m) => (
                <Card key={m} className="flex flex-col gap-0.5 p-4">
                  <p className="text-xs font-medium text-neutral-500">{METODO_PAGO_LABEL[m]}</p>
                  <p className="text-lg font-semibold text-neutral-900">{COP.format(porMetodo[m])}</p>
                </Card>
              ))}
            </div>

            {/* Conteos de inventario */}
            {[data.conteoApertura, data.conteoCierre].map((c, i) =>
              c ? (
                <Card key={i} className="flex flex-col gap-2 p-4">
                  <h3 className="text-sm font-semibold text-neutral-900">
                    Conteo de inventario — {c.conteo.momento === 'apertura' ? 'apertura' : 'cierre'}
                  </h3>
                  {c.lineas.filter((l) => l.diferencia !== 0).length === 0 ? (
                    <p className="text-xs text-success-700">Todo cuadró.</p>
                  ) : (
                    <ul className="flex flex-col gap-1 text-xs">
                      {c.lineas
                        .filter((l) => l.diferencia !== 0)
                        .map((l) => (
                          <li key={l.id} className="flex items-center justify-between gap-3">
                            <span>
                              {l.productoNombre}: esperado {l.esperado}, contado {l.contado}
                            </span>
                            <span
                              className={l.diferencia < 0 ? 'font-medium text-danger-600' : 'font-medium text-warning-700'}
                            >
                              {l.diferencia > 0 ? `+${l.diferencia}` : l.diferencia}
                              {l.valorDiferencia > 0 ? ` · ${COP.format(l.valorDiferencia)}` : ''}
                            </span>
                          </li>
                        ))}
                    </ul>
                  )}
                  {c.conteo.justificacion ? (
                    <p className="text-xs text-neutral-500">Justificación: {c.conteo.justificacion}</p>
                  ) : null}
                </Card>
              ) : null,
            )}

            {/* Traspasos */}
            {data.traspasos.length > 0 ? (
              <Card className="flex flex-col gap-1 p-4 text-xs text-neutral-600">
                <h3 className="text-sm font-semibold text-neutral-900">Traspasos de responsabilidad</h3>
                {data.traspasos.map((t) => (
                  <p key={t.id}>
                    {t.de} → {t.a} · {FECHA_HORA.format(new Date(t.hechoEn))}
                  </p>
                ))}
              </Card>
            ) : null}

            {/* Gastos */}
            {data.gastos.length > 0 ? (
              <Card className="flex flex-col gap-1 p-4">
                <h3 className="mb-1 text-sm font-semibold text-neutral-900">Gastos de caja ({data.gastos.length})</h3>
                {data.gastos.map((g) => (
                  <div key={g.id} className="flex items-center justify-between gap-3 text-sm text-neutral-700">
                    <span>
                      {g.categoriaNombre} · {g.descripcion}
                      <span className="text-xs text-neutral-400"> · {g.responsable}</span>
                    </span>
                    <span className="font-medium">−{COP.format(g.monto)}</span>
                  </div>
                ))}
              </Card>
            ) : null}

            {/* Ventas de nevera */}
            {data.ventas.length > 0 ? (
              <Card className="flex flex-col gap-1 p-4">
                <h3 className="mb-1 text-sm font-semibold text-neutral-900">Ventas de nevera ({data.ventas.length})</h3>
                {data.ventas.map((v) => (
                  <div key={v.id} className="flex items-center justify-between gap-3 text-sm text-neutral-700">
                    <span>
                      #{v.consecutivo} · {v.cantidad} × {productoNombre(v.productoId)}
                      {v.estado === 'anulada' ? <span className="text-danger-600"> · anulada</span> : ''}
                    </span>
                    <span className="font-medium">{COP.format(v.total)}</span>
                  </div>
                ))}
              </Card>
            ) : null}

            {/* Órdenes del turno */}
            <div>
              <h3 className="mb-2 text-sm font-semibold text-neutral-900">
                Órdenes cobradas en el turno ({data.ordenes.length})
              </h3>
              <div className="flex flex-col gap-3">
                {data.ordenes.map((o) => (
                  <OrdenDetalleCard
                    key={o.id}
                    orden={o}
                    pagos={data.pagosPorOrden.get(o.id)}
                    comboNombre={comboNombre}
                    lavadorNombre={lavadorNombre}
                    productoNombre={productoNombre}
                  />
                ))}
                {data.ordenes.length === 0 ? (
                  <p className="text-sm text-neutral-400">Ninguna orden se cobró en este turno.</p>
                ) : null}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function Linea({ label, valor }: { label: string; valor: number }) {
  return (
    <div className="flex items-center justify-between text-neutral-600">
      <span>{label}</span>
      <span className="text-neutral-900">{COP.format(valor)}</span>
    </div>
  )
}
