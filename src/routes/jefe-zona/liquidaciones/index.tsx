import { useMemo, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Coins, Receipt } from 'lucide-react'
import { fetchOrdenesHoy } from '../../../data/ordenes'
import { fetchLavadores } from '../../../data/lavadores'
import { fetchCombos } from '../../../data/combos'
import { fetchTiposVehiculo } from '../../../data/tiposVehiculo'
import type { Orden } from '../../../schemas/orden'
import { Card } from '../../../components/layout/Card'
import { CustomSelect } from '../../../components/layout/CustomSelect'
import { ReciboModal, type ReciboData } from '../../../components/layout/ReciboModal'

const COP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })

async function loadLiquidaciones() {
  const [ordenesHoy, lavadores, combos, tiposVehiculo] = await Promise.all([
    fetchOrdenesHoy(),
    fetchLavadores(),
    fetchCombos(),
    fetchTiposVehiculo(),
  ])
  return { ordenesHoy, lavadores, combos, tiposVehiculo }
}

export const Route = createFileRoute('/jefe-zona/liquidaciones/')({
  loader: loadLiquidaciones,
  component: LiquidacionesJefeZona,
})

function LiquidacionesJefeZona() {
  const data = Route.useLoaderData()
  const [lavadores] = useState(data.lavadores)
  const [combos] = useState(data.combos)
  const [tiposVehiculo] = useState(data.tiposVehiculo)
  const [ordenesHoy] = useState(data.ordenesHoy)
  const [lavadorFiltro, setLavadorFiltro] = useState<string>('todos')
  const [recibo, setRecibo] = useState<ReciboData | null>(null)

  const lavadorNombre = (id: string) => lavadores.find((l) => l.id === id)?.nombre ?? '—'
  const comboNombre = (id: string | undefined) => (id ? combos.find((c) => c.id === id)?.nombre : undefined) ?? 'Sin combo'
  const tipoNombre = (id: string) => tiposVehiculo.find((t) => t.id === id)?.nombre ?? '—'

  // Solo suma a la liquidación lo pagado Y despachado — es decir, estado 'entregado' (M3:
  // cobrarYEntregarOrden marca ambas cosas en el mismo paso). Un vehículo listo pero sin cobrar
  // todavía NO cuenta, aunque el lavado ya esté terminado.
  const entregadasHoy = useMemo(() => ordenesHoy.filter((o) => o.estado === 'entregado'), [ordenesHoy])

  const filtradas = useMemo(
    () => entregadasHoy.filter((o) => lavadorFiltro === 'todos' || o.lavadorId === lavadorFiltro),
    [entregadasHoy, lavadorFiltro],
  )

  // El resumen "por lavador" siempre se calcula sobre todo el día (sin aplicar el filtro) — si
  // no, al filtrar por un lavador el resto de tarjetas desaparecería sin sentido; en vez de eso
  // se atenúan las que no coinciden con el filtro (ver className abajo).
  const porLavador = useMemo(() => {
    const mapa = new Map<string, { cantidad: number; monto: number }>()
    for (const orden of entregadasHoy) {
      const actual = mapa.get(orden.lavadorId) ?? { cantidad: 0, monto: 0 }
      actual.cantidad += 1
      actual.monto += orden.comisionLavador
      mapa.set(orden.lavadorId, actual)
    }
    return Array.from(mapa.entries())
      .map(([lavadorId, v]) => ({ lavadorId, lavadorNombre: lavadorNombre(lavadorId), ...v }))
      .sort((a, b) => b.monto - a.monto)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entregadasHoy])

  const ordenadas = [...filtradas].sort((a, b) => b.consecutivo - a.consecutivo)

  function abrirTiquete(orden: Orden) {
    setRecibo({
      consecutivo: orden.consecutivo,
      placa: orden.placa,
      clienteNombre: orden.clienteNombre,
      comboNombre: comboNombre(orden.comboId),
      serviciosAdicionales: orden.serviciosAdicionales.map((s) => s.nombre),
      tipoNombre: tipoNombre(orden.tipoVehiculoId),
      lavadorNombre: lavadorNombre(orden.lavadorId),
      precio: orden.precio,
      fecha: orden.entregadaEn ?? orden.creadoEn,
      metodoPago: orden.metodoPago,
      referenciaPago: orden.referenciaPago,
    })
  }

  return (
    <div className="flex flex-col gap-6 text-left">
      <div>
        <h2 className="text-base font-semibold text-neutral-900">Liquidaciones</h2>
        <p className="text-sm text-neutral-500">
          Vista informativa de hoy — no es la liquidación real (esa sigue siendo semanal desde Admin, regla de
          negocio 4). Solo suma un vehículo cuando ya fue pagado y despachado (entregado); listo pero sin cobrar
          todavía no cuenta.
        </p>
      </div>

      <div className="w-full sm:w-64">
        <CustomSelect
          size="sm"
          value={lavadorFiltro}
          onChange={setLavadorFiltro}
          placeholder="Todos los lavadores"
          options={[{ value: 'todos', label: 'Todos los lavadores' }, ...lavadores.map((l) => ({ value: l.id, label: l.nombre }))]}
        />
      </div>

      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold text-neutral-900">Ganado hoy por lavador</h3>
        {porLavador.length === 0 ? (
          <Card className="py-8 text-center text-sm text-neutral-400">
            Todavía no hay vehículos pagados y despachados hoy.
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {porLavador.map((p) => (
              <Card
                key={p.lavadorId}
                className={`flex flex-col gap-3 ${lavadorFiltro !== 'todos' && lavadorFiltro !== p.lavadorId ? 'opacity-40' : ''}`}
              >
                <div className="flex items-center gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-600">
                    <Coins size={18} strokeWidth={2} />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-neutral-900">{p.lavadorNombre}</p>
                    <p className="text-xs text-neutral-500">
                      {p.cantidad} vehículo{p.cantidad === 1 ? '' : 's'}
                    </p>
                  </div>
                </div>
                <p className="text-xl font-semibold text-neutral-900">{COP.format(p.monto)}</p>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold text-neutral-900">Vehículos atendidos hoy ({ordenadas.length})</h3>
        <Card className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-200 text-left text-xs font-medium uppercase tracking-wide text-neutral-500">
                  <th className="px-5 py-3">#</th>
                  <th className="px-5 py-3">Placa</th>
                  <th className="px-5 py-3">Cliente</th>
                  <th className="px-5 py-3">Tipo</th>
                  <th className="px-5 py-3">Combo</th>
                  <th className="px-5 py-3">Lavador</th>
                  <th className="px-5 py-3">Precio</th>
                  <th className="px-5 py-3">Comisión lavador</th>
                  <th className="px-5 py-3">Pago</th>
                  <th className="px-5 py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {ordenadas.map((orden) => (
                  <tr key={orden.id} className="border-b border-neutral-100 transition-colors last:border-0 hover:bg-primary-50/40">
                    <td className="px-5 py-3 text-neutral-500">#{orden.consecutivo}</td>
                    <td className="px-5 py-3 font-mono font-medium text-neutral-900">{orden.placa}</td>
                    <td className="px-5 py-3 text-neutral-700">{orden.clienteNombre}</td>
                    <td className="px-5 py-3 text-neutral-700">{tipoNombre(orden.tipoVehiculoId)}</td>
                    <td className="px-5 py-3 text-neutral-700">{comboNombre(orden.comboId)}</td>
                    <td className="px-5 py-3 text-neutral-700">{lavadorNombre(orden.lavadorId)}</td>
                    <td className="px-5 py-3 font-medium text-neutral-900">{COP.format(orden.precio)}</td>
                    <td className="px-5 py-3 text-success-700">{COP.format(orden.comisionLavador)}</td>
                    <td className="px-5 py-3 capitalize text-neutral-700">{orden.metodoPago ?? '—'}</td>
                    <td className="px-5 py-3">
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={() => abrirTiquete(orden)}
                          className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-neutral-600 transition-colors hover:bg-primary-100 hover:text-primary-700"
                        >
                          <Receipt size={14} />
                          Ver tiquete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {ordenadas.length === 0 ? (
                  <tr>
                    <td className="px-5 py-8 text-center text-neutral-400" colSpan={10}>
                      Todavía no hay vehículos pagados y despachados hoy.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </Card>
      </section>

      {recibo ? (
        <ReciboModal recibo={recibo} variant={recibo.metodoPago ? 'pago' : 'ingreso'} onClose={() => setRecibo(null)} />
      ) : null}
    </div>
  )
}
