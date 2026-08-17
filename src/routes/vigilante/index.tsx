import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { LogIn, LogOut, Car, Banknote, AlertTriangle, X, Clock, Lock, Unlock } from 'lucide-react'
import {
  fetchEstanciasAdentro,
  fetchResumenHoy,
  registrarEntrada,
  registrarSalida,
  cobroPorModalidad,
  fueraDeVentanaSalida,
} from '../../data/estanciasParqueadero'
import { entradaInputSchema, type EstanciaParqueadero, type ModalidadParqueadero } from '../../schemas/estanciaParqueadero'
import { fetchTurnoAbierto, abrirTurno, calcularValorEsperado, cerrarTurno } from '../../data/turnos'
import type { TurnoCaja } from '../../schemas/turnoCaja'
import { Card } from '../../components/layout/Card'
import { CustomSelect } from '../../components/layout/CustomSelect'
import { CurrencyInput } from '../../components/layout/CurrencyInput'

async function loadParqueadero() {
  const [estancias, resumen, turno] = await Promise.all([
    fetchEstanciasAdentro(),
    fetchResumenHoy(),
    fetchTurnoAbierto('vigilante'),
  ])
  return { estancias, resumen, turno }
}

const HORA_FORMAT = new Intl.DateTimeFormat('es-CO', { hour: 'numeric', minute: '2-digit', hour12: true })

export const Route = createFileRoute('/vigilante/')({
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
  const [estancias, setEstancias] = useState<EstanciaParqueadero[]>(data.estancias)
  const [resumen, setResumen] = useState(data.resumen)
  const [turno, setTurno] = useState<TurnoCaja | undefined>(data.turno)
  const [modal, setModal] = useState<'entrada' | 'salida' | 'abrirTurno' | 'cerrarTurno' | null>(null)
  const [salidaSeleccionada, setSalidaSeleccionada] = useState<EstanciaParqueadero | null>(null)

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
    <div className="mx-auto flex max-w-2xl flex-col gap-4 pb-6">
      {/* Turno de caja — arqueo ciego (regla 15), visible siempre arriba de todo lo demás */}
      {turno ? (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-success-100 bg-success-50 p-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-success-100 text-success-700">
              <Unlock size={16} strokeWidth={2.25} />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-neutral-900">Turno abierto — {turno.responsable}</p>
              <p className="text-xs text-neutral-500">Desde las {HORA_FORMAT.format(new Date(turno.abiertoEn))}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setModal('cerrarTurno')}
            className="shrink-0 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs font-semibold text-neutral-700 transition-colors hover:bg-neutral-50"
          >
            Cerrar turno
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-warning-100 bg-warning-50 p-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-warning-100 text-warning-700">
              <Lock size={16} strokeWidth={2.25} />
            </span>
            <p className="min-w-0 text-sm font-medium text-warning-700">Abre tu turno para empezar a registrar movimientos.</p>
          </div>
          <button
            type="button"
            onClick={() => setModal('abrirTurno')}
            className="shrink-0 rounded-lg bg-primary-600 px-3 py-2 text-xs font-semibold text-white shadow-nav-active transition-colors hover:bg-primary-700"
          >
            Abrir turno
          </button>
        </div>
      )}

      {/* Stats — 2 columnas incluso en móvil, son las dos cifras que el vigilante necesita de un vistazo */}
      <div className="grid grid-cols-2 gap-3">
        <div className="flex items-center gap-3 rounded-2xl border border-neutral-200 bg-white p-4 shadow-card">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-600">
            <Car size={18} strokeWidth={2} />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-medium text-neutral-500">Adentro</p>
            <p className="text-lg font-semibold text-neutral-900">{resumen.vehiculosAdentro}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-2xl border border-neutral-200 bg-white p-4 shadow-card">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-success-50 text-success-700">
            <Banknote size={18} strokeWidth={2} />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-medium text-neutral-500">Recaudado hoy</p>
            <p className="truncate text-lg font-semibold text-neutral-900">{COP.format(resumen.dineroHoy)}</p>
          </div>
        </div>
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

      <div>
        <h2 className="mb-2 px-1 text-sm font-semibold text-neutral-900">
          Vehículos en el patio ({estancias.length})
        </h2>
        <div className="flex flex-col gap-2">
          {estancias.map((estancia) => {
            const alerta = fueraDeVentanaSalida(estancia.modalidad)
            return (
              <button
                key={estancia.id}
                type="button"
                onClick={() => abrirSalida(estancia)}
                className="flex items-center justify-between gap-3 rounded-2xl border border-neutral-200 bg-white p-4 text-left shadow-card transition-shadow hover:shadow-card-hover active:shadow-none"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-semibold text-neutral-900">{estancia.placa}</span>
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
                    <Clock size={12} /> {tiempoTranscurrido(estancia.horaIngreso)}
                  </p>
                </div>
                <span className="shrink-0 rounded-lg bg-neutral-100 px-3 py-1.5 text-xs font-medium text-neutral-600">
                  Salida
                </span>
              </button>
            )
          })}
          {estancias.length === 0 ? (
            <Card className="py-10 text-center text-sm text-neutral-400">No hay vehículos en el patio.</Card>
          ) : null}
        </div>
      </div>

      {modal === 'entrada' ? (
        <EntradaModal
          onClose={() => setModal(null)}
          onSaved={async () => {
            setModal(null)
            await refresh()
          }}
        />
      ) : null}

      {modal === 'salida' ? (
        <SalidaModal
          estancias={estancias}
          seleccionada={salidaSeleccionada}
          onClose={() => setModal(null)}
          onSaved={async () => {
            setModal(null)
            await refresh()
          }}
        />
      ) : null}

      {modal === 'abrirTurno' ? (
        <AbrirTurnoModal
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
  )
}

function AbrirTurnoModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [responsable, setResponsable] = useState('')
  const [baseInicial, setBaseInicial] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function handleSubmit() {
    setError(null)
    const base = Number(baseInicial)
    if (!responsable.trim()) {
      setError('El responsable es obligatorio')
      return
    }
    if (!Number.isFinite(base) || base < 0) {
      setError('La base inicial no puede ser negativa')
      return
    }
    setSaving(true)
    try {
      await abrirTurno({ rol: 'vigilante', responsable, baseInicial: Math.round(base) })
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo abrir el turno')
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalSheet title="Abrir turno" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-neutral-700">Responsable</span>
          <input
            autoFocus
            value={responsable}
            onChange={(e) => setResponsable(e.target.value)}
            placeholder="Nombre del vigilante"
            className="rounded-lg border border-neutral-300 px-3 py-3 text-base outline-none transition-colors focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
          />
        </label>

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-neutral-700">Base inicial</span>
          <CurrencyInput size="md" prefix="$" value={baseInicial} onChange={setBaseInicial} />
        </label>

        {error ? <p className="text-xs text-danger-600">{error}</p> : null}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={saving}
          className="rounded-lg bg-primary-600 py-3 text-sm font-semibold text-white shadow-nav-active transition-colors hover:bg-primary-700 disabled:opacity-60"
        >
          {saving ? 'Abriendo…' : 'Abrir turno'}
        </button>
      </div>
    </ModalSheet>
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
    } finally {
      setSaving(false)
    }
  }

  async function handleCerrar() {
    setError(null)
    if (!cerradoPor.trim()) {
      setError('Indica quién cierra el turno')
      return
    }
    if (diferencia !== 0 && !justificacion.trim()) {
      setError('Hay una diferencia en el arqueo — la justificación es obligatoria para cerrar el turno')
      return
    }
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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cerrar el turno')
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
            className="rounded-lg bg-primary-600 py-3 text-sm font-semibold text-white shadow-nav-active transition-colors hover:bg-primary-700 disabled:opacity-60"
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
            className="rounded-lg bg-primary-600 py-3 text-sm font-semibold text-white shadow-nav-active transition-colors hover:bg-primary-700 disabled:opacity-60"
          >
            {saving ? 'Cerrando…' : 'Confirmar cierre'}
          </button>
        </div>
      )}
    </ModalSheet>
  )
}

function EntradaModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [placa, setPlaca] = useState('')
  const [modalidad, setModalidad] = useState<ModalidadParqueadero>('noche')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [tarifaNoche, setTarifaNoche] = useState(0)

  useEffect(() => {
    cobroPorModalidad('noche').then(setTarifaNoche)
  }, [])

  async function handleSubmit() {
    const parsed = entradaInputSchema.safeParse({ placa, modalidad })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Datos inválidos')
      return
    }
    setError(null)
    setSaving(true)
    try {
      await registrarEntrada(parsed.data)
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar la entrada')
    } finally {
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
        </label>

        <div className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-neutral-700">Modalidad</span>
          <div className="grid grid-cols-3 gap-2">
            {(Object.keys(MODALIDAD_LABEL) as ModalidadParqueadero[]).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setModalidad(value)}
                className={`rounded-lg border px-2 py-2.5 text-sm font-medium transition-colors ${
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
            <p className="text-xs text-neutral-400">Se cobra {COP.format(tarifaNoche)} al retiro, no ahora.</p>
          ) : null}
        </div>

        {error ? <p className="text-xs text-danger-600">{error}</p> : null}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={saving}
          className="rounded-lg bg-primary-600 py-3 text-sm font-semibold text-white shadow-nav-active transition-colors hover:bg-primary-700 disabled:opacity-60"
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
  onSaved: () => void
}) {
  const [estanciaId, setEstanciaId] = useState(seleccionada?.id ?? '')
  const [metodoPago, setMetodoPago] = useState<'efectivo' | 'transferencia'>('efectivo')
  const [saving, setSaving] = useState(false)
  const [cobro, setCobro] = useState(0)

  const estancia = useMemo(() => estancias.find((e) => e.id === estanciaId), [estancias, estanciaId])

  useEffect(() => {
    let cancelado = false
    async function cargarCobro() {
      const valor = estancia ? await cobroPorModalidad(estancia.modalidad) : 0
      if (!cancelado) setCobro(valor)
    }
    cargarCobro()
    return () => {
      cancelado = true
    }
  }, [estancia])

  async function handleSubmit() {
    if (!estancia) return
    setSaving(true)
    try {
      await registrarSalida(estancia.id, cobro > 0 ? metodoPago : undefined)
      onSaved()
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
              onChange={setEstanciaId}
              placeholder="Selecciona un vehículo…"
              options={estancias.map((e) => ({
                value: e.id,
                label: `${e.placa} — ${MODALIDAD_LABEL[e.modalidad]}`,
              }))}
            />
          </label>
        ) : (
          <div className="flex items-center gap-2">
            <span className="font-mono text-lg font-semibold text-neutral-900">{estancia?.placa}</span>
            <span className="inline-flex rounded-full bg-primary-50 px-2 py-0.5 text-xs font-medium text-primary-700">
              {estancia ? MODALIDAD_LABEL[estancia.modalidad] : ''}
            </span>
          </div>
        )}

        {estancia ? (
          fueraDeVentanaSalida(estancia.modalidad) ? (
            <p className="flex items-center gap-1.5 rounded-lg bg-warning-50 px-3 py-2 text-xs text-warning-700">
              <AlertTriangle size={13} /> Fuera de la ventana de salida (7–8am). El cobro adicional queda pendiente
              de definir.
            </p>
          ) : null
        ) : null}

        {estancia && cobro > 0 ? (
          <>
            <div className="rounded-lg bg-primary-50 px-3 py-2.5 text-sm font-medium text-primary-900">
              Cobrar {COP.format(cobro)}
            </div>
            <div className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-neutral-700">Método de pago</span>
              <div className="grid grid-cols-2 gap-2">
                {(['efectivo', 'transferencia'] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setMetodoPago(value)}
                    className={`rounded-lg border px-3 py-2.5 text-sm font-medium capitalize transition-colors ${
                      metodoPago === value
                        ? 'border-primary-600 bg-primary-50 text-primary-700'
                        : 'border-neutral-200 text-neutral-600 hover:bg-neutral-50'
                    }`}
                  >
                    {value}
                  </button>
                ))}
              </div>
            </div>
          </>
        ) : null}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={!estancia || saving}
          className="rounded-lg bg-primary-600 py-3 text-sm font-semibold text-white shadow-nav-active transition-colors hover:bg-primary-700 disabled:opacity-60"
        >
          {saving ? 'Registrando…' : 'Confirmar salida'}
        </button>
      </div>
    </ModalSheet>
  )
}

// Hoja modal — en móvil se ancla abajo (como un bottom sheet), en desktop queda centrada.
function ModalSheet({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: ReactNode
}) {
  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center bg-neutral-900/40 backdrop-blur-[2px] sm:items-center sm:p-4">
      <div className="w-full max-w-sm rounded-t-2xl bg-white p-5 shadow-card-hover sm:rounded-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-neutral-900">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="flex size-8 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-neutral-100"
          >
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
