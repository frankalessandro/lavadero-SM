import { useEffect, useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { fetchMovimientos } from '../../data/movimientosInventario'
import { fetchVentasDeProducto } from '../../data/ventas'
import type { StockProducto } from '../../data/movimientosInventario'
import type { MovimientoInventario } from '../../schemas/movimientoInventario'
import type { Venta } from '../../schemas/venta'
import type { Producto } from '../../schemas/producto'
import { Card } from './Card'
import { BarChart } from './BarChart'

const COP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })
const FECHA = new Intl.DateTimeFormat('es-CO', { dateStyle: 'short' })
const TIPO_LABEL: Record<MovimientoInventario['tipo'], string> = {
  entrada: 'Entrada',
  salida: 'Salida',
  ajuste: 'Ajuste',
}

interface Props {
  producto: Producto
  stock?: StockProducto
  onClose: () => void
}

function mesLabel(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

// Expediente del producto: stock, rotación, margen, unidades vendidas por mes y el historial de
// movimientos.
export function ProductoExpedienteModal({ producto, stock, onClose }: Props) {
  const [movs, setMovs] = useState<MovimientoInventario[] | null>(null)
  const [ventas, setVentas] = useState<Venta[]>([])
  const [ahora] = useState(() => Date.now())

  useEffect(() => {
    let vivo = true
    Promise.all([fetchMovimientos(producto.id), fetchVentasDeProducto(producto.id)])
      .then(([m, v]) => {
        if (!vivo) return
        setMovs(m)
        setVentas(v)
      })
      .catch(() => vivo && setMovs([]))
    return () => {
      vivo = false
    }
  }, [producto.id])

  const stockActual = stock?.stock ?? 0
  const costoRef = producto.costo ?? stock?.costoPromedio ?? 0
  const margen = producto.precioVenta != null ? producto.precioVenta - costoRef : null

  const porMes = useMemo(() => {
    const m = new Map<string, number>()
    for (const v of ventas) m.set(mesLabel(v.creadoEn), (m.get(mesLabel(v.creadoEn)) ?? 0) + v.cantidad)
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [ventas])

  // Rotación: días de stock al ritmo de los últimos 30 días.
  const hace30 = ahora - 30 * 86_400_000
  const unidades30 = ventas.filter((v) => new Date(v.creadoEn).getTime() >= hace30).reduce((s, v) => s + v.cantidad, 0)
  const ritmoDiario = unidades30 / 30
  const diasDeStock = ritmoDiario > 0 ? Math.round(stockActual / ritmoDiario) : null

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-neutral-900/40 p-4">
      <div className="my-6 w-full max-w-xl rounded-2xl bg-white shadow-card-hover">
        <div className="flex items-start justify-between gap-3 border-b border-neutral-100 p-6">
          <div>
            <h2 className="text-lg font-semibold text-neutral-900">{producto.nombre}</h2>
            <p className="text-sm text-neutral-500">
              {producto.unidadMedida} · stock mínimo {producto.stockMinimo}
              {!producto.activo ? ' · inactivo' : ''}
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

        <div className="flex flex-col gap-4 p-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Card className="flex flex-col gap-0.5 p-3">
              <p className="text-xs font-medium text-neutral-500">Stock actual</p>
              <p className={`text-lg font-semibold ${stockActual < producto.stockMinimo ? 'text-danger-600' : 'text-neutral-900'}`}>
                {stockActual}
              </p>
            </Card>
            <Card className="flex flex-col gap-0.5 p-3">
              <p className="text-xs font-medium text-neutral-500">Valorización</p>
              <p className="text-lg font-semibold text-neutral-900">{COP.format(stock?.valorizacion ?? 0)}</p>
            </Card>
            <Card className="flex flex-col gap-0.5 p-3">
              <p className="text-xs font-medium text-neutral-500">Margen unitario</p>
              <p className="text-lg font-semibold text-neutral-900">{margen != null ? COP.format(margen) : '—'}</p>
              <p className="text-xs text-neutral-400">costo {COP.format(costoRef)}</p>
            </Card>
            <Card className="flex flex-col gap-0.5 p-3">
              <p className="text-xs font-medium text-neutral-500">Días de stock</p>
              <p className="text-lg font-semibold text-neutral-900">{diasDeStock != null ? diasDeStock : '—'}</p>
              <p className="text-xs text-neutral-400">{unidades30} vend. en 30 días</p>
            </Card>
          </div>

          {porMes.length > 2 ? (
            <Card className="flex flex-col gap-2 p-4">
              <h3 className="text-sm font-semibold text-neutral-900">Unidades vendidas por mes</h3>
              <BarChart
                horizontal={false}
                labels={porMes.map(([m]) => m)}
                data={porMes.map(([, n]) => n)}
                valueFormatter={(v) => `${v} u`}
                height={180}
              />
            </Card>
          ) : null}

          <div>
            <h3 className="mb-2 text-sm font-semibold text-neutral-900">
              Movimientos ({movs?.length ?? '…'})
            </h3>
            {!movs ? (
              <p className="text-sm text-neutral-400">Cargando…</p>
            ) : (
              <Card className="overflow-x-auto p-0">
                <table className="w-full min-w-[34rem] text-sm">
                  <thead>
                    <tr className="border-b border-neutral-100 text-left text-xs font-medium text-neutral-500">
                      <th className="px-4 py-2">Fecha</th>
                      <th className="px-4 py-2">Tipo</th>
                      <th className="px-4 py-2 text-right">Cantidad</th>
                      <th className="px-4 py-2">Motivo</th>
                      <th className="px-4 py-2">Responsable</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movs.slice(0, 40).map((m) => (
                      <tr key={m.id} className="border-b border-neutral-50 last:border-0">
                        <td className="px-4 py-2 text-neutral-600">{FECHA.format(new Date(m.creadoEn))}</td>
                        <td className="px-4 py-2 text-neutral-700">{TIPO_LABEL[m.tipo]}</td>
                        <td
                          className={`px-4 py-2 text-right font-medium ${
                            m.cantidad < 0 ? 'text-danger-600' : 'text-success-700'
                          }`}
                        >
                          {m.cantidad > 0 ? `+${m.cantidad}` : m.cantidad}
                        </td>
                        <td className="px-4 py-2 text-neutral-500">{m.motivo || '—'}</td>
                        <td className="px-4 py-2 text-neutral-500">{m.responsable}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
