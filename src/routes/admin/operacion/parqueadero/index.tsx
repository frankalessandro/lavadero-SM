import { useMemo, useRef, useState, type FormEvent } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Ban, Banknote, CircleParking, Eye, Scale } from 'lucide-react'
import { anularEstancia, fetchEstanciasEnRango } from '../../../../data/estanciasParqueadero'
import {
  CLASE_VEHICULO_LABEL,
  type ClaseVehiculoParqueadero,
  type EstanciaParqueadero,
  type ModalidadParqueadero,
} from '../../../../schemas/estanciaParqueadero'
import { Card } from '../../../../components/layout/Card'
import { StatCard } from '../../../../components/layout/StatCard'
import { PageHeader } from '../../../../components/layout/PageHeader'
import { PeriodoSelector } from '../../../../components/layout/PeriodoSelector'
import { BarraFiltros, FiltroBusqueda, FiltroMenu } from '../../../../components/layout/Filtros'
import { Modal } from '../../../../components/layout/Modal'
import { Button } from '../../../../components/layout/Button'
import { SuscriptoresParqueadero } from '../../../../components/parqueadero/SuscriptoresParqueadero'
import { ReciboParqueaderoModal } from '../../../../components/layout/ReciboParqueaderoModal'
import { METODO_PAGO_LABEL } from '../../../../lib/metodoPago'
import { huecosEntre, formatearHuecos } from '../../../../lib/consecutivo'
import { calcularRango, rangoAISO, type ModoPeriodo } from '../../../../lib/periodo'
import { COP } from '../../../../lib/formato'
import { toast } from '../../../../lib/toast'

const MODALIDAD_LABEL: Record<ModalidadParqueadero, string> = {
  noche: 'Noche',
  mensualidad: 'Mensualidad',
  fijo: 'Fijo 24h',
}

const FECHA_HORA = new Intl.DateTimeFormat('es-CO', { dateStyle: 'short', timeStyle: 'short' })

async function loadParqueaderoPage() {
  const { desdeISO, hastaISO } = rangoAISO(calcularRango('dia', new Date()))
  return { estancias: await fetchEstanciasEnRango(desdeISO, hastaISO) }
}

export const Route = createFileRoute('/admin/operacion/parqueadero/')({
  loader: loadParqueaderoPage,
  component: ParqueaderoOperacionPage,
})

function ParqueaderoOperacionPage() {
  const initial = Route.useLoaderData()
  const [modoPeriodo, setModoPeriodo] = useState<ModoPeriodo>('dia')
  const [anclaPeriodo, setAnclaPeriodo] = useState(() => new Date())
  const rango = calcularRango(modoPeriodo, anclaPeriodo)
  const cargaRef = useRef(0)
  const [estancias, setEstancias] = useState(initial.estancias)
  const [loading, setLoading] = useState(false)
  const [anulando, setAnulando] = useState<EstanciaParqueadero | null>(null)
  const [viendo, setViendo] = useState<EstanciaParqueadero | null>(null)

  const [filtroPlaca, setFiltroPlaca] = useState('')
  const [filtroClase, setFiltroClase] = useState('')
  const [filtroModalidad, setFiltroModalidad] = useState('')
  const [filtroEstado, setFiltroEstado] = useState('')

  async function cambiarPeriodo(modo: ModoPeriodo, ancla: Date) {
    setModoPeriodo(modo)
    setAnclaPeriodo(ancla)
    const carga = ++cargaRef.current
    setLoading(true)
    try {
      const { desdeISO, hastaISO } = rangoAISO(calcularRango(modo, ancla))
      const nuevas = await fetchEstanciasEnRango(desdeISO, hastaISO)
      if (carga === cargaRef.current) setEstancias(nuevas)
    } catch (err) {
      if (carga === cargaRef.current) toast.desdeError(err, 'No se pudieron cargar los registros de parqueadero')
    } finally {
      if (carga === cargaRef.current) setLoading(false)
    }
  }

  async function refrescar() {
    const { desdeISO, hastaISO } = rangoAISO(rango)
    setEstancias(await fetchEstanciasEnRango(desdeISO, hastaISO))
  }

  const vigentes = estancias.filter((e) => !e.anulada)
  const salidasVigentes = vigentes.filter((e) => e.estado === 'fuera')
  const totalCobrado = salidasVigentes.reduce((s, e) => s + (e.cobro ?? 0), 0)
  const totalMultas = salidasVigentes.reduce((s, e) => s + e.multa, 0)
  const anuladasEnRango = estancias.filter((e) => e.anulada)
  // Antifraude: mismo criterio que Órdenes — un tiquete que nunca se confirmó. Las anuladas
  // conservan su número y no cuentan como hueco (regla 13).
  const huecos = huecosEntre(estancias.map((e) => e.consecutivo))

  const visibles = useMemo(
    () =>
      estancias.filter((e) => {
        if (!e.placa.toUpperCase().includes(filtroPlaca.trim().toUpperCase())) return false
        if (filtroClase && e.claseVehiculo !== filtroClase) return false
        if (filtroModalidad && e.modalidad !== filtroModalidad) return false
        if (filtroEstado === 'anulada' && !e.anulada) return false
        if (filtroEstado === 'adentro' && (e.anulada || e.estado !== 'adentro')) return false
        if (filtroEstado === 'fuera' && (e.anulada || e.estado !== 'fuera')) return false
        return true
      }),
    [estancias, filtroPlaca, filtroClase, filtroModalidad, filtroEstado],
  )

  return (
    <div className="flex flex-col gap-6 text-left">
      <PageHeader
        title="Parqueadero"
        description="Cada entrada y salida del periodo. Toca un registro para verlo o anularlo."
        help={{
          body:
            'Histórico de estancias del parqueadero (noche, mensualidad y fijo), con anulación auditada — igual criterio que anular una orden de lavado (regla 13: nada se borra, se anula con motivo).\n\n' +
            'Lo cobrado solo cuenta las salidas ya registradas y sin anular. La multa por salir fuera de ventana (regla 7) va incluida en el cobro.',
        }}
        actions={
          <PeriodoSelector
            modo={modoPeriodo}
            onModoChange={(modo) => cambiarPeriodo(modo, anclaPeriodo)}
            ancla={anclaPeriodo}
            onAnclaChange={(ancla) => cambiarPeriodo(modoPeriodo, ancla)}
            rango={rango}
          />
        }
      />

      <SuscriptoresParqueadero puedeFecharAtras />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Cobrado" value={COP.format(totalCobrado)} hint={`${salidasVigentes.length} salidas en el rango`} icon={Banknote} />
        <StatCard label="Registros" value={String(estancias.length)} hint={`${vigentes.filter((e) => e.estado === 'adentro').length} siguen adentro`} icon={CircleParking} />
        <StatCard label="De eso, multas" value={COP.format(totalMultas)} icon={Scale} />
        <StatCard label="Anuladas" value={String(anuladasEnRango.length)} icon={Ban} />
      </div>

      {huecos.length > 0 ? (
        <div className="flex items-start gap-3 rounded-2xl border border-danger-600/25 bg-danger-50 px-4 py-3">
          <Ban size={18} className="mt-0.5 shrink-0 text-danger-600" />
          <div className="min-w-0 text-sm">
            <p className="font-semibold text-danger-700">
              {huecos.length === 1 ? 'Falta 1 tiquete en el consecutivo' : `Faltan ${huecos.length} tiquetes en el consecutivo`}:{' '}
              <span className="font-mono">{formatearHuecos(huecos)}</span>
            </p>
            <p className="mt-0.5 text-xs text-danger-700/80">
              Un número que nunca se confirmó. Una anulación conserva su tiquete y no aparece acá — un hueco hay que explicarlo.
            </p>
          </div>
        </div>
      ) : null}

      <BarraFiltros
        activos={[filtroPlaca, filtroClase, filtroModalidad, filtroEstado].filter(Boolean).length}
        onLimpiar={() => {
          setFiltroPlaca('')
          setFiltroClase('')
          setFiltroModalidad('')
          setFiltroEstado('')
        }}
        resultado={`${visibles.length} de ${estancias.length} registros`}
      >
        <FiltroBusqueda value={filtroPlaca} onChange={setFiltroPlaca} placeholder="Buscar placa" mayusculas ancho="sm:w-44" />
        <FiltroMenu
          label="Vehículo"
          value={filtroClase}
          onChange={setFiltroClase}
          options={(Object.keys(CLASE_VEHICULO_LABEL) as ClaseVehiculoParqueadero[]).map((c) => ({ value: c, label: CLASE_VEHICULO_LABEL[c] }))}
        />
        <FiltroMenu
          label="Modalidad"
          value={filtroModalidad}
          onChange={setFiltroModalidad}
          options={(Object.keys(MODALIDAD_LABEL) as ModalidadParqueadero[]).map((m) => ({ value: m, label: MODALIDAD_LABEL[m] }))}
        />
        <FiltroMenu
          label="Estado"
          value={filtroEstado}
          onChange={setFiltroEstado}
          options={[
            { value: 'adentro', label: 'Adentro' },
            { value: 'fuera', label: 'Fuera' },
            { value: 'anulada', label: 'Anulada' },
          ]}
        />
      </BarraFiltros>

      <Card className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[52rem] text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-xs font-medium uppercase tracking-wide text-neutral-500">
                <th className="px-5 py-3">Tiquete</th>
                <th className="px-5 py-3">Placa</th>
                <th className="px-5 py-3">Vehículo</th>
                <th className="px-5 py-3">Modalidad</th>
                <th className="px-5 py-3">Ingreso</th>
                <th className="px-5 py-3">Salida</th>
                <th className="px-5 py-3">Cobro</th>
                <th className="px-5 py-3">Estado</th>
                <th className="px-5 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((e) => (
                <tr
                  key={e.id}
                  onClick={() => setViendo(e)}
                  className={`cursor-pointer border-b border-neutral-100 transition-colors last:border-0 hover:bg-primary-50/40 ${
                    e.anulada ? 'opacity-60' : ''
                  }`}
                >
                  <td className="px-5 py-3 font-mono text-xs text-neutral-500">PAR-{e.consecutivo}</td>
                  <td className="px-5 py-3 font-medium text-neutral-900">{e.placa}</td>
                  <td className="px-5 py-3 text-neutral-700">{CLASE_VEHICULO_LABEL[e.claseVehiculo]}</td>
                  <td className="px-5 py-3 text-neutral-700">{MODALIDAD_LABEL[e.modalidad]}</td>
                  <td className="px-5 py-3 whitespace-nowrap text-neutral-700">{FECHA_HORA.format(new Date(e.horaIngreso))}</td>
                  <td className="px-5 py-3 whitespace-nowrap text-neutral-700">
                    {e.horaSalida ? FECHA_HORA.format(new Date(e.horaSalida)) : '—'}
                  </td>
                  <td className="px-5 py-3 text-neutral-700">
                    {e.cobro ? (
                      <span className="flex flex-col">
                        <span>{COP.format(e.cobro)}</span>
                        {e.multa > 0 ? <span className="text-xs text-warning-600">incl. multa {COP.format(e.multa)}</span> : null}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                        e.anulada
                          ? 'bg-danger-50 text-danger-700'
                          : e.estado === 'adentro'
                            ? 'bg-warning-50 text-warning-700'
                            : 'bg-success-50 text-success-700'
                      }`}
                      title={e.anulada ? `Motivo: ${e.motivoAnulacion ?? '—'} · Anuló: ${e.anuladaPor ?? '—'}` : undefined}
                    >
                      {e.anulada ? 'Anulada' : e.estado === 'adentro' ? 'Adentro' : 'Fuera'}
                    </span>
                  </td>
                  <td className="px-5 py-3" onClick={(ev) => ev.stopPropagation()}>
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => setViendo(e)}
                        className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-neutral-600 transition-colors hover:bg-primary-50 hover:text-primary-700"
                      >
                        <Eye size={14} />
                        Ver
                      </button>
                      {!e.anulada ? (
                        <button
                          type="button"
                          onClick={() => setAnulando(e)}
                          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-danger-600 transition-colors hover:bg-danger-50"
                        >
                          <Ban size={14} />
                          Anular
                        </button>
                      ) : (
                        <span className="text-xs text-neutral-400">{e.anuladaEn ? new Date(e.anuladaEn).toLocaleDateString('es-CO') : ''}</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {visibles.length === 0 ? (
                <tr>
                  <td className="px-5 py-6 text-center text-neutral-400" colSpan={9}>
                    {loading ? 'Cargando…' : estancias.length === 0 ? 'No hay registros en este rango.' : 'Ningún registro coincide con el filtro.'}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>

      {anuladasEnRango.length > 0 ? (
        <Card className="text-left">
          <h2 className="mb-3 text-sm font-semibold text-neutral-900">Anulaciones en el rango</h2>
          <ul className="flex flex-col gap-3 text-sm">
            {anuladasEnRango.map((e) => (
              <li key={e.id} className="border-b border-neutral-100 pb-2 last:border-0 last:pb-0">
                <p className="font-medium text-neutral-900">
                  PAR-{e.consecutivo} · <span className="font-mono">{e.placa}</span>
                </p>
                <p className="text-neutral-500">
                  Motivo: {e.motivoAnulacion ?? '—'} · Anuló: {e.anuladaPor ?? '—'}
                  {e.anuladaEn ? ` · ${new Date(e.anuladaEn).toLocaleString('es-CO')}` : ''}
                </p>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {viendo ? (
        <ReciboParqueaderoModal
          estancia={viendo}
          variant={viendo.estado === 'adentro' ? 'ingreso' : 'salida'}
          onClose={() => setViendo(null)}
        />
      ) : null}

      {anulando ? (
        <AnularEstanciaModal
          estancia={anulando}
          onClose={() => setAnulando(null)}
          onAnulada={async () => {
            setAnulando(null)
            await refrescar()
          }}
        />
      ) : null}
    </div>
  )
}

function AnularEstanciaModal({
  estancia,
  onClose,
  onAnulada,
}: {
  estancia: EstanciaParqueadero
  onClose: () => void
  onAnulada: () => Promise<void>
}) {
  const [motivo, setMotivo] = useState('')
  const [anuladaPor, setAnuladaPor] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const enVueloRef = useRef(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (enVueloRef.current) return
    if (motivo.trim().length < 3) {
      setError('El motivo es obligatorio (mínimo 3 caracteres)')
      return
    }
    if (!anuladaPor.trim()) {
      setError('Indica quién anula el registro')
      return
    }
    setError(null)
    enVueloRef.current = true
    setSaving(true)
    try {
      await anularEstancia(estancia.id, motivo.trim(), anuladaPor.trim())
      await onAnulada()
      toast.exito(`PAR-${estancia.consecutivo} anulado`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo anular el registro')
      toast.desdeError(err, 'No se pudo anular el registro')
    } finally {
      enVueloRef.current = false
      setSaving(false)
    }
  }

  return (
    <Modal
      title={`Anular PAR-${estancia.consecutivo} · ${estancia.placa}`}
      subtitle="No se puede deshacer. Queda visible en reportes con el motivo y quién lo anuló."
      icon={Ban}
      tone="danger"
      size="sm"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="danger" type="submit" form="form-anular-estancia" loading={saving}>
            Anular registro
          </Button>
        </>
      }
    >
      <form id="form-anular-estancia" onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="rounded-lg bg-neutral-50 px-3 py-2.5 text-xs text-neutral-600">
          <p>
            {CLASE_VEHICULO_LABEL[estancia.claseVehiculo]} · {MODALIDAD_LABEL[estancia.modalidad]} · ingresó{' '}
            {FECHA_HORA.format(new Date(estancia.horaIngreso))}
          </p>
          {estancia.cobro ? (
            <p className="mt-0.5">
              Cobrado: {COP.format(estancia.cobro)}
              {estancia.metodoPago ? ` · ${METODO_PAGO_LABEL[estancia.metodoPago]}` : ''}
            </p>
          ) : null}
        </div>

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-neutral-700">Motivo de anulación</span>
          <textarea
            autoFocus
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="p. ej. Placa mal digitada, se duplicó el registro"
            rows={3}
            className="resize-none rounded-lg border border-neutral-300 px-3 py-2.5 text-sm outline-none transition-colors focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
          />
        </label>

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-neutral-700">Quién anula</span>
          <input
            value={anuladaPor}
            onChange={(e) => setAnuladaPor(e.target.value)}
            placeholder="Nombre de quien anula"
            className="rounded-lg border border-neutral-300 px-3 py-2.5 text-sm outline-none transition-colors focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
          />
        </label>

        {error ? <p className="text-xs text-danger-600">{error}</p> : null}
      </form>
    </Modal>
  )
}
