import { useEffect, useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { fetchExpedienteLavador, type ExpedienteLavador, type ResumenLavador } from '../../data/expedienteLavador'
import type { Lavador } from '../../schemas/lavador'
import { Card } from './Card'
import { BarChart } from './BarChart'
import { OrdenDetalleCard } from './OrdenDetalleCard'
import { duracion } from '../../lib/ordenFormato'

const COP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })
const FECHA = new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium' })

// Posición de `id` en un ranking de `mapa` según `valor` — `menorEsMejor` para tiempos.
function rankear(
  mapa: Map<string, ResumenLavador>,
  id: string,
  valor: (r: ResumenLavador) => number | null,
  menorEsMejor = false,
): { pos: number; total: number } {
  const items = [...mapa.entries()]
    .map(([k, r]) => ({ k, v: valor(r) }))
    .filter((x) => x.v != null) as { k: string; v: number }[]
  items.sort((a, b) => (menorEsMejor ? a.v - b.v : b.v - a.v))
  const pos = items.findIndex((x) => x.k === id) + 1
  return { pos, total: items.length }
}

function Rank({ pos, total, sufijo }: { pos: number; total: number; sufijo: string }) {
  if (pos === 0) return null
  const tono = pos === 1 ? 'text-success-700' : pos === total ? 'text-danger-600' : 'text-neutral-500'
  return (
    <span className={`text-xs font-medium ${tono}`}>
      #{pos} de {total} en {sufijo}
    </span>
  )
}

interface Props {
  lavador: Lavador
  resumen: Map<string, ResumenLavador>
  comboNombre: (id: string | undefined) => string
  productoNombre: (id: string) => string
  onClose: () => void
}

// Expediente del lavador: produccion, comision (generada / pagada / pendiente), tiempos con
// ranking contra los demas, y asistencia — mas el historial de servicios.
export function LavadorExpedienteModal({ lavador, resumen, comboNombre, productoNombre, onClose }: Props) {
  const [data, setData] = useState<ExpedienteLavador | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    fetchExpedienteLavador(lavador.id)
      .then((d) => vivo && setData(d))
      .catch((e) => vivo && setError(e instanceof Error ? e.message : 'No se pudo cargar el expediente'))
    return () => {
      vivo = false
    }
  }, [lavador.id])

  const rankServicios = useMemo(() => rankear(resumen, lavador.id, (r) => r.servicios), [resumen, lavador.id])
  const rankComision = useMemo(
    () => rankear(resumen, lavador.id, (r) => r.comisionGenerada),
    [resumen, lavador.id],
  )
  const rankTiempo = useMemo(
    () => rankear(resumen, lavador.id, (r) => r.tiempoPromedioSegundos, true),
    [resumen, lavador.id],
  )

  const diasRango = data?.diasRango ?? 60
  const pctAsistencia = data && diasRango > 0 ? Math.round((data.diasTrabajados / diasRango) * 100) : 0

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-neutral-900/40 p-4">
      <div className="my-6 w-full max-w-2xl rounded-2xl bg-white shadow-card-hover">
        <div className="flex items-start justify-between gap-3 border-b border-neutral-100 p-6">
          <div>
            <h2 className="text-lg font-semibold text-neutral-900">{lavador.nombre}</h2>
            <p className="text-sm text-neutral-500">
              Ingresó el {FECHA.format(new Date(`${lavador.fechaIngreso}T00:00:00`))}
              {!lavador.activo ? ' · inactivo' : ''}
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
            {/* KPIs */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Card className="flex flex-col gap-1 p-4">
                <p className="text-xs font-medium text-neutral-500">Servicios</p>
                <p className="text-xl font-semibold text-neutral-900">{data.serviciosReales}</p>
                {data.serviciosAnulados > 0 ? (
                  <p className="text-xs text-neutral-400">+{data.serviciosAnulados} anulados</p>
                ) : null}
                <Rank pos={rankServicios.pos} total={rankServicios.total} sufijo="producción" />
              </Card>
              <Card className="flex flex-col gap-1 p-4">
                <p className="text-xs font-medium text-neutral-500">Comisión generada</p>
                <p className="text-xl font-semibold text-neutral-900">{COP.format(data.comisionGenerada)}</p>
                <Rank pos={rankComision.pos} total={rankComision.total} sufijo="comisión" />
              </Card>
              <Card className="flex flex-col gap-1 p-4">
                <p className="text-xs font-medium text-neutral-500">Comisión pendiente</p>
                <p className="text-xl font-semibold text-warning-700">{COP.format(data.comisionPendiente)}</p>
                <p className="text-xs text-neutral-400">{COP.format(data.comisionPagada)} ya liquidada</p>
              </Card>
              <Card className="flex flex-col gap-1 p-4">
                <p className="text-xs font-medium text-neutral-500">Ticket promedio</p>
                <p className="text-xl font-semibold text-neutral-900">{COP.format(data.ticketPromedio)}</p>
              </Card>
              <Card className="flex flex-col gap-1 p-4">
                <p className="text-xs font-medium text-neutral-500">Tiempo promedio</p>
                <p className="text-xl font-semibold text-neutral-900">
                  {duracion(data.tiempoPromedioGlobalSegundos ?? undefined)}
                </p>
                <Rank pos={rankTiempo.pos} total={rankTiempo.total} sufijo="rapidez" />
              </Card>
              <Card className="flex flex-col gap-1 p-4">
                <p className="text-xs font-medium text-neutral-500">Asistencia ({diasRango} días)</p>
                <p className="text-xl font-semibold text-neutral-900">{pctAsistencia}%</p>
                <p className="text-xs text-neutral-400">
                  {data.diasTrabajados} trabajados · {data.diasDescanso} de descanso
                </p>
              </Card>
            </div>

            {/* Tiempo por combo */}
            {data.tiempoPorCombo.length > 2 ? (
              <Card className="flex flex-col gap-2 p-4">
                <h3 className="text-sm font-semibold text-neutral-900">Tiempo promedio de lavado por combo</h3>
                <BarChart
                  labels={data.tiempoPorCombo.map((t) => `${comboNombre(t.comboId)} (${t.n})`)}
                  data={data.tiempoPorCombo.map((t) => Math.round(t.promedioSegundos / 60))}
                  valueFormatter={(v) => `${v} min`}
                  height={Math.max(140, data.tiempoPorCombo.length * 34)}
                />
              </Card>
            ) : null}

            {/* Historial */}
            <div>
              <h3 className="mb-2 text-sm font-semibold text-neutral-900">
                Historial de servicios ({data.ordenes.length})
              </h3>
              <div className="flex flex-col gap-3">
                {data.ordenes.map((o) => (
                  <OrdenDetalleCard
                    key={o.id}
                    orden={o}
                    pagos={data.pagosPorOrden.get(o.id)}
                    productos={data.productosPorOrden.get(o.id)}
                    comboNombre={comboNombre}
                    lavadorNombre={(id) => (id === lavador.id ? lavador.nombre : id ? '(otro)' : undefined)}
                    productoNombre={productoNombre}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
