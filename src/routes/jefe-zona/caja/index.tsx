import { useRef, useState, type FormEvent, type ReactNode } from 'react'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { Lock, CheckCircle2, AlertTriangle, Circle, X, Boxes, Wallet } from 'lucide-react'
import { fetchTurnoAbierto, fetchTurnos, abrirTurno, solicitarTraspaso as solicitarTraspasoTurno } from '../../../data/turnos'
import { fetchCategoriasGasto, fetchGastosDeTurno, type GastoConCategoria } from '../../../data/gastos'
import { fetchProductosOperativo } from '../../../data/productos'
import { fetchConteoDeTurno, fetchPendientesPorConfirmar, marcaConteo } from '../../../data/conteosInventario'
import { fetchOrdenesAbiertas } from '../../../data/ordenes'
import { fetchLavadores } from '../../../data/lavadores'
import { fetchPrestamosDeTurno, type DeudaPersonal } from '../../../data/deudasPersonal'
import type {
  ConteoInventario as ConteoInventarioType,
  MomentoConteo,
  PendienteCobro,
} from '../../../schemas/conteoInventario'
import type { TurnoCaja } from '../../../schemas/turnoCaja'
import { toast } from '../../../lib/toast'

import { Card } from '../../../components/layout/Card'
import { CurrencyInput } from '../../../components/layout/CurrencyInput'
import { GastosDeTurno } from '../../../components/layout/GastosDeTurno'
import { PrestamosDeTurno } from '../../../components/layout/PrestamosDeTurno'
import { ConteoInventario } from '../../../components/layout/ConteoInventario'
import { ArqueoCaja } from '../../../components/layout/ArqueoCaja'
import { IndicadorCuadrado } from '../../../components/layout/PantallaTarea'
import { TurnoResponsableBanner } from '../../../components/layout/TurnoResponsableBanner'

// Conteo de inventario encadenado (0068): apertura antes de vender (la base bloquea la venta sin
// ella) y cierre antes del arqueo (trigger `turnos_caja_cierre_requiere_conteo`, sin excepciones).
async function loadCaja() {
  const [turnoAbierto, turnosRecientes, categorias, productos, ordenesAbiertas, lavadores] = await Promise.all([
    fetchTurnoAbierto('jefe_zona'),
    fetchTurnos('jefe_zona'),
    fetchCategoriasGasto(),
    fetchProductosOperativo(),
    fetchOrdenesAbiertas(),
    fetchLavadores(),
  ])
  // Lo que depende del turno abierto va en una segunda ronda.
  const [gastosTurno, conteoApertura, conteoCierre, prestamosTurno] = turnoAbierto
    ? await Promise.all([
        fetchGastosDeTurno(turnoAbierto.id),
        fetchConteoDeTurno(turnoAbierto.id, 'apertura'),
        fetchConteoDeTurno(turnoAbierto.id, 'cierre'),
        fetchPrestamosDeTurno(turnoAbierto.id),
      ])
    : [[], undefined, undefined, []]
  return {
    turnoAbierto,
    turnosRecientes: turnosRecientes.slice(0, 5),
    categorias,
    productos,
    ordenesAbiertas,
    lavadores,
    gastosTurno,
    conteoApertura,
    conteoCierre,
    prestamosTurno,
  }
}

export const Route = createFileRoute('/jefe-zona/caja/')({
  loader: loadCaja,
  component: CajaJefeZona,
})

const COP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })

function formatFecha(iso: string | undefined) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })
}

function formatHora(iso: string | undefined) {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })
}

// Un conteo ya guardado solo se puede leer por su cabecera (`conteos_inventario`) — las líneas con
// las diferencias son admin-only porque llevan el valor a costo (ver §Roles). La justificación es
// obligatoria cuando hay diferencia y no se pide cuando no la hay, así que su presencia es la
// señal de si ese conteo cuadró. El 'reinicio' (0067) siempre lleva texto y no es un descuadre.
function conteoCuadro(conteo: ConteoInventarioType | undefined): boolean | undefined {
  if (!conteo) return undefined
  if (conteo.momento === 'reinicio') return true
  return !conteo.justificacion
}

/** Qué tarea de pantalla completa (o modal) está abierta. */
type Tarea = 'abrir-caja' | 'arqueo' | null

function CajaJefeZona() {
  const data = Route.useLoaderData()
  const { auth } = Route.useRouteContext()
  const router = useRouter()
  const [turnoAbierto, setTurnoAbierto] = useState(data.turnoAbierto)
  const [turnosRecientes, setTurnosRecientes] = useState(data.turnosRecientes)
  const [gastosTurno, setGastosTurno] = useState<GastoConCategoria[]>(data.gastosTurno)
  const [conteoApertura, setConteoApertura] = useState<ConteoInventarioType | undefined>(data.conteoApertura)
  const [conteoCierre, setConteoCierre] = useState<ConteoInventarioType | undefined>(data.conteoCierre)
  const [ordenesAbiertas, setOrdenesAbiertas] = useState(data.ordenesAbiertas)
  const [lavadores] = useState(data.lavadores)
  const [prestamosTurno, setPrestamosTurno] = useState<DeudaPersonal[]>(data.prestamosTurno)
  const [tarea, setTarea] = useState<Tarea>(null)
  // Conteo en curso: momento + hora del servidor en que se empezó (lo movido después se reconta) +
  // cuentas/órdenes con productos sin cobrar a confirmar (cierre y traspaso) + a quién se entrega.
  const [conteoEnCurso, setConteoEnCurso] = useState<{
    momento: MomentoConteo
    marca: string
    pendientes: PendienteCobro[]
    destino?: { id: string; nombre: string }
  } | null>(null)
  const [modoCierre, setModoCierre] = useState(false)
  // Resultado del cierre recién hecho — se muestra una vez y se descarta con "Listo".
  const [resumenCierre, setResumenCierre] = useState<{ inventarioCuadrado: boolean; diferenciaCaja: number } | null>(
    null,
  )

  async function refresh() {
    const [nuevoAbierto, nuevosRecientes, nuevasAbiertas] = await Promise.all([
      fetchTurnoAbierto('jefe_zona'),
      fetchTurnos('jefe_zona'),
      fetchOrdenesAbiertas(),
    ])
    setOrdenesAbiertas(nuevasAbiertas)
    setTurnoAbierto(nuevoAbierto)
    setTurnosRecientes(nuevosRecientes.slice(0, 5))
    if (nuevoAbierto) {
      const [g, ca, cc, pr] = await Promise.all([
        fetchGastosDeTurno(nuevoAbierto.id),
        fetchConteoDeTurno(nuevoAbierto.id, 'apertura'),
        fetchConteoDeTurno(nuevoAbierto.id, 'cierre'),
        fetchPrestamosDeTurno(nuevoAbierto.id),
      ])
      setGastosTurno(g)
      setConteoApertura(ca)
      setConteoCierre(cc)
      setPrestamosTurno(pr)
    } else {
      setGastosTurno([])
      setConteoApertura(undefined)
      setConteoCierre(undefined)
      setPrestamosTurno([])
      setModoCierre(false)
    }
    router.invalidate()
  }

  async function empezarConteo(momento: MomentoConteo, destino?: { id: string; nombre: string }) {
    try {
      const [marca, pendientes] = await Promise.all([
        marcaConteo(),
        momento === 'apertura' ? Promise.resolve([]) : fetchPendientesPorConfirmar(),
      ])
      setConteoEnCurso({ momento, marca, pendientes, destino })
    } catch (err) {
      toast.desdeError(err, 'No se pudo iniciar el conteo')
    }
  }

  // Traspaso (0068/0072): con inventario a cargo (apertura contada y sin cierre) pide conteo; si
  // no, solicita directo. En los dos casos queda PENDIENTE — el responsable no cambia hasta que
  // la cuenta destino inicie sesión y lo acepte (ver TurnoResponsableBanner).
  async function solicitarTraspaso(destino: { id: string; nombre: string }) {
    if (!turnoAbierto) return
    if (conteoApertura && !conteoCierre) {
      await empezarConteo('traspaso', destino)
      return
    }
    const actualizado = await solicitarTraspasoTurno(turnoAbierto.id, destino.id)
    setTurnoAbierto(actualizado)
    toast.exito(`Traspaso solicitado a ${destino.nombre} — pendiente hasta que acepte.`)
  }

  const aperturaCuadro = conteoCuadro(conteoApertura)
  const cierreCuadro = conteoCuadro(conteoCierre)
  // Espeja el trigger `turnos_caja_cierre_requiere_conteo` (0068): sin conteo de cierre no hay arqueo.
  const puedeArquear = Boolean(conteoCierre)

  // ── Tareas de pantalla completa ──────────────────────────────────────────────────────────────
  if (conteoEnCurso && turnoAbierto) {
    return (
      <ConteoInventario
        key={conteoEnCurso.marca}
        turno={turnoAbierto}
        momento={conteoEnCurso.momento}
        marcaInicial={conteoEnCurso.marca}
        productos={data.productos}
        pendientes={conteoEnCurso.pendientes}
        entregaA={conteoEnCurso.destino?.nombre}
        onRegistrarTraspaso={
          conteoEnCurso.destino
            ? async (conteo) => {
                const destino = conteoEnCurso.destino
                if (!destino) return
                await solicitarTraspasoTurno(turnoAbierto.id, destino.id, conteo)
              }
            : undefined
        }
        onVolver={() => setConteoEnCurso(null)}
        onConfirmado={async () => {
          setConteoEnCurso(null)
          await refresh()
        }}
      />
    )
  }

  if (tarea === 'arqueo' && turnoAbierto) {
    return (
      <ArqueoCaja
        turno={turnoAbierto}
        onVolver={() => setTarea(null)}
        onCerrado={async ({ diferencia }) => {
          setTarea(null)
          setResumenCierre({ inventarioCuadrado: cierreCuadro ?? true, diferenciaCaja: diferencia })
          await refresh()
        }}
      />
    )
  }

  // ── Pantalla de estado ───────────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-6">
      {resumenCierre ? (
        <Card className="flex flex-col gap-3 border-l-4 border-l-primary-500 p-5">
          <div>
            <h2 className="text-base font-semibold text-neutral-900">Turno cerrado</h2>
            <p className="text-xs text-neutral-500">Así quedó el cuadre.</p>
          </div>
          <IndicadorCuadrado
            cuadrado={resumenCierre.inventarioCuadrado}
            label={resumenCierre.inventarioCuadrado ? 'Inventario cuadrado' : 'Inventario con diferencia registrada'}
          />
          <IndicadorCuadrado
            cuadrado={resumenCierre.diferenciaCaja === 0}
            label={
              resumenCierre.diferenciaCaja === 0
                ? 'Caja cuadrada'
                : `Caja con ${resumenCierre.diferenciaCaja < 0 ? 'faltante' : 'sobrante'} de ${COP.format(
                    Math.abs(resumenCierre.diferenciaCaja),
                  )}`
            }
          />
          <button
            type="button"
            onClick={() => setResumenCierre(null)}
            className="mt-1 rounded-lg bg-primary-600 py-3 text-sm font-semibold text-white shadow-nav-active transition-colors hover:bg-primary-700"
          >
            Listo
          </button>
        </Card>
      ) : null}

      {turnoAbierto ? (
        <TurnoResponsableBanner
          turno={turnoAbierto}
          miPersonaId={auth?.perfil.id ?? ''}
          onTransferido={setTurnoAbierto}
          onSolicitarTraspaso={solicitarTraspaso}
          avisoTraspaso={
            conteoApertura && !conteoCierre ? 'Antes de entregar se cuenta el inventario: lo que falte queda a tu nombre.' : undefined
          }
        >
          {modoCierre ? (
            <div className="flex flex-col gap-2 border-t border-neutral-100 pt-4">
              <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">Para cerrar el turno</p>
              {ordenesAbiertas.length > 0 ? (
                // Aviso, no bloqueo: se puede cerrar caja con lavados por cobrar. Pero una orden que se
                // entrega sin pasar por "Cobrar" nunca entra al arqueo, y si se pagó por transferencia
                // la caja cuadra igual y nadie se entera.
                <div className="flex items-start gap-2.5 rounded-xl border border-warning-600/25 bg-warning-50 p-3 text-sm text-warning-700">
                  <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                  <p>
                    Hay {ordenesAbiertas.length} {ordenesAbiertas.length === 1 ? 'orden sin cobrar' : 'órdenes sin cobrar'}{' '}
                    ({ordenesAbiertas.map((o) => o.placa).slice(0, 4).join(', ')}
                    {ordenesAbiertas.length > 4 ? '…' : ''}). Si ya se entregaron, cóbralas en el tablero antes de
                    hacer el arqueo; si siguen en el patio, puedes cerrar igual.
                  </p>
                </div>
              ) : null}
              <ItemChecklist
                numero={1}
                icono={Boxes}
                estado={!conteoApertura ? 'pendiente' : conteoCierre ? (cierreCuadro ? 'ok' : 'alerta') : 'pendiente'}
                titulo="Contar inventario"
                detalle={
                  !conteoApertura
                    ? 'Primero registra el conteo de apertura'
                    : conteoCierre
                      ? cierreCuadro
                        ? 'Cuadrado'
                        : 'Con diferencia registrada'
                      : 'Nevera y bodega, antes de la plata — ya no se podrá vender en este turno'
                }
                accion={
                  conteoApertura && !conteoCierre ? (
                    <BotonItem onClick={() => empezarConteo('cierre')}>Contar</BotonItem>
                  ) : !conteoApertura ? (
                    <BotonItem onClick={() => empezarConteo('apertura')}>Contar apertura</BotonItem>
                  ) : null
                }
              />
              <ItemChecklist
                numero={2}
                icono={Wallet}
                estado={puedeArquear ? 'pendiente' : 'bloqueado'}
                titulo="Arqueo de caja"
                detalle={puedeArquear ? 'Cuenta el efectivo y cierra' : 'Primero cuenta el inventario'}
                accion={puedeArquear ? <BotonItem onClick={() => setTarea('arqueo')}>Hacer arqueo</BotonItem> : null}
              />
              <button
                type="button"
                onClick={() => setModoCierre(false)}
                className="mt-1 rounded-lg py-2.5 text-sm font-medium text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
              >
                Cancelar
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2 border-t border-neutral-100 pt-4">
              <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">Apertura</p>
              <ItemChecklist
                numero={1}
                icono={Wallet}
                estado="ok"
                titulo="Caja abierta"
                detalle={`${formatHora(turnoAbierto.abiertoEn)} · base ${COP.format(turnoAbierto.baseInicial)}`}
              />
              <ItemChecklist
                numero={2}
                icono={Boxes}
                estado={conteoApertura ? (aperturaCuadro ? 'ok' : 'alerta') : 'pendiente'}
                titulo="Inventario contado"
                detalle={
                  conteoApertura
                    ? conteoApertura.momento === 'reinicio'
                      ? 'Inventario base cargado'
                      : aperturaCuadro
                        ? 'Cuadrado'
                        : 'Con diferencia registrada'
                    : 'Sin contar — no se puede vender hasta contarlo'
                }
                accion={
                  conteoApertura ? null : <BotonItem onClick={() => empezarConteo('apertura')}>Contar</BotonItem>
                }
              />
              <button
                type="button"
                onClick={() => setModoCierre(true)}
                className="mt-2 rounded-lg bg-primary-600 py-3 text-sm font-semibold text-white shadow-nav-active transition-colors hover:bg-primary-700"
              >
                Cerrar turno
              </button>
            </div>
          )}
        </TurnoResponsableBanner>
      ) : (
        <Card className="flex flex-col gap-4 p-5">
          <div className="flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-warning-50 text-warning-600">
              <Lock size={20} strokeWidth={2} />
            </span>
            <div>
              <h2 className="text-base font-semibold text-neutral-900">Sin turno abierto</h2>
              <p className="text-xs text-neutral-500">Dos cosas antes de empezar a operar.</p>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <ItemChecklist numero={1} icono={Wallet} estado="pendiente" titulo="Abrir caja" detalle="Responsable y base inicial" />
            <ItemChecklist numero={2} icono={Boxes} estado="bloqueado" titulo="Contar inventario" detalle="Nevera y bodega" />
          </div>

          <button
            type="button"
            onClick={() => setTarea('abrir-caja')}
            className="rounded-lg bg-primary-600 py-3 text-sm font-semibold text-white shadow-nav-active transition-colors hover:bg-primary-700"
          >
            Abrir caja
          </button>
        </Card>
      )}

      {turnoAbierto ? (
        <GastosDeTurno
          turno={turnoAbierto}
          categorias={data.categorias}
          gastos={gastosTurno}
          onRegistrado={(gasto) => setGastosTurno((previos) => [gasto, ...previos])}
          size="sm"
        />
      ) : null}

      {turnoAbierto ? (
        <PrestamosDeTurno
          turno={turnoAbierto}
          lavadores={lavadores}
          prestamos={prestamosTurno}
          onRegistrado={(prestamo) => setPrestamosTurno((previos) => [prestamo, ...previos])}
          size="sm"
        />
      ) : null}

      <div>
        <h2 className="mb-2 text-sm font-semibold text-neutral-900">Turnos recientes</h2>
        <div className="flex flex-col gap-2">
          {turnosRecientes.map((turno) => (
            <TurnoRecienteRow key={turno.id} turno={turno} />
          ))}
          {turnosRecientes.length === 0 ? (
            <Card className="py-10 text-center text-sm text-neutral-400">Todavía no hay turnos registrados.</Card>
          ) : null}
        </div>
      </div>

      {tarea === 'abrir-caja' ? (
        <AbrirCajaModal
          miNombre={auth?.perfil.nombre?.trim() || 'tu cuenta'}
          onClose={() => setTarea(null)}
          onAbierta={async () => {
            await refresh()
            setTarea(null)
            // Encadena directo con el conteo de apertura: sin él no se puede vender. Si se sale, el
            // checklist lo sigue mostrando pendiente.
            await empezarConteo('apertura')
          }}
        />
      ) : null}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Piezas del checklist
// ─────────────────────────────────────────────────────────────────────────────────────────────

type EstadoItem = 'ok' | 'alerta' | 'pendiente' | 'bloqueado'

function ItemChecklist({
  numero,
  icono: Icono,
  estado,
  titulo,
  detalle,
  accion,
}: {
  numero: number
  icono: typeof Wallet
  estado: EstadoItem
  titulo: string
  detalle?: string
  accion?: ReactNode
}) {
  const marca =
    estado === 'ok' ? (
      <CheckCircle2 size={18} className="text-success-700" />
    ) : estado === 'alerta' ? (
      <AlertTriangle size={18} className="text-warning-700" />
    ) : (
      <Circle size={18} className={estado === 'bloqueado' ? 'text-neutral-200' : 'text-neutral-300'} />
    )

  return (
    <div
      className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${
        estado === 'ok'
          ? 'border-success-600/20 bg-success-50/50'
          : estado === 'alerta'
            ? 'border-warning-600/25 bg-warning-50/50'
            : estado === 'bloqueado'
              ? 'border-neutral-100 bg-neutral-50/60'
              : 'border-neutral-200 bg-white'
      }`}
    >
      <span className="flex shrink-0 items-center gap-2">
        {marca}
        <span
          className={`flex size-7 items-center justify-center rounded-lg ${
            estado === 'bloqueado' ? 'bg-neutral-100 text-neutral-300' : 'bg-primary-50 text-primary-600'
          }`}
        >
          <Icono size={15} />
        </span>
      </span>
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-medium ${estado === 'bloqueado' ? 'text-neutral-400' : 'text-neutral-900'}`}>
          <span className="mr-1 text-neutral-400">{numero}.</span>
          {titulo}
        </p>
        {detalle ? <p className="truncate text-xs text-neutral-500">{detalle}</p> : null}
      </div>
      {accion ? <div className="shrink-0">{accion}</div> : null}
    </div>
  )
}

function BotonItem({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg bg-primary-600 px-3.5 py-2 text-xs font-semibold text-white shadow-nav-active transition-colors hover:bg-primary-700"
    >
      {children}
    </button>
  )
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Abrir caja — modal corto de verdad: dos campos, nada más. El conteo de inventario NO va acá,
// es su propia tarea (el wizard anterior los mezclaba en un stepper que además mentía sobre
// cuántos pasos faltaban, porque cada "paso" tenía sub-pantallas adentro).
// ─────────────────────────────────────────────────────────────────────────────────────────────

// El responsable ya no se elige (0072): siempre es la cuenta con la sesión abierta — `miNombre`
// es solo para mostrarlo, la RPC `abrir_turno` deriva el dueño real de auth.uid() en el servidor.
function AbrirCajaModal({
  miNombre,
  onClose,
  onAbierta,
}: {
  miNombre: string
  onClose: () => void
  onAbierta: () => Promise<void>
}) {
  const [baseInicial, setBaseInicial] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const enVueloRef = useRef(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
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
      await abrirTurno({ rol: 'jefe_zona', baseInicial: Math.round(base) })
      toast.exito('Caja abierta')
      await onAbierta()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo abrir el turno')
      toast.desdeError(err, 'No se pudo abrir el turno')
    } finally {
      enVueloRef.current = false
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center bg-neutral-900/40 backdrop-blur-[2px] sm:items-center sm:p-4">
      <div className="w-full max-w-sm rounded-t-2xl bg-white p-5 shadow-card-hover sm:rounded-2xl sm:p-6">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-neutral-900">Abrir caja</h3>
            <p className="text-xs text-neutral-500">
              Vas a abrirla como <span className="font-medium text-neutral-700">{miNombre}</span>.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="flex size-8 shrink-0 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-neutral-100"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-neutral-700">Base inicial</span>
            <CurrencyInput size="md" prefix="$" value={baseInicial} onChange={setBaseInicial} />
          </label>

          {error ? <p className="text-xs text-danger-600">{error}</p> : null}

          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-primary-600 py-3 text-sm font-semibold text-white shadow-nav-active transition-colors hover:bg-primary-700 disabled:opacity-60"
          >
            {saving ? 'Abriendo…' : 'Abrir caja y continuar'}
          </button>
        </form>
      </div>
    </div>
  )
}

function TurnoRecienteRow({ turno }: { turno: TurnoCaja }) {
  const diferencia = turno.diferencia ?? 0
  const tieneDiferencia = turno.cerrado && diferencia !== 0

  return (
    <Card className="flex flex-col gap-2 p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-neutral-900">{turno.responsable}</p>
          <p className="text-xs text-neutral-500">
            {formatFecha(turno.abiertoEn)} → {turno.cerrado ? formatFecha(turno.cerradoEn) : 'abierto'}
          </p>
        </div>
        <span
          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
            turno.cerrado ? 'bg-neutral-100 text-neutral-600' : 'bg-success-50 text-success-700'
          }`}
        >
          {turno.cerrado ? 'Cerrado' : 'En curso'}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        <div>
          <p className="text-neutral-400">Base</p>
          <p className="font-medium text-neutral-700">{COP.format(turno.baseInicial)}</p>
        </div>
        <div>
          <p className="text-neutral-400">Esperado</p>
          <p className="font-medium text-neutral-700">{turno.valorEsperado != null ? COP.format(turno.valorEsperado) : '—'}</p>
        </div>
        <div>
          <p className="text-neutral-400">Conteo</p>
          <p className="font-medium text-neutral-700">{turno.conteoFisico != null ? COP.format(turno.conteoFisico) : '—'}</p>
        </div>
        <div>
          <p className="text-neutral-400">Diferencia</p>
          <p className={`font-medium ${tieneDiferencia ? 'text-danger-600' : 'text-neutral-700'}`}>
            {turno.cerrado ? COP.format(diferencia) : '—'}
          </p>
        </div>
      </div>
      {turno.justificacionDiferencia ? (
        <p className="text-xs text-neutral-500">Justificación: {turno.justificacionDiferencia}</p>
      ) : null}
    </Card>
  )
}
