import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import {
  AlertTriangle,
  ArrowRightLeft,
  Banknote,
  Bike,
  Car,
  CheckCircle2,
  ChevronRight,
  CreditCard,
  HelpCircle,
  History,
  MessageCircle,
  Pencil,
  Phone,
  Plus,
  Truck,
  UserRound,
  type LucideIcon,
} from 'lucide-react'
import {
  actualizarSuscripcion,
  confirmarPagoCiclo,
  crearSuscripcion,
  fetchPagosSuscripcion,
  fetchUltimosPagos,
  fetchSuscripciones,
  renovarSuscripcion,
  setSuscripcionActiva,
} from '../../data/suscripcionesParqueadero'
import { fetchTarifasParqueadero } from '../../data/tarifasParqueadero'
import {
  actualizarSuscripcionInputSchema,
  construirMensajeSuscripcion,
  CONDICION_LABEL,
  crearSuscripcionInputSchema,
  diasParaVencer,
  ESTADO_VIGENCIA_LABEL,
  estadoPago,
  estadoVigencia,
  periodoDeRenovacion,
  sumarUnMes,
  textoVencimiento,
  TITULAR_SIN_REGISTRAR,
  type EstadoVigencia,
  type ModalidadSuscripcion,
  type PagoSuscripcion,
  type SuscripcionParqueadero,
} from '../../schemas/suscripcionParqueadero'
import { CLASE_VEHICULO_LABEL, type ClaseVehiculoParqueadero } from '../../schemas/estanciaParqueadero'
import type { MetodoPagoBase } from '../../schemas/orden'
import type { TarifaParqueadero } from '../../schemas/tarifaParqueadero'
import { Button } from '../layout/Button'
import { Card } from '../layout/Card'
import { ConfirmModal } from '../layout/ConfirmModal'
import { DatePicker } from '../layout/DatePicker'
import { BarraFiltros, FiltroBusqueda, FiltroMenu } from '../layout/Filtros'
import { Modal } from '../layout/Modal'
import { COP } from '../../lib/formato'
import { METODO_PAGO_LABEL } from '../../lib/metodoPago'
import { fechaLocalISO } from '../../lib/periodo'
import { whatsappHref } from '../../lib/whatsapp'
import { toast } from '../../lib/toast'

type EstadoFila = EstadoVigencia | 'inactiva'

const CLASES: ClaseVehiculoParqueadero[] = ['carro', 'moto', 'motocarro']
const CONDICIONES: ModalidadSuscripcion[] = ['mensualidad', 'fijo']
const METODOS: MetodoPagoBase[] = ['efectivo', 'transferencia', 'datafono']

const ICONO_CLASE: Record<ClaseVehiculoParqueadero, LucideIcon> = { carro: Car, moto: Bike, motocarro: Truck }
const ICONO_METODO: Record<MetodoPagoBase, LucideIcon> = {
  efectivo: Banknote,
  transferencia: ArrowRightLeft,
  datafono: CreditCard,
}

const BADGE: Record<EstadoFila, string> = {
  vigente: 'bg-success-50 text-success-700',
  por_vencer: 'bg-warning-50 text-warning-700',
  vencida: 'bg-danger-50 text-danger-700',
  inactiva: 'bg-neutral-100 text-neutral-500',
}

const INPUT_CLASS =
  'rounded-lg border border-neutral-300 px-3 py-2.5 text-sm outline-none transition-colors focus:border-primary-500 focus:ring-1 focus:ring-primary-500'

function fmtFecha(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })
}

function estadoDe(sus: SuscripcionParqueadero): EstadoFila {
  return sus.activo ? estadoVigencia(sus.fechaFin) : 'inactiva'
}

function etiquetaEstado(estado: EstadoFila): string {
  return estado === 'inactiva' ? 'Inactiva' : ESTADO_VIGENCIA_LABEL[estado]
}

function precioDe(
  tarifas: TarifaParqueadero[],
  clase: ClaseVehiculoParqueadero,
  modalidad: ModalidadSuscripcion,
): number | undefined {
  return tarifas.find((t) => t.claseVehiculo === clase && t.modalidad === modalidad)?.precio
}

interface Props {
  /** Solo gerencia puede registrar un pago o una suscripción con fecha pasada (carga de datos
   *  viejos); para jefe de patio y vigilante la base siempre usa hoy. */
  puedeFecharAtras?: boolean
}

// Suscripciones de parqueadero (mensualidad y fijo 24h). El valor SIEMPRE sale de la tarifa de la
// clase de vehículo y la condición — nadie lo digita. Tocar una fila abre todo en un modal:
// cobrar la renovación (con su método de pago), avisar por WhatsApp, ver el historial de pagos,
// editar los datos e inactivar. La usan gerencia, jefe de patio y vigilante: a cualquiera de los
// tres le pueden pagar.
export function SuscriptoresParqueadero({ puedeFecharAtras = false }: Props) {
  const [suscripciones, setSuscripciones] = useState<SuscripcionParqueadero[] | null>(null)
  const [tarifas, setTarifas] = useState<TarifaParqueadero[]>([])
  const [ultimosPagos, setUltimosPagos] = useState<Map<string, PagoSuscripcion>>(new Map())
  const [abiertaId, setAbiertaId] = useState<string | null>(null)
  const [creando, setCreando] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const [filtroEstado, setFiltroEstado] = useState('')

  useEffect(() => {
    fetchSuscripciones()
      .then(setSuscripciones)
      .catch((err) => toast.desdeError(err, 'No se pudieron cargar las suscripciones'))
    fetchUltimosPagos()
      .then(setUltimosPagos)
      .catch((err) => toast.desdeError(err, 'No se pudieron cargar los pagos'))
    fetchTarifasParqueadero()
      .then(setTarifas)
      .catch((err) => toast.desdeError(err, 'No se pudieron cargar las tarifas'))
  }, [])

  const refresh = useCallback(async () => {
    const [lista, pagos] = await Promise.all([fetchSuscripciones(), fetchUltimosPagos()])
    setSuscripciones(lista)
    setUltimosPagos(pagos)
  }, [])

  const lista = useMemo(() => suscripciones ?? [], [suscripciones])
  const conteo = useMemo(() => {
    const activas = lista.filter((s) => s.activo)
    return {
      activas: activas.length,
      porVencer: activas.filter((s) => estadoVigencia(s.fechaFin) === 'por_vencer').length,
      vencidas: activas.filter((s) => estadoVigencia(s.fechaFin) === 'vencida').length,
    }
  }, [lista])

  const visibles = useMemo(() => {
    const q = busqueda.trim().toUpperCase()
    return lista.filter((s) => {
      if (q && !s.placa.includes(q) && !s.titular.toUpperCase().includes(q)) return false
      if (filtroEstado && estadoDe(s) !== filtroEstado) return false
      return true
    })
  }, [lista, busqueda, filtroEstado])

  const abierta = lista.find((s) => s.id === abiertaId)

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-neutral-900">Suscriptores</h2>
          <p className="text-sm text-neutral-500">
            Mensualidades y fijos 24h. Toca uno para cobrar la renovación, avisarle o ver sus pagos.
          </p>
        </div>
        <Button variant="primary" icon={Plus} onClick={() => setCreando(true)}>
          Nueva suscripción
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Resumen etiqueta="Activas" valor={conteo.activas} tono="neutral" />
        <Resumen etiqueta="Por vencer (7 días)" valor={conteo.porVencer} tono={conteo.porVencer > 0 ? 'warning' : 'neutral'} />
        <Resumen etiqueta="Vencidas" valor={conteo.vencidas} tono={conteo.vencidas > 0 ? 'danger' : 'neutral'} />
      </div>

      <BarraFiltros
        activos={[busqueda, filtroEstado].filter(Boolean).length}
        onLimpiar={() => {
          setBusqueda('')
          setFiltroEstado('')
        }}
        resultado={`${visibles.length} de ${lista.length}`}
      >
        <FiltroBusqueda value={busqueda} onChange={setBusqueda} placeholder="Placa o titular" ancho="sm:w-52" />
        <FiltroMenu
          label="Estado"
          value={filtroEstado}
          onChange={setFiltroEstado}
          options={[
            { value: 'vigente', label: 'Al día' },
            { value: 'por_vencer', label: 'Por vencer' },
            { value: 'vencida', label: 'Vencida' },
            { value: 'inactiva', label: 'Inactiva' },
          ]}
        />
      </BarraFiltros>

      {suscripciones === null ? (
        <Card className="py-10 text-center text-sm text-neutral-400">Cargando suscriptores…</Card>
      ) : visibles.length === 0 ? (
        <Card className="py-10 text-center text-sm text-neutral-400">
          {lista.length === 0 ? 'Todavía no hay suscriptores.' : 'Ninguna suscripción coincide con el filtro.'}
        </Card>
      ) : (
        <ul className="flex flex-col gap-2">
          {visibles.map((sus) => (
            <FilaSuscripcion key={sus.id} sus={sus} ultimo={ultimosPagos.get(sus.id)} onAbrir={() => setAbiertaId(sus.id)} />
          ))}
        </ul>
      )}

      {creando ? (
        <NuevaSuscripcionModal
          tarifas={tarifas}
          puedeFecharAtras={puedeFecharAtras}
          onClose={() => setCreando(false)}
          onCreada={async () => {
            setCreando(false)
            await refresh()
          }}
        />
      ) : null}

      {abierta ? (
        <DetalleSuscripcionModal
          sus={abierta}
          ultimo={ultimosPagos.get(abierta.id)}
          tarifas={tarifas}
          puedeFecharAtras={puedeFecharAtras}
          onClose={() => setAbiertaId(null)}
          onCambio={refresh}
        />
      ) : null}
    </section>
  )
}

function Resumen({ etiqueta, valor, tono }: { etiqueta: string; valor: number; tono: 'neutral' | 'warning' | 'danger' }) {
  const color = tono === 'danger' ? 'text-danger-700' : tono === 'warning' ? 'text-warning-700' : 'text-neutral-900'
  return (
    <Card className="flex flex-col gap-0.5 p-4">
      <span className="text-xs font-medium text-neutral-500">{etiqueta}</span>
      <span className={`text-2xl font-semibold tabular-nums ${color}`}>{valor}</span>
    </Card>
  )
}

function FilaSuscripcion({
  sus,
  ultimo,
  onAbrir,
}: {
  sus: SuscripcionParqueadero
  ultimo: PagoSuscripcion | undefined
  onAbrir: () => void
}) {
  const estado = estadoDe(sus)
  const Icono = ICONO_CLASE[sus.claseVehiculo]
  const dias = diasParaVencer(sus.fechaFin)

  return (
    <li>
      <button
        type="button"
        onClick={onAbrir}
        className={`flex w-full items-center gap-3 rounded-2xl border border-neutral-200 bg-white p-3.5 text-left shadow-card transition-shadow hover:border-primary-200 hover:shadow-card-hover sm:gap-4 sm:p-4 ${
          sus.activo ? '' : 'opacity-70'
        }`}
      >
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-600">
          <Icono size={20} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <span className="font-mono text-base font-bold text-neutral-900">{sus.placa}</span>
            <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${BADGE[estado]}`}>{etiquetaEstado(estado)}</span>
          </span>
          <span className="truncate text-sm text-neutral-600">
            {sus.titular}
            {sus.telefono ? <span className="text-neutral-400"> · {sus.telefono}</span> : null}
          </span>
          <span className="text-xs text-neutral-400">
            {CLASE_VEHICULO_LABEL[sus.claseVehiculo]} · {CONDICION_LABEL[sus.modalidad].titulo} · {COP.format(sus.valor)}
          </span>
          <BanderaPago sus={sus} ultimo={ultimo} />
        </span>
        <span className="hidden shrink-0 flex-col items-end gap-0.5 text-right sm:flex">
          <span className="text-sm font-medium text-neutral-800">Vence {fmtFecha(sus.fechaFin)}</span>
          {sus.activo ? (
            <span
              className={`text-xs font-medium ${
                estado === 'vencida' ? 'text-danger-700' : estado === 'por_vencer' ? 'text-warning-700' : 'text-neutral-400'
              }`}
            >
              {textoVencimiento(dias)}
            </span>
          ) : null}
        </span>
        <ChevronRight size={18} className="shrink-0 text-neutral-300" />
      </button>
      {/* En celular la vigencia baja a su propia línea para no apretar la placa. */}
      <p className="-mt-1 px-4 pb-1 text-xs text-neutral-400 sm:hidden">
        Vence {fmtFecha(sus.fechaFin)}
        {sus.activo ? ` · ${textoVencimiento(dias)}` : ''}
      </p>
    </li>
  )
}

// "Último pago registrado" (verde) cuando hay un pago que cubre el ciclo actual; "Pago sin confirmar"
// (ámbar) cuando no — típico de las suscripciones cargadas sin saber si ya habían pagado.
function BanderaPago({ sus, ultimo }: { sus: SuscripcionParqueadero; ultimo: PagoSuscripcion | undefined }) {
  if (estadoPago(sus, ultimo) === 'registrado' && ultimo) {
    return (
      <span className="mt-1 flex w-fit items-center gap-1 rounded-md bg-success-50 px-2 py-0.5 text-xs font-medium text-success-700">
        <CheckCircle2 size={12} /> Último pago registrado · {fmtFecha(ultimo.fechaPago)}
      </span>
    )
  }
  return (
    <span className="mt-1 flex w-fit items-center gap-1 rounded-md bg-warning-50 px-2 py-0.5 text-xs font-medium text-warning-700">
      <HelpCircle size={12} /> Pago sin confirmar
      {ultimo ? <span className="font-normal text-warning-700/80"> · último: {fmtFecha(ultimo.fechaPago)}</span> : null}
    </span>
  )
}

function SelectorMetodo({ value, onChange }: { value: MetodoPagoBase; onChange: (m: MetodoPagoBase) => void }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {METODOS.map((m) => {
        const Icono = ICONO_METODO[m]
        const activo = value === m
        return (
          <button
            key={m}
            type="button"
            onClick={() => onChange(m)}
            className={`flex flex-col items-center gap-1 rounded-xl border px-2 py-2.5 text-xs font-medium transition-colors sm:flex-row sm:justify-center sm:gap-2 sm:text-sm ${
              activo
                ? 'border-primary-600 bg-primary-50 text-primary-700'
                : 'border-neutral-200 text-neutral-600 hover:bg-neutral-50'
            }`}
          >
            <Icono size={16} />
            {METODO_PAGO_LABEL[m]}
          </button>
        )
      })}
    </div>
  )
}

function SelectorClase({
  value,
  onChange,
}: {
  value: ClaseVehiculoParqueadero
  onChange: (c: ClaseVehiculoParqueadero) => void
}) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {CLASES.map((c) => {
        const Icono = ICONO_CLASE[c]
        return (
          <button
            key={c}
            type="button"
            onClick={() => onChange(c)}
            className={`flex flex-col items-center gap-1.5 rounded-xl border px-3 py-3 text-sm font-medium transition-colors ${
              value === c ? 'border-primary-600 bg-primary-50 text-primary-700' : 'border-neutral-200 text-neutral-600 hover:bg-neutral-50'
            }`}
          >
            <Icono size={20} />
            {CLASE_VEHICULO_LABEL[c]}
          </button>
        )
      })}
    </div>
  )
}

// Condición con su tarifa para la clase elegida, para que se vea cuánto vale cada una antes de elegir.
function SelectorCondicion({
  value,
  onChange,
  tarifas,
  clase,
}: {
  value: ModalidadSuscripcion
  onChange: (c: ModalidadSuscripcion) => void
  tarifas: TarifaParqueadero[]
  clase: ClaseVehiculoParqueadero
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {CONDICIONES.map((c) => {
        const precio = precioDe(tarifas, clase, c)
        return (
          <button
            key={c}
            type="button"
            onClick={() => onChange(c)}
            className={`flex items-start justify-between gap-3 rounded-xl border px-3.5 py-3 text-left transition-colors ${
              value === c ? 'border-primary-600 bg-primary-50' : 'border-neutral-200 hover:bg-neutral-50'
            }`}
          >
            <span className="flex flex-col gap-0.5">
              <span className={`text-sm font-semibold ${value === c ? 'text-primary-700' : 'text-neutral-800'}`}>
                {CONDICION_LABEL[c].titulo}
              </span>
              <span className="text-xs text-neutral-500">{CONDICION_LABEL[c].detalle}</span>
            </span>
            <span className="shrink-0 text-sm font-semibold tabular-nums text-neutral-800">
              {precio !== undefined ? COP.format(precio) : 'Sin tarifa'}
            </span>
          </button>
        )
      })}
    </div>
  )
}

function Seccion({ titulo, icono: Icono, children }: { titulo: string; icono: LucideIcon; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-neutral-900">
        <Icono size={15} className="text-primary-600" />
        {titulo}
      </h3>
      {children}
    </section>
  )
}

function NuevaSuscripcionModal({
  tarifas,
  puedeFecharAtras,
  onClose,
  onCreada,
}: {
  tarifas: TarifaParqueadero[]
  puedeFecharAtras: boolean
  onClose: () => void
  onCreada: () => Promise<void>
}) {
  const hoy = fechaLocalISO(new Date())
  const [placa, setPlaca] = useState('')
  const [titular, setTitular] = useState('')
  const [telefono, setTelefono] = useState('')
  const [clase, setClase] = useState<ClaseVehiculoParqueadero>('carro')
  const [condicion, setCondicion] = useState<ModalidadSuscripcion>('mensualidad')
  const [fechaInicio, setFechaInicio] = useState(hoy)
  const [metodo, setMetodo] = useState<MetodoPagoBase>('efectivo')
  const [nota, setNota] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const enVuelo = useRef(false)

  const precio = precioDe(tarifas, clase, condicion)
  const inicio = puedeFecharAtras ? fechaInicio : hoy

  async function guardar(e: FormEvent) {
    e.preventDefault()
    if (enVuelo.current) return
    if (precio === undefined) {
      setError('Esa clase y condición no tienen tarifa definida.')
      return
    }
    const parsed = crearSuscripcionInputSchema.safeParse({
      placa,
      titular,
      telefono: telefono || undefined,
      claseVehiculo: clase,
      modalidad: condicion,
      fechaInicio: inicio,
      metodoPago: metodo,
      nota: nota || undefined,
    })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Revisa los datos')
      return
    }
    setError(null)
    enVuelo.current = true
    setGuardando(true)
    try {
      await crearSuscripcion(parsed.data)
      toast.exito(`Suscripción de ${parsed.data.placa} creada y pago registrado`)
      await onCreada()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear la suscripción')
      toast.desdeError(err, 'No se pudo crear la suscripción')
    } finally {
      enVuelo.current = false
      setGuardando(false)
    }
  }

  return (
    <Modal
      title="Nueva suscripción"
      subtitle="El valor sale de la tarifa; se cobra el primer mes ahora."
      icon={Plus}
      size="lg"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" loading={guardando} disabled={precio === undefined} onClick={guardar}>
            {precio !== undefined ? `Crear y cobrar ${COP.format(precio)}` : 'Sin tarifa'}
          </Button>
        </>
      }
    >
      <form onSubmit={guardar} className="flex flex-col gap-6">
        <div className="grid gap-5 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-neutral-700">Placa</span>
            <input
              autoFocus
              value={placa}
              onChange={(e) => setPlaca(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
              placeholder="ABC123"
              className={`${INPUT_CLASS} font-mono uppercase`}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-neutral-700">Teléfono</span>
            <input
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              placeholder="Para avisarle por WhatsApp"
              className={INPUT_CLASS}
            />
          </label>
        </div>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-neutral-700">Titular</span>
          <input value={titular} onChange={(e) => setTitular(e.target.value)} placeholder="Nombre completo" className={INPUT_CLASS} />
        </label>

        <div className="flex flex-col gap-2 text-sm">
          <span className="font-medium text-neutral-700">Tipo de vehículo</span>
          <SelectorClase value={clase} onChange={setClase} />
        </div>

        <div className="flex flex-col gap-2 text-sm">
          <span className="font-medium text-neutral-700">Condición</span>
          <SelectorCondicion value={condicion} onChange={setCondicion} tarifas={tarifas} clase={clase} />
        </div>

        <div
          className={`flex items-center justify-between gap-3 rounded-xl px-4 py-3.5 ${
            precio !== undefined ? 'bg-primary-50' : 'bg-warning-50'
          }`}
        >
          <div className="text-sm">
            <p className={`font-medium ${precio !== undefined ? 'text-primary-900' : 'text-warning-700'}`}>
              {precio !== undefined ? 'Valor del mes' : 'Sin tarifa definida'}
            </p>
            <p className="text-xs text-neutral-500">
              {precio !== undefined
                ? `Tarifa de ${CLASE_VEHICULO_LABEL[clase].toLowerCase()} · ${CONDICION_LABEL[condicion].titulo.toLowerCase()}`
                : 'Gerencia la define en Catálogo y precios › Parqueadero.'}
            </p>
          </div>
          {precio !== undefined ? (
            <span className="text-xl font-semibold tabular-nums text-primary-900">{COP.format(precio)}</span>
          ) : null}
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-neutral-700">Inicia</span>
            {puedeFecharAtras ? (
              <DatePicker size="sm" value={fechaInicio} onChange={setFechaInicio} max={hoy} />
            ) : (
              <p className="rounded-lg bg-neutral-50 px-3 py-2.5 text-neutral-700">Hoy · {fmtFecha(hoy)}</p>
            )}
          </div>
          <div className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-neutral-700">Vence</span>
            <p className="rounded-lg bg-neutral-50 px-3 py-2.5 text-neutral-700">{fmtFecha(sumarUnMes(inicio))}</p>
          </div>
        </div>

        <div className="flex flex-col gap-2 text-sm">
          <span className="font-medium text-neutral-700">¿Cómo pagó?</span>
          <SelectorMetodo value={metodo} onChange={setMetodo} />
        </div>

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-neutral-700">
            Nota <span className="font-normal text-neutral-400">(opcional)</span>
          </span>
          <input value={nota} onChange={(e) => setNota(e.target.value)} className={INPUT_CLASS} />
        </label>

        {error ? <p className="rounded-lg bg-danger-50 px-3 py-2.5 text-sm text-danger-700">{error}</p> : null}
        <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
      </form>
    </Modal>
  )
}

// El camino normal es COBRAR: el cliente paga ahora, se extiende la vigencia y entra a la caja.
// ANOTAR es la excepción: el periodo vigente se cobró y no quedó registrado — no mueve el
// vencimiento ni entra a la caja del turno. Solo se ofrece cuando ese periodo no tiene pago.
type ModoPago = 'cobrar' | 'anotar'

function DetalleSuscripcionModal({
  sus,
  ultimo,
  tarifas,
  puedeFecharAtras,
  onClose,
  onCambio,
}: {
  sus: SuscripcionParqueadero
  ultimo: PagoSuscripcion | undefined
  tarifas: TarifaParqueadero[]
  puedeFecharAtras: boolean
  onClose: () => void
  onCambio: () => Promise<void>
}) {
  const hoy = fechaLocalISO(new Date())
  const sinConfirmar = estadoPago(sus, ultimo) === 'sin_confirmar' && sus.activo
  const estado = estadoDe(sus)
  const [pagos, setPagos] = useState<PagoSuscripcion[] | null>(null)
  const [modoElegido, setModo] = useState<ModoPago>('cobrar')
  const [clase, setClase] = useState<ClaseVehiculoParqueadero>(sus.claseVehiculo)
  const [condicion, setCondicion] = useState<ModalidadSuscripcion>(sus.modalidad)
  const [metodo, setMetodo] = useState<MetodoPagoBase>('efectivo')
  const [fechaPago, setFechaPago] = useState(hoy)
  const [registrando, setRegistrando] = useState(false)
  const [editando, setEditando] = useState(false)
  const [confirmandoEstado, setConfirmandoEstado] = useState(false)
  const enVuelo = useRef(false)

  // Si el periodo ya quedó con pago (p. ej. recién anotado), no hay nada que anotar.
  const modo: ModoPago = sinConfirmar ? modoElegido : 'cobrar'
  const anotando = modo === 'anotar'
  const dias = diasParaVencer(sus.fechaFin)
  const cambiaPlan = clase !== sus.claseVehiculo || condicion !== sus.modalidad
  const tarifaPlan = precioDe(tarifas, clase, condicion)
  // Anotar sin cambio de plan conserva el valor con que quedó la suscripción; lo demás sale de la tarifa.
  const monto = anotando && !cambiaPlan ? sus.valor : tarifaPlan
  // Gerencia puede fechar cualquier pago; al anotar se le pregunta a todos cuándo pagó. Un cobro
  // del jefe de patio o del vigilante siempre es de hoy (lo fija la base).
  const pideFecha = anotando || puedeFecharAtras
  const fechaEfectiva = pideFecha ? fechaPago : hoy
  const periodo = anotando ? { inicio: sus.fechaInicio, fin: sus.fechaFin } : periodoDeRenovacion(sus, fechaEfectiva)
  const Icono = ICONO_CLASE[sus.claseVehiculo]

  const cargarPagos = useCallback(async () => {
    setPagos(await fetchPagosSuscripcion(sus.id))
  }, [sus.id])

  useEffect(() => {
    fetchPagosSuscripcion(sus.id)
      .then(setPagos)
      .catch((err) => toast.desdeError(err, 'No se pudo cargar el historial de pagos'))
  }, [sus.id])

  async function registrar() {
    if (enVuelo.current || monto === undefined) return
    enVuelo.current = true
    setRegistrando(true)
    const plan = cambiaPlan ? { claseVehiculo: clase, modalidad: condicion } : undefined
    try {
      if (anotando) {
        await confirmarPagoCiclo(sus.id, metodo, fechaEfectiva, plan)
        toast.exito(`Pago de ${sus.placa} anotado (${fmtFecha(periodo.inicio)} → ${fmtFecha(periodo.fin)})`)
        setModo('cobrar')
      } else {
        await renovarSuscripcion(sus.id, metodo, fechaEfectiva, plan)
        toast.exito(`${sus.placa} pagada hasta el ${fmtFecha(periodo.fin)}`)
      }
      await Promise.all([onCambio(), cargarPagos()])
    } catch (err) {
      toast.desdeError(err, 'No se pudo registrar el pago')
    } finally {
      enVuelo.current = false
      setRegistrando(false)
    }
  }

  const totalPagado = pagos?.reduce((suma, p) => suma + p.monto, 0) ?? 0

  return (
    <>
    <Modal
      title={<span className="font-mono">{sus.placa}</span>}
      subtitle={sus.titular}
      icon={Icono}
      size="lg"
      onClose={onClose}
      footer={
        <div className="flex w-full items-center justify-between gap-3">
          <Button variant={sus.activo ? 'danger-ghost' : 'secondary'} onClick={() => setConfirmandoEstado(true)}>
            {sus.activo ? 'Inactivar' : 'Activar'}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cerrar
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-7">
        {/* 1. Cómo está hoy: hasta cuándo puede entrar y con qué plan. */}
        <div className="grid gap-4 rounded-xl border border-neutral-200 p-4 sm:grid-cols-[1fr_auto]">
          <div className="flex flex-col gap-1">
            <span className={`w-fit rounded-md px-2 py-0.5 text-xs font-medium ${BADGE[estado]}`}>{etiquetaEstado(estado)}</span>
            <p className="mt-1 text-xs text-neutral-500">{estado === 'vencida' ? 'Venció el' : 'Puede entrar hasta el'}</p>
            <p className="text-lg font-semibold text-neutral-900">{fmtFecha(sus.fechaFin)}</p>
            {sus.activo ? (
              <p
                className={`text-xs font-medium ${
                  estado === 'vencida' ? 'text-danger-700' : estado === 'por_vencer' ? 'text-warning-700' : 'text-neutral-400'
                }`}
              >
                {textoVencimiento(dias)}
              </p>
            ) : (
              <p className="text-xs text-neutral-400">Cobrarle la vuelve a activar.</p>
            )}
          </div>
          <div className="flex flex-col sm:items-end sm:text-right">
            <p className="text-xs text-neutral-500">Plan</p>
            <p className="text-sm font-medium text-neutral-800">
              {CLASE_VEHICULO_LABEL[sus.claseVehiculo]} · {CONDICION_LABEL[sus.modalidad].titulo}
            </p>
            <p className="text-xl font-semibold tabular-nums text-neutral-900">{COP.format(sus.valor)}</p>
          </div>
        </div>

        {/* 2. Excepción: el periodo vigente no tiene pago anotado. */}
        {sinConfirmar && !anotando ? (
          <div className="flex flex-col gap-3 rounded-xl bg-warning-50 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
            <p className="flex items-start gap-2 text-sm text-warning-700">
              <HelpCircle size={16} className="mt-0.5 shrink-0" />
              <span>
                No hay pago anotado del {fmtFecha(sus.fechaInicio)} al {fmtFecha(sus.fechaFin)}. Si ya lo había pagado, anótalo
                para que no figure como deuda.
              </span>
            </p>
            <Button size="sm" onClick={() => setModo('anotar')}>
              Ya lo pagó, anotarlo
            </Button>
          </div>
        ) : null}

        {/* 3. Un solo formulario: lo que cubre → plan → cuándo y cómo → un botón. */}
        <Seccion titulo={anotando ? 'Anotar un pago que ya recibió' : 'Cobrar'} icono={anotando ? History : Banknote}>
          <div className="flex items-center justify-between gap-3 rounded-xl border border-neutral-200 px-4 py-3">
            <div>
              <p className="text-xs text-neutral-500">Este pago cubre</p>
              <p className="text-base font-semibold text-neutral-900">
                {fmtFecha(periodo.inicio)} → {fmtFecha(periodo.fin)}
              </p>
              <p className="text-xs text-neutral-500">
                {anotando
                  ? 'No cambia la fecha de vencimiento ni entra a tu caja.'
                  : `Queda pagado hasta el ${fmtFecha(periodo.fin)} · entra a tu caja.`}
              </p>
            </div>
            {anotando ? (
              <button
                type="button"
                onClick={() => setModo('cobrar')}
                className="shrink-0 text-sm font-medium text-primary-700 transition-colors hover:text-primary-800"
              >
                Mejor cobrar
              </button>
            ) : null}
          </div>

          <div className="flex flex-col gap-2 text-sm">
            <span className="font-medium text-neutral-700">¿Qué plan paga?</span>
            <SelectorClase value={clase} onChange={setClase} />
            <SelectorCondicion value={condicion} onChange={setCondicion} tarifas={tarifas} clase={clase} />
            {cambiaPlan ? (
              <p className="flex items-start gap-2 rounded-lg bg-warning-50 px-3 py-2.5 text-xs text-warning-700">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                <span>
                  Cambia el plan: de {CLASE_VEHICULO_LABEL[sus.claseVehiculo].toLowerCase()} ·{' '}
                  {CONDICION_LABEL[sus.modalidad].titulo.toLowerCase()} ({COP.format(sus.valor)}) a{' '}
                  {CLASE_VEHICULO_LABEL[clase].toLowerCase()} · {CONDICION_LABEL[condicion].titulo.toLowerCase()}
                  {tarifaPlan !== undefined ? ` (${COP.format(tarifaPlan)})` : ''}. Queda así para los próximos pagos.
                </span>
              </p>
            ) : null}
          </div>

          <div className={`grid gap-4 ${pideFecha ? 'sm:grid-cols-[14rem_1fr]' : ''}`}>
            {pideFecha ? (
              <div className="flex flex-col gap-1.5 text-sm">
                <span className="font-medium text-neutral-700">¿Cuándo pagó?</span>
                <DatePicker size="sm" value={fechaPago} onChange={setFechaPago} max={hoy} />
              </div>
            ) : null}
            <div className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-neutral-700">¿Cómo pagó?</span>
              <SelectorMetodo value={metodo} onChange={setMetodo} />
            </div>
          </div>

          {monto === undefined ? (
            <p className="flex items-start gap-2 rounded-lg bg-warning-50 px-3 py-2.5 text-sm text-warning-700">
              <AlertTriangle size={15} className="mt-0.5 shrink-0" />
              Ese plan no tiene tarifa definida; gerencia la define en Catálogo y precios › Parqueadero.
            </p>
          ) : (
            <Button variant="primary" icon={CheckCircle2} loading={registrando} onClick={registrar}>
              {anotando ? `Anotar pago de ${COP.format(monto)}` : `Cobrar ${COP.format(monto)}`} · {METODO_PAGO_LABEL[metodo]}
            </Button>
          )}
        </Seccion>

        <Seccion titulo="Dueño del vehículo" icono={UserRound}>
          {editando ? (
            <FormularioDatos
              sus={sus}
              onCancelar={() => setEditando(false)}
              onGuardado={async () => {
                setEditando(false)
                await onCambio()
              }}
            />
          ) : (
            <TarjetaContacto sus={sus} pagos={pagos} onEditar={() => setEditando(true)} />
          )}
        </Seccion>

        <Seccion titulo="Historial de pagos" icono={History}>
          {pagos === null ? (
            <p className="py-4 text-center text-sm text-neutral-400">Cargando…</p>
          ) : pagos.length === 0 ? (
            <p className="py-4 text-center text-sm text-neutral-400">Sin pagos registrados.</p>
          ) : (
            <>
              <ul className="flex flex-col divide-y divide-neutral-100 rounded-xl border border-neutral-100">
                {pagos.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 px-3.5 py-3 text-sm">
                    <div className="min-w-0">
                      <p className="font-medium text-neutral-800">
                        {fmtFecha(p.periodoInicio)} → {fmtFecha(p.periodoFin)}
                      </p>
                      <p className="text-xs text-neutral-400">
                        Pagó el {fmtFecha(p.fechaPago)} · {p.metodoPago ? METODO_PAGO_LABEL[p.metodoPago] : 'Método sin registrar'}
                        {p.registradoPor ? ` · ${p.registradoPor}` : ''}
                      </p>
                    </div>
                    <span className="shrink-0 font-semibold tabular-nums text-neutral-900">{COP.format(p.monto)}</span>
                  </li>
                ))}
              </ul>
              <p className="flex justify-between px-1 text-sm text-neutral-600">
                <span>
                  {pagos.length} {pagos.length === 1 ? 'pago' : 'pagos'}
                </span>
                <span className="font-semibold tabular-nums text-neutral-900">{COP.format(totalPagado)}</span>
              </p>
            </>
          )}
        </Seccion>
      </div>

    </Modal>
      {confirmandoEstado ? (
        <ConfirmModal
          title={sus.activo ? 'Inactivar suscripción' : 'Activar suscripción'}
          message={
            sus.activo
              ? `${sus.placa} · ${sus.titular} deja de contar como suscriptor activo. El historial de pagos se conserva.`
              : `${sus.placa} · ${sus.titular} vuelve a contar como suscriptor activo.`
          }
          confirmLabel={sus.activo ? 'Inactivar' : 'Activar'}
          variant={sus.activo ? 'danger' : 'primary'}
          successMessage={sus.activo ? 'Suscripción inactivada' : 'Suscripción activada'}
          onCancel={() => setConfirmandoEstado(false)}
          onConfirm={async () => {
            await setSuscripcionActiva(sus.id, !sus.activo)
            setConfirmandoEstado(false)
            await onCambio()
          }}
        />
      ) : null}
    </>
  )
}

// 3001234567 → "300 123 4567"; cualquier otro formato se muestra tal cual.
function fmtTelefono(tel: string): string {
  const d = tel.replace(/\D/g, '')
  return d.length === 10 ? `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}` : tel
}

function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter(Boolean)
  return ((partes[0]?.[0] ?? '') + (partes[1]?.[0] ?? '')).toUpperCase() || '?'
}

// Qué le dice el WhatsApp, en una frase, para que se sepa antes de abrirlo.
function motivoAviso(dias: number): string {
  if (dias > 1) return `Recordarle que vence en ${dias} días`
  if (dias === 1) return 'Recordarle que vence mañana'
  if (dias === 0) return 'Avisarle que vence hoy'
  return `Avisarle que venció ${dias === -1 ? 'ayer' : `hace ${-dias} días`}`
}

function TarjetaContacto({
  sus,
  pagos,
  onEditar,
}: {
  sus: SuscripcionParqueadero
  pagos: PagoSuscripcion[] | null
  onEditar: () => void
}) {
  const sinNombre = sus.titular === TITULAR_SIN_REGISTRAR
  const desde = new Date(sus.creadoEn).toLocaleDateString('es-CO', { month: 'long', year: 'numeric' })
  const mensaje = construirMensajeSuscripcion(sus)
  const dias = diasParaVencer(sus.fechaFin)

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-neutral-200 p-4">
      <div className="flex items-start gap-3">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary-50 text-base font-bold text-primary-700">
          {sinNombre ? <UserRound size={20} /> : iniciales(sus.titular)}
        </span>
        <div className="min-w-0 flex-1">
          <p className={`truncate text-base font-semibold ${sinNombre ? 'text-neutral-400' : 'text-neutral-900'}`}>
            {sinNombre ? 'Sin nombre registrado' : sus.titular}
          </p>
          {sus.telefono ? (
            <p className="text-sm tabular-nums text-neutral-700">{fmtTelefono(sus.telefono)}</p>
          ) : (
            <p className="text-sm text-neutral-400">Sin teléfono</p>
          )}
          <p className="mt-0.5 text-xs text-neutral-400">
            Cliente desde {desde}
            {pagos ? ` · ${pagos.length} ${pagos.length === 1 ? 'pago' : 'pagos'}` : ''}
          </p>
        </div>
        <Button size="sm" variant="ghost" icon={Pencil} onClick={onEditar}>
          Editar
        </Button>
      </div>

      {sus.nota ? (
        <p className="rounded-lg bg-warning-50 px-3 py-2.5 text-sm text-neutral-700">
          <span className="font-medium text-warning-700">Nota: </span>
          {sus.nota}
        </p>
      ) : null}

      {sus.telefono ? (
        <>
          <div className="grid gap-2 sm:grid-cols-2">
            <a
              href={whatsappHref(sus.telefono, mensaje)}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-3 rounded-xl bg-success-600 px-4 py-3 text-white transition-colors hover:bg-success-700"
            >
              <MessageCircle size={20} className="shrink-0" />
              <span className="flex flex-col">
                <span className="text-sm font-semibold">Escribir por WhatsApp</span>
                <span className="text-xs text-white/80">{sus.activo ? motivoAviso(dias) : 'Mensaje de renovación'}</span>
              </span>
            </a>
            <a
              href={`tel:${sus.telefono.replace(/\s+/g, '')}`}
              className="flex items-center gap-3 rounded-xl border border-neutral-200 px-4 py-3 text-neutral-800 transition-colors hover:bg-neutral-50"
            >
              <Phone size={20} className="shrink-0 text-primary-600" />
              <span className="flex flex-col">
                <span className="text-sm font-semibold">Llamar</span>
                <span className="text-xs tabular-nums text-neutral-500">{fmtTelefono(sus.telefono)}</span>
              </span>
            </a>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-neutral-500">Mensaje que se envía</span>
            <p className="rounded-xl rounded-tl-sm bg-success-600/10 px-3.5 py-2.5 text-sm text-neutral-700">{mensaje}</p>
          </div>
        </>
      ) : (
        <button
          type="button"
          onClick={onEditar}
          className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-neutral-300 px-4 py-3.5 text-sm font-medium text-neutral-600 transition-colors hover:border-primary-300 hover:bg-primary-50 hover:text-primary-700"
        >
          <Phone size={16} />
          Agregar teléfono para avisarle por WhatsApp
        </button>
      )}
    </div>
  )
}

function FormularioDatos({
  sus,
  onCancelar,
  onGuardado,
}: {
  sus: SuscripcionParqueadero
  onCancelar: () => void
  onGuardado: () => Promise<void>
}) {
  const [placa, setPlaca] = useState(sus.placa)
  const [titular, setTitular] = useState(sus.titular)
  const [telefono, setTelefono] = useState(sus.telefono ?? '')
  const [nota, setNota] = useState(sus.nota ?? '')
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const enVuelo = useRef(false)

  async function guardar() {
    if (enVuelo.current) return
    const parsed = actualizarSuscripcionInputSchema.safeParse({
      placa,
      titular,
      telefono: telefono || undefined,
      nota: nota || undefined,
    })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Revisa los datos')
      return
    }
    setError(null)
    enVuelo.current = true
    setGuardando(true)
    try {
      await actualizarSuscripcion(sus.id, parsed.data)
      toast.exito('Datos actualizados')
      await onGuardado()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar')
      toast.desdeError(err, 'No se pudo guardar')
    } finally {
      enVuelo.current = false
      setGuardando(false)
    }
  }

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-neutral-200 p-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-neutral-700">Placa</span>
          <input
            value={placa}
            onChange={(e) => setPlaca(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
            className={`${INPUT_CLASS} font-mono uppercase`}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-neutral-700">Teléfono</span>
          <input value={telefono} onChange={(e) => setTelefono(e.target.value)} className={INPUT_CLASS} />
        </label>
      </div>
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium text-neutral-700">Titular</span>
        <input value={titular} onChange={(e) => setTitular(e.target.value)} className={INPUT_CLASS} />
      </label>
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium text-neutral-700">Nota</span>
        <input value={nota} onChange={(e) => setNota(e.target.value)} className={INPUT_CLASS} />
      </label>
      <p className="text-xs text-neutral-400">
        El tipo de vehículo y la condición se cambian al cobrar, en «¿Qué plan paga?».
      </p>
      {error ? <p className="text-xs text-danger-600">{error}</p> : null}
      <div className="flex justify-end gap-2 border-t border-neutral-100 pt-3">
        <Button variant="ghost" onClick={onCancelar}>
          Cancelar
        </Button>
        <Button variant="primary" loading={guardando} onClick={guardar}>
          Guardar
        </Button>
      </div>
    </div>
  )
}
