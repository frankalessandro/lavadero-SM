import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { exigirRol } from '../../lib/auth'
import { LogIn, LogOut, Car, Bike, Banknote, AlertTriangle, Clock, Lock, Unlock, ChevronRight, History } from 'lucide-react'
import {
  fetchEstanciasAdentro,
  fetchResumenHoy,
  registrarEntrada,
  registrarSalida,
  fetchLavadoHoyPorPlaca,
  type LavadoHoy,
  tarifaNoche,
  fetchCobroPrevisto,
  fetchUltimaEstanciaPorPlaca,
  type CobroPrevisto,
  fueraDeVentanaSalida,
} from '../../data/estanciasParqueadero'
import {
  entradaInputSchema,
  type EstanciaParqueadero,
  type ModalidadParqueadero,
  type MetodoPagoParqueadero,
  type ClaseVehiculoParqueadero,
  CLASE_VEHICULO_LABEL,
} from '../../schemas/estanciaParqueadero'
import { METODO_PAGO_LABEL } from '../../lib/metodoPago'
import { SuscriptoresParqueadero } from '../../components/parqueadero/SuscriptoresParqueadero'
import { fetchSuscripcionActivaPorPlaca } from '../../data/suscripcionesParqueadero'
import { estadoVigencia, ESTADO_VIGENCIA_LABEL, type SuscripcionParqueadero } from '../../schemas/suscripcionParqueadero'
import { fetchTurnoAbierto, abrirTurno, calcularValorEsperado, cerrarTurno } from '../../data/turnos'
import type { TurnoCaja } from '../../schemas/turnoCaja'
import { CustomSelect } from '../../components/layout/CustomSelect'
import { BaseInicialInput } from '../../components/layout/BaseInicialInput'
import { CurrencyInput } from '../../components/layout/CurrencyInput'
import { toast } from '../../lib/toast'
import { ReciboParqueaderoModal, type VarianteReciboParqueadero } from '../../components/layout/ReciboParqueaderoModal'
import { Modal } from '../../components/layout/Modal'
import { Button } from '../../components/layout/Button'
import { StatCard } from '../../components/layout/StatCard'
import { EstadoTurno } from '../../components/layout/EstadoTurno'
import { SectionHeader } from '../../components/layout/PageHeader'
import { FiltroBusqueda } from '../../components/layout/Filtros'

async function loadParqueadero() {
  const [estancias, resumen, turno] = await Promise.all([
    fetchEstanciasAdentro(),
    fetchResumenHoy(),
    fetchTurnoAbierto('vigilante'),
  ])
  return { estancias, resumen, turno }
}

const HORA_FORMAT = new Intl.DateTimeFormat('es-CO', { hour: 'numeric', minute: '2-digit', hour12: true })
const FECHA_CORTA = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short' })

export const Route = createFileRoute('/vigilante/')({
  beforeLoad: ({ context }) => exigirRol(context.auth, 'vigilante'),
  loader: loadParqueadero,
  component: VigilanteHome,
})

const COP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })

const MODALIDAD_LABEL: Record<ModalidadParqueadero, string> = {
  noche: 'Noche',
  mensualidad: 'Mensualidad',
  fijo: 'Fijo 24h',
}

function tiempoTranscurrido(horaIngreso: string): string {
  const minutos = Math.floor((Date.now() - new Date(horaIngreso).getTime()) / 60000)
  if (minutos < 60) return `${minutos} min`
  const horas = Math.floor(minutos / 60)
  return `${horas} h ${minutos % 60} min`
}

function VigilanteHome() {
  const data = Route.useLoaderData()
  const { auth } = Route.useRouteContext()
  const [estancias, setEstancias] = useState<EstanciaParqueadero[]>(data.estancias)
  const [resumen, setResumen] = useState(data.resumen)
  const [turno, setTurno] = useState<TurnoCaja | undefined>(data.turno)
  const [modal, setModal] = useState<'entrada' | 'salida' | 'abrirTurno' | 'cerrarTurno' | null>(null)
  const [salidaSeleccionada, setSalidaSeleccionada] = useState<EstanciaParqueadero | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const [recibo, setRecibo] = useState<{
    estancia: EstanciaParqueadero
    variant: VarianteReciboParqueadero
    tarifaNoche?: number
  } | null>(null)
  const estanciasVisibles = busqueda
    ? estancias.filter((e) => e.placa.toUpperCase().includes(busqueda.trim().toUpperCase()))
    : estancias

  async function refresh() {
    const [nuevasEstancias, nuevoResumen] = await Promise.all([fetchEstanciasAdentro(), fetchResumenHoy()])
    setEstancias(nuevasEstancias)
    setResumen(nuevoResumen)
  }

  async function refreshTurno() {
    const nuevoTurno = await fetchTurnoAbierto('vigilante')
    setTurno(nuevoTurno)
  }

  function abrirSalida(estancia: EstanciaParqueadero) {
    setSalidaSeleccionada(estancia)
    setModal('salida')
  }

  return (
    <>
      <div className="mx-auto flex max-w-2xl flex-col gap-4 pb-6">
      {/* Turno de caja — arqueo ciego (regla 15), visible siempre arriba de todo lo demás */}
      <EstadoTurno
        abierto={Boolean(turno)}
        titulo={turno ? `Turno abierto · ${turno.responsable}` : 'Caja cerrada'}
        detalle={
          turno
            ? `Desde las ${HORA_FORMAT.format(new Date(turno.abiertoEn))}`
            : 'Abre tu turno para empezar a registrar entradas y salidas.'
        }
        accion={
          turno ? (
            <Button icon={Lock} onClick={() => setModal('cerrarTurno')}>
              Cerrar turno
            </Button>
          ) : (
            <Button variant="primary" icon={Unlock} onClick={() => setModal('abrirTurno')}>
              Abrir turno
            </Button>
          )
        }
      />

      {/* Las dos cifras que el vigilante necesita de un vistazo — 2 columnas incluso en móvil */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="En el patio" value={String(resumen.vehiculosAdentro)} icon={Car} />
        <StatCard label="Recaudado hoy" value={COP.format(resumen.dineroHoy)} icon={Banknote} />
      </div>

      {/* Acciones principales — grandes, para pulgar, siempre visibles arriba del listado */}
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => setModal('entrada')}
          disabled={!turno}
          title={turno ? undefined : 'Abre tu turno antes de registrar una entrada'}
          className="flex flex-col items-center gap-1.5 rounded-2xl bg-primary-600 py-5 text-white shadow-nav-active transition-colors hover:bg-primary-700 active:bg-primary-800 disabled:cursor-not-allowed disabled:bg-neutral-300 disabled:text-neutral-500 disabled:shadow-none"
        >
          <LogIn size={22} strokeWidth={2.25} />
          <span className="text-sm font-semibold">Entrada</span>
        </button>
        <button
          type="button"
          onClick={() => {
            setSalidaSeleccionada(null)
            setModal('salida')
          }}
          className="flex flex-col items-center gap-1.5 rounded-2xl border border-neutral-200 bg-white py-5 text-neutral-700 shadow-card transition-colors hover:bg-neutral-50 active:bg-neutral-100"
        >
          <LogOut size={22} strokeWidth={2.25} className="text-primary-600" />
          <span className="text-sm font-semibold">Salida</span>
        </button>
      </div>

      <section className="flex flex-col gap-3">
        <SectionHeader
          title="Vehículos en el patio"
          count={estancias.length}
          hint="Toca uno para registrar su salida."
        />
        {estancias.length > 0 ? (
          <FiltroBusqueda value={busqueda} onChange={setBusqueda} placeholder="¿Está adentro? Buscar placa" mayusculas ancho="" />
        ) : null}
        <div className="flex flex-col gap-2">
          {estanciasVisibles.map((estancia) => {
            const alerta = fueraDeVentanaSalida(estancia.modalidad, estancia.horaIngreso)
            return (
              <button
                key={estancia.id}
                type="button"
                onClick={() => abrirSalida(estancia)}
                className="flex items-center justify-between gap-3 rounded-2xl border border-neutral-200 bg-white p-4 text-left shadow-card transition-shadow hover:shadow-card-hover active:shadow-none"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-semibold text-neutral-900">{estancia.placa}</span>
                    <span className="inline-flex rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-700">
                      {CLASE_VEHICULO_LABEL[estancia.claseVehiculo]}
                    </span>
                    <span className="inline-flex rounded-full bg-primary-50 px-2 py-0.5 text-xs font-medium text-primary-700">
                      {MODALIDAD_LABEL[estancia.modalidad]}
                    </span>
                    {alerta ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-warning-50 px-2 py-0.5 text-xs font-medium text-warning-700">
                        <AlertTriangle size={11} /> Fuera de ventana
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 flex items-center gap-1 text-xs text-neutral-400">
                    <Clock size={12} /> {tiempoTranscurrido(estancia.horaIngreso)} ·{' '}
                    <span className="font-mono">PAR-{estancia.consecutivo}</span>
                  </p>
                </div>
                <span className="flex shrink-0 items-center gap-1 rounded-lg bg-neutral-100 px-3 py-1.5 text-xs font-medium text-neutral-600">
                  Salida <ChevronRight size={13} />
                </span>
              </button>
            )
          })}
          {estanciasVisibles.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-neutral-200 bg-white px-4 py-10 text-center text-sm text-neutral-400">
              {estancias.length === 0 ? 'No hay vehículos en el patio.' : 'Ninguna placa coincide.'}
            </p>
          ) : null}
        </div>
      </section>

      <SuscriptoresParqueadero />

      {modal === 'entrada' ? (
        <EntradaModal
          onClose={() => setModal(null)}
          onSaved={async (estancia, tarifa) => {
            setModal(null)
            setRecibo({ estancia, variant: 'ingreso', tarifaNoche: tarifa })
            await refresh()
          }}
        />
      ) : null}

      {modal === 'salida' ? (
        <SalidaModal
          estancias={estancias}
          seleccionada={salidaSeleccionada}
          onClose={() => setModal(null)}
          onSaved={async (estancia) => {
            setModal(null)
            setRecibo({ estancia, variant: 'salida' })
            await refresh()
          }}
        />
      ) : null}

      {recibo ? (
        <ReciboParqueaderoModal
          estancia={recibo.estancia}
          variant={recibo.variant}
          tarifaNoche={recibo.tarifaNoche}
          onClose={() => setRecibo(null)}
        />
      ) : null}

      {modal === 'abrirTurno' ? (
        <AbrirTurnoModal
          miNombre={auth?.perfil.nombre?.trim() || 'tu cuenta'}
          onClose={() => setModal(null)}
          onSaved={async () => {
            setModal(null)
            await refreshTurno()
          }}
        />
      ) : null}

      {modal === 'cerrarTurno' && turno ? (
        <CerrarTurnoModal
          turno={turno}
          onClose={() => setModal(null)}
          onSaved={async () => {
            setModal(null)
            await refreshTurno()
          }}
        />
      ) : null}
      </div>
    </>
  )
}

// El responsable ya no se elige (0072): siempre es la cuenta con la sesión abierta — `miNombre`
// es solo para mostrarlo, la RPC `abrir_turno` deriva el dueño real de auth.uid() en el servidor.
function AbrirTurnoModal({ miNombre, onClose, onSaved }: { miNombre: string; onClose: () => void; onSaved: () => void }) {
  const [baseInicial, setBaseInicial] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const enVueloRef = useRef(false)

  async function handleSubmit() {
    if (enVueloRef.current) return
    setError(null)
    const base = Number(baseInicial)
    if (!Number.isFinite(base) || base < 0) {
      setError('La base inicial no puede ser negativa')
      return
    }
    enVueloRef.current = true
    setSaving(true)
    try {
      await abrirTurno({ rol: 'vigilante', baseInicial: Math.round(base) })
      onSaved()
      toast.exito('Turno abierto')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo abrir el turno')
      toast.desdeError(err, 'No se pudo abrir el turno')
    } finally {
      enVueloRef.current = false
      setSaving(false)
    }
  }

  return (
    <Modal
      title="Abrir turno"
      subtitle={
        <>
          Vas a abrirlo como <span className="font-medium text-neutral-700">{miNombre}</span>.
        </>
      }
      icon={Unlock}
      size="lg"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={handleSubmit} loading={saving}>
            {saving ? 'Abriendo…' : 'Abrir turno'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-2 text-sm">
          <span className="font-medium text-neutral-700">Base inicial</span>
          <BaseInicialInput size="md" value={baseInicial} onChange={setBaseInicial} />
        </div>
        {error ? <p className="text-xs text-danger-600">{error}</p> : null}
      </div>
    </Modal>
  )
}

function CerrarTurnoModal({ turno, onClose, onSaved }: { turno: TurnoCaja; onClose: () => void; onSaved: () => void }) {
  const [paso, setPaso] = useState<'conteo' | 'revelado'>('conteo')
  const [conteoFisico, setConteoFisico] = useState('')
  const [valorEsperado, setValorEsperado] = useState<number | null>(null)
  const [cerradoPor, setCerradoPor] = useState('')
  const [justificacion, setJustificacion] = useState('')
  const [recibidoPor, setRecibidoPor] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const enVueloRef = useRef(false)

  const conteo = Number(conteoFisico)
  const diferencia = valorEsperado !== null && Number.isFinite(conteo) ? conteo - valorEsperado : 0

  async function handleRevelar() {
    setError(null)
    if (!Number.isFinite(conteo) || conteo < 0) {
      setError('Ingresa un conteo físico válido')
      return
    }
    setSaving(true)
    try {
      const esperado = await calcularValorEsperado(turno)
      setValorEsperado(esperado)
      setPaso('revelado')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo calcular el valor esperado')
      toast.desdeError(err, 'No se pudo calcular el valor esperado')
    } finally {
      setSaving(false)
    }
  }

  async function handleCerrar() {
    if (enVueloRef.current) return
    setError(null)
    if (!cerradoPor.trim()) {
      setError('Indica quién cierra el turno')
      return
    }
    if (diferencia !== 0 && !justificacion.trim()) {
      setError('Hay una diferencia en el arqueo — la justificación es obligatoria para cerrar el turno')
      return
    }
    enVueloRef.current = true
    setSaving(true)
    try {
      await cerrarTurno(
        turno,
        Math.round(conteo),
        cerradoPor,
        justificacion.trim() || undefined,
        recibidoPor.trim() || undefined,
      )
      onSaved()
      toast.exito('Turno cerrado')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cerrar el turno')
      toast.desdeError(err, 'No se pudo cerrar el turno')
      enVueloRef.current = false
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalSheet title="Cerrar turno" onClose={onClose}>
      {paso === 'conteo' ? (
        <div className="flex flex-col gap-4">
          <p className="text-xs text-neutral-500">
            Cuenta el efectivo físico de la caja e ingresa el total. El valor esperado del sistema se muestra
            después, para un arqueo ciego.
          </p>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-neutral-700">Conteo físico</span>
            <CurrencyInput autoFocus size="md" prefix="$" value={conteoFisico} onChange={setConteoFisico} />
          </label>

          {error ? <p className="text-xs text-danger-600">{error}</p> : null}

          <button
            type="button"
            onClick={handleRevelar}
            disabled={saving}
            className="mt-1 w-full rounded-xl bg-primary-600 py-3.5 text-sm font-semibold text-white shadow-nav-active transition-colors hover:bg-primary-700 disabled:opacity-60"
          >
            {saving ? 'Calculando…' : 'Confirmar conteo'}
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-neutral-50 px-3 py-2.5">
              <p className="text-xs text-neutral-500">Conteo físico</p>
              <p className="text-sm font-semibold text-neutral-900">{COP.format(conteo)}</p>
            </div>
            <div className="rounded-lg bg-neutral-50 px-3 py-2.5">
              <p className="text-xs text-neutral-500">Esperado (sistema)</p>
              <p className="text-sm font-semibold text-neutral-900">{COP.format(valorEsperado ?? 0)}</p>
            </div>
          </div>

          <div
            className={`rounded-lg px-3 py-2.5 text-sm font-medium ${
              diferencia === 0 ? 'bg-success-50 text-success-700' : 'bg-warning-50 text-warning-700'
            }`}
          >
            {diferencia === 0 ? 'Sin diferencia' : `Diferencia: ${COP.format(diferencia)}`}
          </div>

          {diferencia !== 0 ? (
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-neutral-700">Justificación de la diferencia</span>
              <textarea
                autoFocus
                value={justificacion}
                onChange={(e) => setJustificacion(e.target.value)}
                rows={2}
                placeholder="Explica la diferencia…"
                className="rounded-lg border border-neutral-300 px-3 py-3 text-base outline-none transition-colors focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
              />
            </label>
          ) : null}

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-neutral-700">Cierra el turno</span>
            <input
              value={cerradoPor}
              onChange={(e) => setCerradoPor(e.target.value)}
              placeholder="Nombre de quien cierra"
              className="rounded-lg border border-neutral-300 px-3 py-3 text-base outline-none transition-colors focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
            />
          </label>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-neutral-700">Recibido por (opcional)</span>
            <input
              value={recibidoPor}
              onChange={(e) => setRecibidoPor(e.target.value)}
              placeholder="Quién recibe la caja"
              className="rounded-lg border border-neutral-300 px-3 py-3 text-base outline-none transition-colors focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
            />
          </label>

          {error ? <p className="text-xs text-danger-600">{error}</p> : null}

          <button
            type="button"
            onClick={handleCerrar}
            disabled={saving}
            className="mt-1 w-full rounded-xl bg-primary-600 py-3.5 text-sm font-semibold text-white shadow-nav-active transition-colors hover:bg-primary-700 disabled:opacity-60"
          >
            {saving ? 'Cerrando…' : 'Confirmar cierre'}
          </button>
        </div>
      )}
    </ModalSheet>
  )
}

// Regla de negocio 8: un vehículo que se lavó hoy no genera cobro combinado de parqueadero.
// Solo avisa — qué hacer si el carro efectivamente se quedó toda la noche es criterio del
// vigilante/negocio, no se fuerza el cobro a $0.
// Suscriptor de mensualidad/fijo (0051): en la portería importa si está al día. No cambia el
// cobro (regla 6: esas modalidades no cobran por movimiento).
function AvisoSuscripcion({ sus }: { sus: SuscripcionParqueadero }) {
  const estado = estadoVigencia(sus.fechaFin)
  const tono =
    estado === 'vigente'
      ? 'border-success-600/25 bg-success-50 text-success-700'
      : estado === 'por_vencer'
        ? 'border-warning-600/25 bg-warning-50 text-warning-700'
        : 'border-danger-600/25 bg-danger-50 text-danger-700'
  return (
    <div className={`flex items-start gap-2 rounded-lg border px-3 py-2.5 text-xs ${tono}`}>
      <Car size={14} className="mt-0.5 shrink-0" />
      <span>
        Suscriptor {sus.modalidad === 'fijo' ? 'fijo 24h' : 'mensualidad'} · {sus.titular} —{' '}
        <span className="font-medium">
          {ESTADO_VIGENCIA_LABEL[estado]} (vence {new Date(`${sus.fechaFin}T00:00:00`).toLocaleDateString('es-CO')})
        </span>
      </span>
    </div>
  )
}

function AvisoLavadoHoy({ lavado, enSalida = false }: { lavado: LavadoHoy; enSalida?: boolean }) {
  const HORA = new Intl.DateTimeFormat('es-CO', { hour: 'numeric', minute: '2-digit' })
  const detalle =
    lavado.estado === 'entregado' && lavado.entregadaEn
      ? `entregado ${HORA.format(new Date(lavado.entregadaEn))}`
      : lavado.estado === 'entregado'
        ? 'entregado hoy'
        : `todavía ${lavado.estado === 'listo' ? 'listo para entregar' : 'en lavado'}`
  return (
    <div className="flex items-start gap-2 rounded-lg border border-warning-600/25 bg-warning-50 px-3 py-2.5 text-xs text-warning-700">
      <AlertTriangle size={14} className="mt-0.5 shrink-0" />
      <span>
        Este vehículo tiene un lavado hoy (#{lavado.consecutivo}, {detalle}).{' '}
        <span className="font-medium">
          Regla 8: un vehículo lavado no paga parqueadero combinado{enSalida ? ' — revisa antes de cobrar.' : '.'}
        </span>
      </span>
    </div>
  )
}

function EntradaModal({
  onClose,
  onSaved,
}: {
  onClose: () => void
  onSaved: (estancia: EstanciaParqueadero, tarifaNoche: number) => void
}) {
  const [placa, setPlaca] = useState('')
  const [modalidad, setModalidad] = useState<ModalidadParqueadero>('noche')
  const [clase, setClase] = useState<ClaseVehiculoParqueadero>('carro')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const enVueloRef = useRef(false)
  // Si el vigilante ya eligió a mano clase o modalidad, el autocompletado no se la pisa.
  const tocadoRef = useRef({ clase: false, modalidad: false })
  const [tarifa, setTarifa] = useState(0)
  const [lavadoHoy, setLavadoHoy] = useState<LavadoHoy | undefined>(undefined)
  const [suscripcion, setSuscripcion] = useState<SuscripcionParqueadero | undefined>(undefined)
  const [anterior, setAnterior] = useState<EstanciaParqueadero | undefined>(undefined)
  const yaAdentro = anterior?.estado === 'adentro'

  useEffect(() => {
    let cancelado = false
    tarifaNoche(clase)
      .then((t) => {
        if (!cancelado) setTarifa(t)
      })
      .catch(() => {})
    return () => {
      cancelado = true
    }
  }, [clase])

  // Autocompletado por placa (M4): suscripción activa (manda la modalidad), lavado de hoy (regla 8)
  // y última estancia (trae clase y modalidad de la vez pasada, y avisa si ya está adentro).
  useEffect(() => {
    const placaLimpia = placa.trim().length >= 5 ? placa.trim() : ''
    let cancelado = false
    const t = setTimeout(() => {
      fetchLavadoHoyPorPlaca(placaLimpia)
        .then((l) => {
          if (!cancelado) setLavadoHoy(l)
        })
        .catch(() => {})
      Promise.all([fetchSuscripcionActivaPorPlaca(placaLimpia), fetchUltimaEstanciaPorPlaca(placaLimpia)])
        .then(([sub, ultima]) => {
          if (cancelado) return
          setSuscripcion(sub)
          setAnterior(ultima)
          if (ultima && !tocadoRef.current.clase) setClase(ultima.claseVehiculo)
          if (!tocadoRef.current.modalidad) {
            if (sub) setModalidad(sub.modalidad)
            else if (ultima) setModalidad(ultima.modalidad)
          }
        })
        .catch(() => {})
    }, 350)
    return () => {
      cancelado = true
      clearTimeout(t)
    }
  }, [placa])

  async function handleSubmit() {
    if (enVueloRef.current || yaAdentro) return
    const parsed = entradaInputSchema.safeParse({ placa, modalidad, claseVehiculo: clase })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Datos inválidos')
      return
    }
    setError(null)
    enVueloRef.current = true
    setSaving(true)
    try {
      const estancia = await registrarEntrada(parsed.data)
      toast.exito('Entrada registrada')
      onSaved(estancia, tarifa)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar la entrada')
      toast.desdeError(err, 'No se pudo registrar la entrada')
    } finally {
      enVueloRef.current = false
      setSaving(false)
    }
  }

  return (
    <ModalSheet title="Registrar entrada" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-neutral-700">Placa</span>
          <input
            autoFocus
            value={placa}
            onChange={(e) => setPlaca(e.target.value.toUpperCase())}
            placeholder="AB123CD"
            className="rounded-lg border border-neutral-300 px-3 py-3 font-mono text-base uppercase outline-none transition-colors focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
          />
          {anterior && !yaAdentro ? (
            <span className="flex items-center gap-1.5 text-xs text-primary-700">
              <History size={12} /> Ya vino antes ({CLASE_VEHICULO_LABEL[anterior.claseVehiculo]} ·{' '}
              {MODALIDAD_LABEL[anterior.modalidad]}, {FECHA_CORTA.format(new Date(anterior.horaIngreso))}) — datos precargados
            </span>
          ) : null}
        </label>

        {yaAdentro && anterior ? (
          <p className="flex items-start gap-2 rounded-lg border border-danger-600/25 bg-danger-50 px-3 py-2.5 text-xs text-danger-700">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            Esta placa ya está adentro (PAR-{anterior.consecutivo}, desde {HORA_FORMAT.format(new Date(anterior.horaIngreso))}).
            Registra primero su salida.
          </p>
        ) : null}

        <div className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-neutral-700">Vehículo</span>
          <div className="grid grid-cols-3 gap-2">
            {(Object.keys(CLASE_VEHICULO_LABEL) as ClaseVehiculoParqueadero[]).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => {
                  tocadoRef.current.clase = true
                  setClase(value)
                }}
                className={`flex flex-col items-center gap-1 rounded-xl border px-2 py-3 text-sm font-medium transition-colors ${
                  clase === value
                    ? 'border-primary-600 bg-primary-50 text-primary-700'
                    : 'border-neutral-200 text-neutral-600 hover:bg-neutral-50'
                }`}
              >
                {value === 'carro' ? <Car size={18} /> : <Bike size={18} />}
                {CLASE_VEHICULO_LABEL[value]}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-neutral-700">Modalidad</span>
          <div className="grid grid-cols-3 gap-2">
            {(Object.keys(MODALIDAD_LABEL) as ModalidadParqueadero[]).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => {
                  tocadoRef.current.modalidad = true
                  setModalidad(value)
                }}
                className={`rounded-xl border px-2 py-3 text-sm font-medium transition-colors ${
                  modalidad === value
                    ? 'border-primary-600 bg-primary-50 text-primary-700'
                    : 'border-neutral-200 text-neutral-600 hover:bg-neutral-50'
                }`}
              >
                {MODALIDAD_LABEL[value]}
              </button>
            ))}
          </div>
          {modalidad === 'noche' ? (
            <p className="text-xs text-neutral-400">
              {tarifa > 0 ? `Se cobra ${COP.format(tarifa)} al retiro, no ahora.` : 'Tarifa de noche sin definir para este vehículo.'}
            </p>
          ) : null}
        </div>

        {suscripcion ? <AvisoSuscripcion sus={suscripcion} /> : null}
        {lavadoHoy ? <AvisoLavadoHoy lavado={lavadoHoy} /> : null}

        {error ? <p className="text-xs text-danger-600">{error}</p> : null}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={saving || yaAdentro}
          className="mt-1 w-full rounded-xl bg-primary-600 py-3.5 text-sm font-semibold text-white shadow-nav-active transition-colors hover:bg-primary-700 disabled:opacity-60"
        >
          {saving ? 'Registrando…' : 'Registrar entrada'}
        </button>
      </div>
    </ModalSheet>
  )
}

function SalidaModal({
  estancias,
  seleccionada,
  onClose,
  onSaved,
}: {
  estancias: EstanciaParqueadero[]
  seleccionada: EstanciaParqueadero | null
  onClose: () => void
  onSaved: (estancia: EstanciaParqueadero) => void
}) {
  const [estanciaId, setEstanciaId] = useState(seleccionada?.id ?? '')
  const [metodoPago, setMetodoPago] = useState<MetodoPagoParqueadero>('efectivo')
  const [saving, setSaving] = useState(false)
  const enVueloRef = useRef(false)
  const [cobro, setCobro] = useState<CobroPrevisto | undefined>(undefined)

  const estancia = useMemo(() => estancias.find((e) => e.id === estanciaId), [estancias, estanciaId])
  const [lavadoHoy, setLavadoHoy] = useState<LavadoHoy | undefined>(undefined)
  const [suscripcion, setSuscripcion] = useState<SuscripcionParqueadero | undefined>(undefined)

  useEffect(() => {
    let cancelado = false
    const placa = estancia?.placa ?? ''
    fetchLavadoHoyPorPlaca(placa)
      .then((l) => {
        if (!cancelado) setLavadoHoy(l)
      })
      .catch(() => {})
    fetchSuscripcionActivaPorPlaca(placa)
      .then((sub) => {
        if (!cancelado) setSuscripcion(sub)
      })
      .catch(() => {})
    return () => {
      cancelado = true
    }
  }, [estancia])

  // El cobro lo calcula la base (tarifa por clase + multa si salió tarde) — la misma cuenta que
  // hará al confirmar. La pantalla solo lo muestra.
  useEffect(() => {
    let cancelado = false
    if (!estancia) return
    fetchCobroPrevisto(estancia.id)
      .then((c) => {
        if (!cancelado) setCobro(c)
      })
      .catch((err) => toast.desdeError(err, 'No se pudo calcular el cobro'))
    return () => {
      cancelado = true
    }
  }, [estancia])

  const total = estancia && cobro ? cobro.total : 0

  async function handleSubmit() {
    if (!estancia || !cobro) return
    if (enVueloRef.current) return
    enVueloRef.current = true
    setSaving(true)
    try {
      const actualizada = await registrarSalida(estancia.id, total > 0 ? metodoPago : undefined)
      toast.exito('Salida registrada')
      onSaved(actualizada)
    } catch (err) {
      toast.desdeError(err, 'No se pudo registrar la salida')
      enVueloRef.current = false
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalSheet title="Registrar salida" onClose={onClose}>
      <div className="flex flex-col gap-4">
        {!seleccionada ? (
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-neutral-700">Placa</span>
            <CustomSelect
              value={estanciaId}
              onChange={(id) => {
                setCobro(undefined)
                setEstanciaId(id)
              }}
              placeholder="Selecciona un vehículo…"
              options={estancias.map((e) => ({
                value: e.id,
                label: `${e.placa} — ${CLASE_VEHICULO_LABEL[e.claseVehiculo]} · ${MODALIDAD_LABEL[e.modalidad]}`,
              }))}
            />
          </label>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-lg font-semibold text-neutral-900">{estancia?.placa}</span>
            {estancia ? (
              <>
                <span className="inline-flex rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-700">
                  {CLASE_VEHICULO_LABEL[estancia.claseVehiculo]}
                </span>
                <span className="inline-flex rounded-full bg-primary-50 px-2 py-0.5 text-xs font-medium text-primary-700">
                  {MODALIDAD_LABEL[estancia.modalidad]}
                </span>
                <span className="font-mono text-xs text-neutral-400">PAR-{estancia.consecutivo}</span>
              </>
            ) : null}
          </div>
        )}

        {estancia && cobro?.fueraDeVentana ? (
          <p className="flex items-start gap-1.5 rounded-lg bg-warning-50 px-3 py-2 text-xs text-warning-700">
            <AlertTriangle size={13} className="mt-0.5 shrink-0" />
            {cobro.multa > 0
              ? `Salió después de las 8:00 am: se suma la multa de ${COP.format(cobro.multa)}.`
              : 'Salió después de las 8:00 am. La multa todavía no tiene valor definido, así que no se cobra.'}
          </p>
        ) : null}

        {suscripcion ? <AvisoSuscripcion sus={suscripcion} /> : null}
        {lavadoHoy ? <AvisoLavadoHoy lavado={lavadoHoy} enSalida /> : null}

        {estancia && !cobro ? <p className="text-center text-xs text-neutral-400">Calculando cobro…</p> : null}

        {estancia && cobro && total > 0 ? (
          <>
            <div className="flex flex-col gap-1.5 rounded-lg bg-primary-50 px-3 py-2.5 text-sm">
              {cobro.multa > 0 ? (
                <>
                  <div className="flex justify-between text-primary-900">
                    <span>Tarifa</span>
                    <span className="tabular-nums">{COP.format(cobro.tarifa)}</span>
                  </div>
                  <div className="flex justify-between text-primary-900">
                    <span>Multa</span>
                    <span className="tabular-nums">{COP.format(cobro.multa)}</span>
                  </div>
                </>
              ) : null}
              <div className="flex justify-between font-semibold text-primary-900">
                <span>Cobrar</span>
                <span className="tabular-nums">{COP.format(total)}</span>
              </div>
            </div>
            <div className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-neutral-700">Método de pago</span>
              <div className="grid grid-cols-3 gap-2">
                {(['efectivo', 'transferencia', 'datafono'] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setMetodoPago(value)}
                    className={`rounded-xl border px-3 py-3 text-sm font-medium transition-colors ${
                      metodoPago === value
                        ? 'border-primary-600 bg-primary-50 text-primary-700'
                        : 'border-neutral-200 text-neutral-600 hover:bg-neutral-50'
                    }`}
                  >
                    {METODO_PAGO_LABEL[value]}
                  </button>
                ))}
              </div>
            </div>
          </>
        ) : estancia && cobro ? (
          <p className="rounded-lg bg-neutral-50 px-3 py-2.5 text-center text-sm text-neutral-600">
            Sin cobro en la salida ({MODALIDAD_LABEL[estancia.modalidad].toLowerCase()}).
          </p>
        ) : null}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={!estancia || !cobro || saving}
          className="mt-1 w-full rounded-xl bg-primary-600 py-3.5 text-sm font-semibold text-white shadow-nav-active transition-colors hover:bg-primary-700 disabled:opacity-60"
        >
          {saving ? 'Registrando…' : total > 0 ? `Cobrar ${COP.format(total)} y dar salida` : 'Confirmar salida'}
        </button>
      </div>
    </ModalSheet>
  )
}

// Hoja modal del parqueadero sobre el Modal común: hoja anclada abajo en celular, centrada en escritorio.
function ModalSheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <Modal title={title} size="sm" onClose={onClose}>
      {children}
    </Modal>
  )
}
