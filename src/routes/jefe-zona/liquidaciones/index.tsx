import { useMemo, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Coins, Receipt } from 'lucide-react'
import { fetchOrdenesEnRango } from '../../../data/ordenes'
import { fetchLavadores } from '../../../data/lavadores'
import { fetchCombos } from '../../../data/combos'
import { fetchTiposVehiculo } from '../../../data/tiposVehiculo'
import { comisionParaLavador, fetchMontoPeriodo } from '../../../data/liquidaciones'
import { fetchDeudaPendientePorLavador } from '../../../data/deudasPersonal'
import type { Orden } from '../../../schemas/orden'
import { Card } from '../../../components/layout/Card'
import { CustomSelect } from '../../../components/layout/CustomSelect'
import { PeriodoSelector } from '../../../components/layout/PeriodoSelector'
import { ReciboModal, type ReciboData } from '../../../components/layout/ReciboModal'
import { ColillaLiquidacionModal, type ColillaLiquidacionData } from '../../../components/layout/ColillaLiquidacionModal'
import { calcularRango, rangoAISO, type ModoPeriodo } from '../../../lib/periodo'
import { queryKeys } from '../../../lib/queryKeys'
import { toast } from '../../../lib/toast'

const COP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })
const FECHA_HORA = new Intl.DateTimeFormat('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

// Texto del botón de colilla según el filtro de periodo: "Colilla del día", etc.
const COLILLA_DE: Record<ModoPeriodo, string> = { dia: 'del día', semana: 'de la semana', mes: 'del mes' }

const ESTADO_LABEL: Record<Orden['estado'], string> = {
  en_proceso: 'En proceso',
  listo: 'Listo',
  entregado: 'Entregado',
  anulada: 'Anulada',
}

const ESTADO_CLASSNAME: Record<Orden['estado'], string> = {
  en_proceso: 'bg-warning-50 text-warning-700',
  listo: 'bg-primary-50 text-primary-700',
  entregado: 'bg-success-50 text-success-700',
  anulada: 'bg-danger-50 text-danger-700',
}

async function loadLiquidaciones() {
  const [lavadores, combos, tiposVehiculo, deudaPorLavador] = await Promise.all([
    fetchLavadores(),
    fetchCombos(),
    fetchTiposVehiculo(),
    fetchDeudaPendientePorLavador(),
  ])
  return { lavadores, combos, tiposVehiculo, deudaPorLavador }
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
  const [deudaPorLavador] = useState(data.deudaPorLavador)
  const [modo, setModo] = useState<ModoPeriodo>('dia')
  const [ancla, setAncla] = useState(() => new Date())
  const rango = calcularRango(modo, ancla)
  const [lavadorFiltro, setLavadorFiltro] = useState<string>('todos')
  const [recibo, setRecibo] = useState<ReciboData | null>(null)
  // Colilla informativa del periodo que muestra el filtro de arriba (día, semana o mes) — no marca
  // ninguna orden ni crea liquidación. El pago real sigue siendo semanal desde Admin (regla de
  // negocio 4); esto es solo para que el jefe de patio le muestre a un lavador cómo va.
  const [colilla, setColilla] = useState<ColillaLiquidacionData | null>(null)
  const [cargandoColilla, setCargandoColilla] = useState<string | null>(null)

  const ordenesQuery = useQuery({
    queryKey: queryKeys.ordenesRango(rango.periodoInicio, rango.periodoFin),
    queryFn: () => {
      const { desdeISO, hastaISO } = rangoAISO(rango)
      return fetchOrdenesEnRango(desdeISO, hastaISO)
    },
    staleTime: 30_000,
  })
  const ordenesRango = ordenesQuery.data

  const lavadorNombre = (id: string | undefined) => (id ? lavadores.find((l) => l.id === id)?.nombre : undefined) ?? 'Sin asignar'
  const comboNombre = (id: string | undefined) => (id ? combos.find((c) => c.id === id)?.nombre : undefined) ?? 'Sin combo'
  const tipoNombre = (id: string) => tiposVehiculo.find((t) => t.id === id)?.nombre ?? '—'

  // Cuenta cada vehículo DESDE QUE SE ASIGNA al lavador — en proceso, listo o entregado, cobrado o
  // no (la comisión ya queda fija al crear la orden, no depende de que el cliente pague). Solo las
  // anuladas quedan fuera. Es el mismo criterio de la colilla de gerencia y de fetchMontoPeriodo.
  const vigentes = useMemo(() => (ordenesRango ?? []).filter((o) => o.estado !== 'anulada'), [ordenesRango])

  const filtradas = useMemo(
    () =>
      vigentes.filter(
        (o) => lavadorFiltro === 'todos' || o.lavadorId === lavadorFiltro || o.lavadorId2 === lavadorFiltro,
      ),
    [vigentes, lavadorFiltro],
  )

  // El resumen "por lavador" siempre se calcula sobre todo el día (sin aplicar el filtro) — si no,
  // al filtrar por un lavador el resto de tarjetas desaparecería sin sentido; en vez de eso se
  // atenúan las que no coinciden con el filtro. Solo suma lo que sigue SIN liquidar, que es lo que
  // también muestra la colilla; lo ya liquidado se cuenta aparte.
  const porLavador = useMemo(() => {
    const mapa = new Map<string, { cantidad: number; monto: number; sinCobrar: number; yaLiquidadas: number }>()
    function sumar(lavadorId: string, orden: Orden, liquidada: boolean) {
      const actual = mapa.get(lavadorId) ?? { cantidad: 0, monto: 0, sinCobrar: 0, yaLiquidadas: 0 }
      if (liquidada) {
        actual.yaLiquidadas += 1
      } else {
        actual.cantidad += 1
        actual.monto += comisionParaLavador(orden, lavadorId)
        if (orden.estado !== 'entregado') actual.sinCobrar += 1
      }
      mapa.set(lavadorId, actual)
    }
    for (const orden of vigentes) {
      if (orden.lavadorId) sumar(orden.lavadorId, orden, orden.liquidacionId !== undefined)
      if (orden.lavadorId2) sumar(orden.lavadorId2, orden, orden.liquidacionId2 !== undefined)
    }
    return Array.from(mapa.entries())
      .map(([lavadorId, v]) => ({ lavadorId, nombre: lavadores.find((l) => l.id === lavadorId)?.nombre ?? '—', ...v }))
      .filter((p) => p.cantidad > 0)
      .sort((a, b) => b.monto - a.monto)
  }, [vigentes, lavadores])

  const ordenadas = [...filtradas].sort((a, b) => b.consecutivo - a.consecutivo)
  const sinAsignar = vigentes.filter((o) => !o.lavadorId).length

  async function handleVerColilla(lavadorId: string) {
    setCargandoColilla(lavadorId)
    try {
      const preview = await fetchMontoPeriodo(lavadorId, rango.periodoInicio, rango.periodoFin, tiposVehiculo, combos)
      if (preview.cantidadOrdenes === 0) {
        toast.advertencia(`${lavadorNombre(lavadorId)} no tiene órdenes sin liquidar en ${rango.label}.`)
        return
      }
      setColilla({
        lavadorNombre: lavadorNombre(lavadorId),
        periodoInicio: rango.periodoInicio,
        periodoFin: rango.periodoFin,
        desglose: preview.desglose,
        monto: preview.monto,
        generadaEn: new Date().toISOString(),
        tipo: 'informativo',
        alcance: modo,
        deudaPendiente: preview.deudaPendiente,
        montoNeto: preview.montoNeto,
      })
    } catch (err) {
      toast.desdeError(err, 'No se pudo calcular la colilla')
    } finally {
      setCargandoColilla(null)
    }
  }

  function abrirTiquete(orden: Orden) {
    setRecibo({
      consecutivo: orden.consecutivo,
      placa: orden.placa,
      clienteNombre: orden.clienteNombre,
      comboNombre: comboNombre(orden.comboId),
      serviciosAdicionales: orden.serviciosAdicionales.map((s) => s.nombre),
      tipoNombre: tipoNombre(orden.tipoVehiculoId),
      lavadorNombre: lavadorNombre(orden.lavadorId),
      lavadorNombre2: orden.lavadorId2 ? lavadorNombre(orden.lavadorId2) : undefined,
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
          Colilla informativa por día — no es la liquidación real (esa sigue siendo semanal desde Admin, regla de
          negocio 4). Cada vehículo cuenta desde que se le asigna al lavador, aunque todavía no se haya cobrado.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <PeriodoSelector modo={modo} onModoChange={setModo} ancla={ancla} onAnclaChange={setAncla} rango={rango} />
        <div className="w-full sm:w-64">
          <CustomSelect
            size="sm"
            value={lavadorFiltro}
            onChange={setLavadorFiltro}
            placeholder="Todos los lavadores"
            options={[{ value: 'todos', label: 'Todos los lavadores' }, ...lavadores.map((l) => ({ value: l.id, label: l.nombre }))]}
          />
        </div>
      </div>

      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold text-neutral-900">Ganado por lavador · {rango.label}</h3>
        {ordenesQuery.isPending ? (
          <Card className="py-8 text-center text-sm text-neutral-400">Cargando…</Card>
        ) : ordenesQuery.isError ? (
          <Card className="py-8 text-center text-sm text-danger-700">No se pudieron cargar las órdenes de este periodo.</Card>
        ) : porLavador.length === 0 ? (
          <Card className="py-8 text-center text-sm text-neutral-400">
            No hay vehículos asignados a lavadores sin liquidar en {rango.label}.
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
                    <p className="truncate text-sm font-semibold text-neutral-900">{p.nombre}</p>
                    <p className="text-xs text-neutral-500">
                      {p.cantidad} vehículo{p.cantidad === 1 ? '' : 's'}
                      {p.sinCobrar > 0 ? ` · ${p.sinCobrar} sin cobrar aún` : ''}
                    </p>
                  </div>
                </div>
                <p className="text-xl font-semibold text-neutral-900">{COP.format(p.monto)}</p>
                {p.yaLiquidadas > 0 ? (
                  <p className="-mt-1 text-xs text-neutral-400">
                    +{p.yaLiquidadas} ya liquidada{p.yaLiquidadas === 1 ? '' : 's'} (no se cuenta{p.yaLiquidadas === 1 ? '' : 'n'} acá)
                  </p>
                ) : null}
                {(deudaPorLavador.get(p.lavadorId) ?? 0) > 0 ? (
                  <p className="-mt-1 text-xs text-warning-700">
                    Debe {COP.format(deudaPorLavador.get(p.lavadorId) ?? 0)} (préstamos/nevera)
                  </p>
                ) : null}
                <button
                  type="button"
                  disabled={cargandoColilla === p.lavadorId}
                  onClick={() => handleVerColilla(p.lavadorId)}
                  className="flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-neutral-300 py-2 text-xs font-medium text-neutral-600 transition-colors hover:border-warning-300 hover:text-warning-700 disabled:opacity-50"
                  title="Corte informativo de este periodo — no es un pago, se liquida semanal desde Admin"
                >
                  <Receipt size={13} />
                  {cargandoColilla === p.lavadorId ? 'Calculando…' : `Colilla ${COLILLA_DE[modo]}`}
                </button>
              </Card>
            ))}
          </div>
        )}
        {sinAsignar > 0 ? (
          <p className="text-xs text-neutral-500">
            {sinAsignar} vehículo{sinAsignar === 1 ? '' : 's'} de este periodo sin lavador asignado: no cuenta{sinAsignar === 1 ? '' : 'n'} para
            ninguna colilla hasta que se asigne.
          </p>
        ) : null}
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold text-neutral-900">Vehículos del periodo ({ordenadas.length})</h3>
        <Card className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-200 text-left text-xs font-medium uppercase tracking-wide text-neutral-500">
                  <th className="px-5 py-3">#</th>
                  <th className="px-5 py-3">Creada</th>
                  <th className="px-5 py-3">Placa</th>
                  <th className="px-5 py-3">Cliente</th>
                  <th className="px-5 py-3">Tipo</th>
                  <th className="px-5 py-3">Combo</th>
                  <th className="px-5 py-3">Lavador</th>
                  <th className="px-5 py-3">Estado</th>
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
                    <td className="whitespace-nowrap px-5 py-3 text-neutral-500">{FECHA_HORA.format(new Date(orden.creadoEn))}</td>
                    <td className="px-5 py-3 font-mono font-medium text-neutral-900">{orden.placa}</td>
                    <td className="px-5 py-3 text-neutral-700">{orden.clienteNombre}</td>
                    <td className="px-5 py-3 text-neutral-700">{tipoNombre(orden.tipoVehiculoId)}</td>
                    <td className="px-5 py-3 text-neutral-700">{comboNombre(orden.comboId)}</td>
                    <td className="px-5 py-3 text-neutral-700">
                      {lavadorNombre(orden.lavadorId)}
                      {orden.lavadorId2 ? ` + ${lavadorNombre(orden.lavadorId2)}` : ''}
                    </td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${ESTADO_CLASSNAME[orden.estado]}`}>
                        {ESTADO_LABEL[orden.estado]}
                      </span>
                    </td>
                    <td className="px-5 py-3 font-medium text-neutral-900">{COP.format(orden.precio)}</td>
                    <td className="px-5 py-3 text-success-700">
                      {orden.lavadorId ? COP.format(orden.comisionLavador) : '—'}
                      {orden.lavadorId2 ? <span className="ml-1 text-xs text-neutral-400">(entre 2)</span> : null}
                    </td>
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
                    <td className="px-5 py-8 text-center text-neutral-400" colSpan={12}>
                      {ordenesQuery.isPending ? 'Cargando…' : 'No hay vehículos en este periodo.'}
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

      {colilla ? <ColillaLiquidacionModal colilla={colilla} onClose={() => setColilla(null)} /> : null}
    </div>
  )
}
