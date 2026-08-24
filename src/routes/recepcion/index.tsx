import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { createFileRoute, Link, redirect, useRouter } from '@tanstack/react-router'
import { Package, Car, Lock, Sparkles, AlertTriangle } from 'lucide-react'
import { SimpleTopbar } from '../../components/layout/SimpleTopbar'
import { signOut } from '../../lib/auth'
import { fetchTiposVehiculo } from '../../data/tiposVehiculo'
import { fetchCombos, precioComboCalculado } from '../../data/combos'
import { fetchComboServicios, type ComboServicio } from '../../data/comboServicios'
import { fetchServicios } from '../../data/servicios'
import { fetchPreciosServicioCombo } from '../../data/preciosServicioCombo'
import { fetchPreciosServicioIndividual, findPrecioServicioIndividual } from '../../data/preciosServicioIndividual'
import { fetchPreciosComboFijo } from '../../data/preciosComboFijo'
import { fetchLavadores, suggestNextLavador } from '../../data/lavadores'
import { fetchDiasDescanso, ensureDiasDescansoGenerados } from '../../data/asistenciaLavadores'
import { fetchOrdenesHoy, buscarPorPlaca, createOrden, fetchOrdenEnProcesoPorPlaca } from '../../data/ordenes'
import { fetchTurnoAbierto } from '../../data/turnos'
import { fetchConfiguracion } from '../../data/configuracion'
import { ordenInputSchema, type EstadoOrden, type Orden } from '../../schemas/orden'
import type { TipoVehiculo, CategoriaVehiculo } from '../../schemas/tipoVehiculo'
import type { Combo } from '../../schemas/combo'
import type { Servicio } from '../../schemas/servicio'
import type { Lavador } from '../../schemas/lavador'
import type { DiaDescanso } from '../../schemas/asistencia'
import type { PrecioServicio } from '../../schemas/precioServicio'
import type { PrecioCombo } from '../../schemas/precioCombo'
import type { Configuracion } from '../../schemas/configuracion'
import { Card } from '../../components/layout/Card'
import { AccordionSection } from '../../components/layout/Accordion'
import { CustomSelect } from '../../components/layout/CustomSelect'
import { ReciboModal, type ReciboData } from '../../components/layout/ReciboModal'

function hoyISO(): string {
  return new Date().toISOString().slice(0, 10)
}

async function loadRecepcion() {
  // Genera (si hace falta) la fila de dias_descanso de hoy antes de leerla — si nadie visitó
  // /jefe-zona/asistencia todavía hoy, esa tabla puede no tener fila para la fecha actual y
  // ningún lavador quedaría marcado como "descansa hoy" en este selector (bug: Javier seguía
  // apareciendo asignable estando de descanso). Idempotente (upsert con ignoreDuplicates).
  await ensureDiasDescansoGenerados(hoyISO())
  const [
    tipos,
    combos,
    servicios,
    preciosServicioCombo,
    preciosServicioIndividual,
    preciosComboFijo,
    comboServicios,
    lavadores,
    ordenesHoy,
    turno,
    configuracion,
    descansosHoy,
  ] = await Promise.all([
    fetchTiposVehiculo(),
    fetchCombos(),
    fetchServicios(),
    fetchPreciosServicioCombo(),
    fetchPreciosServicioIndividual(),
    fetchPreciosComboFijo(),
    fetchComboServicios(),
    fetchLavadores(),
    fetchOrdenesHoy(),
    fetchTurnoAbierto('jefe_zona'),
    fetchConfiguracion(),
    fetchDiasDescanso(hoyISO(), hoyISO()),
  ])
  return {
    tipos,
    combos,
    servicios,
    preciosServicioCombo,
    preciosServicioIndividual,
    preciosComboFijo,
    comboServicios,
    lavadores,
    ordenesHoy,
    turno,
    configuracion,
    descansosHoy,
  }
}

export const Route = createFileRoute('/recepcion/')({
  beforeLoad: ({ context }) => {
    if (!context.auth) throw redirect({ to: '/login' })
    const { rol, activo } = context.auth.perfil
    if ((rol !== 'jefe_zona' && rol !== 'admin') || !activo) {
      throw redirect({ to: '/login' })
    }
  },
  loader: loadRecepcion,
  component: RecepcionPage,
})

const ESTADO_LABEL: Record<EstadoOrden, string> = {
  en_proceso: 'En proceso',
  listo: 'Listo',
  entregado: 'Entregado',
  anulada: 'Anulada',
}

const ESTADO_CLASS: Record<EstadoOrden, string> = {
  en_proceso: 'bg-warning-50 text-warning-700',
  listo: 'bg-primary-50 text-primary-700',
  entregado: 'bg-success-50 text-success-700',
  anulada: 'bg-danger-50 text-danger-700',
}

const COP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })

function RecepcionPage() {
  const data = Route.useLoaderData()
  const router = useRouter()
  const [tipos] = useState<TipoVehiculo[]>(data.tipos)
  const [combos] = useState<Combo[]>(data.combos)
  const [servicios] = useState<Servicio[]>(data.servicios)
  const [preciosServicioCombo] = useState<PrecioServicio[]>(data.preciosServicioCombo)
  const [preciosServicioIndividual] = useState<PrecioServicio[]>(data.preciosServicioIndividual)
  const [preciosComboFijo] = useState<PrecioCombo[]>(data.preciosComboFijo)
  const [comboServicios] = useState<ComboServicio[]>(data.comboServicios)
  const [lavadores] = useState<Lavador[]>(data.lavadores)
  const [ordenesHoy, setOrdenesHoy] = useState<Orden[]>(data.ordenesHoy)

  async function refresh() {
    setOrdenesHoy(await fetchOrdenesHoy())
    router.invalidate()
  }

  const tipoNombre = (id: string) => tipos.find((t) => t.id === id)?.nombre ?? '—'
  const comboNombre = (id: string | undefined) => (id ? combos.find((c) => c.id === id)?.nombre : undefined) ?? 'Sin combo'
  const lavadorNombre = (id: string | undefined) => (id ? lavadores.find((l) => l.id === id)?.nombre : undefined) ?? 'Sin asignar'

  return (
    <>
      <SimpleTopbar title="Recepción" onLogout={signOut} />
      <div className="mx-auto flex max-w-2xl flex-col gap-6 pb-6">
      {data.turno ? (
        <ReceptionForm
          tipos={tipos}
          combos={combos}
          servicios={servicios}
          preciosServicioCombo={preciosServicioCombo}
          preciosServicioIndividual={preciosServicioIndividual}
          preciosComboFijo={preciosComboFijo}
          comboServicios={comboServicios}
          lavadores={lavadores}
          ordenesHoy={ordenesHoy}
          descansosHoy={data.descansosHoy}
          configuracion={data.configuracion}
          onCreated={refresh}
        />
      ) : (
        <Card className="flex flex-col items-center gap-3 py-10 text-center">
          <span className="flex size-12 items-center justify-center rounded-xl bg-warning-50 text-warning-700">
            <Lock size={22} strokeWidth={2} />
          </span>
          <div>
            <h2 className="text-base font-semibold text-neutral-900">No hay turno de caja abierto</h2>
            <p className="mt-1 max-w-sm text-sm text-neutral-500">
              Hay que abrir la caja del día antes de registrar vehículos — así todo lo que se cobre después
              queda contado en el arqueo del turno correcto.
            </p>
          </div>
          <Link
            to="/jefe-zona/caja"
            className="mt-2 rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white shadow-nav-active transition-colors hover:bg-primary-700"
          >
            Abrir turno
          </Link>
        </Card>
      )}

      <div>
        <h2 className="mb-2 px-1 text-sm font-semibold text-neutral-900">
          Vehículos de hoy ({ordenesHoy.length})
        </h2>
        <div className="flex flex-col gap-2">
          {ordenesHoy.map((orden) => (
            <Card key={orden.id} className="flex items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-semibold text-neutral-900">{orden.placa}</span>
                  <span className="text-xs text-neutral-400">#{orden.consecutivo}</span>
                </div>
                <p className="mt-0.5 truncate text-xs text-neutral-500">
                  {tipoNombre(orden.tipoVehiculoId)} · {comboNombre(orden.comboId)} · {lavadorNombre(orden.lavadorId)}
                  {orden.lavadorId2 ? ` + ${lavadorNombre(orden.lavadorId2)}` : ''}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1.5">
                <span className="text-sm font-semibold text-neutral-900">{COP.format(orden.precio)}</span>
                <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${ESTADO_CLASS[orden.estado]}`}>
                  {ESTADO_LABEL[orden.estado]}
                </span>
              </div>
            </Card>
          ))}
          {ordenesHoy.length === 0 ? (
            <Card className="py-10 text-center text-sm text-neutral-400">Todavía no se han registrado vehículos hoy.</Card>
          ) : null}
        </div>
        <p className="mt-2 px-1 text-xs text-neutral-400">
          Marcar listo y cobrar/entregar se hace desde el panel de jefe de zona.
        </p>
      </div>
      </div>
    </>
  )
}

const emptyForm = {
  placa: '',
  clienteNombre: '',
  clienteTelefono: '',
  clienteCorreo: '',
  tipoVehiculoId: '',
  comboId: '',
  lavadorId: '',
  lavadorId2: '',
  observaciones: '',
  altoCilindraje: false,
}

function ReceptionForm({
  tipos,
  combos,
  servicios,
  preciosServicioCombo,
  preciosServicioIndividual,
  preciosComboFijo,
  comboServicios,
  lavadores,
  ordenesHoy,
  descansosHoy,
  configuracion,
  onCreated,
}: {
  tipos: TipoVehiculo[]
  combos: Combo[]
  servicios: Servicio[]
  preciosServicioCombo: PrecioServicio[]
  preciosServicioIndividual: PrecioServicio[]
  preciosComboFijo: PrecioCombo[]
  comboServicios: ComboServicio[]
  lavadores: Lavador[]
  ordenesHoy: Orden[]
  descansosHoy: DiaDescanso[]
  configuracion: Configuracion
  onCreated: () => void
}) {
  const [form, setForm] = useState(emptyForm)
  // Elegir "combo" o "servicios" es una decisión explícita del usuario, no un valor más dentro
  // del selector de combo — en modo "combo" se puede además agregar servicios sueltos encima
  // (el checklist de abajo sigue disponible); en modo "servicios" la orden es solo servicios,
  // sin combo.
  const [modo, setModo] = useState<'combo' | 'servicios'>('combo')
  const [serviciosAdicionales, setServiciosAdicionales] = useState<string[]>([])
  const [openStep, setOpenStep] = useState(1)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [recibo, setRecibo] = useState<ReciboData | null>(null)
  // Alerta de doble registro (M2) — solo para motos: si la placa ya tiene una orden en_proceso,
  // avisa antes de registrar otra vez el mismo vehículo por error. No bloquea el envío, solo
  // advierte — puede haber casos legítimos raros de re-ingreso.
  const [motoDuplicada, setMotoDuplicada] = useState<Orden | undefined>(undefined)
  // "Lavar entre 2" — a criterio de quien recibe, caso a caso. Checkbox separado del selector del
  // segundo lavador para que desmarcar limpie de una vez form.lavadorId2 (evita mandar un
  // lavadorId2 residual si el usuario desmarca sin borrar la selección).
  const [lavarEntreDos, setLavarEntreDos] = useState(false)

  useEffect(() => {
    suggestNextLavador().then((id) => {
      if (id) setForm((prev) => (prev.lavadorId ? prev : { ...prev, lavadorId: id }))
    })
  }, [])

  // Si cambia el lavador principal y queda igual al segundo ya elegido, se limpia el segundo —
  // regla de negocio: los dos lavadores de una orden deben ser distintos.
  useEffect(() => {
    if (form.lavadorId2 && form.lavadorId2 === form.lavadorId) {
      update('lavadorId2', '')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.lavadorId])

  // Mismo criterio de "ocupado" que /jefe-zona (regla de negocio 9): tiene una orden en_proceso
  // a su cargo ahora mismo. No se oculta al lavador ocupado ni se bloquea seleccionarlo — algunos
  // lavan dos vehículos a la vez — solo se marca para que quien recibe decida con esa información.
  // El que descansa hoy (M9) sí se oculta del todo: no tiene sentido asignarle nada ese día.
  const descansaHoyId = descansosHoy[0]?.lavadorId
  const ocupadosIds = useMemo(
    () =>
      new Set(
        ordenesHoy
          .filter((o) => o.estado === 'en_proceso')
          .flatMap((o) => [o.lavadorId, o.lavadorId2])
          .filter((id): id is string => !!id),
      ),
    [ordenesHoy],
  )
  // "Sin asignar" siempre disponible como opción explícita del select, no solo como placeholder —
  // por si las moscas (el lavador sugerido cambia de planes, resulta que sí está ocupado aunque
  // no lo marque el sistema, etc.) se puede dejar sin asignar aunque NO estén todos ocupados, sin
  // tener que borrar a mano lo que ya eligió `suggestNextLavador`.
  const lavadorOptions = useMemo(() => {
    const disponibles = lavadores.filter((l) => l.activo && l.id !== descansaHoyId)
    return [
      { value: '', label: 'Sin asignar', description: 'Se asigna después desde el tablero de seguimiento' },
      ...[...disponibles]
        .sort((a, b) => Number(ocupadosIds.has(a.id)) - Number(ocupadosIds.has(b.id)))
        .map((l) => ({
          value: l.id,
          label: l.nombre,
          description: ocupadosIds.has(l.id) ? 'Ocupado ahora mismo — igual se puede asignar' : undefined,
        })),
    ]
  }, [lavadores, ocupadosIds, descansaHoyId])
  // lavadorOptions[0] es siempre "Sin asignar" (value ''), no cuenta como lavador real acá.
  const lavadoresReales = lavadorOptions.filter((o) => o.value !== '')
  const todosOcupados = lavadoresReales.length > 0 && lavadoresReales.every((o) => ocupadosIds.has(o.value))

  const tipoSeleccionado = tipos.find((t) => t.id === form.tipoVehiculoId)

  const combosDisponibles = useMemo(
    () =>
      combos.filter(
        (combo) =>
          combo.activo &&
          precioComboCalculado(combo, form.tipoVehiculoId, comboServicios, preciosServicioCombo, preciosComboFijo) !==
            undefined,
      ),
    [combos, comboServicios, preciosServicioCombo, preciosComboFijo, form.tipoVehiculoId],
  )

  const comboSeleccionado = form.comboId ? combos.find((c) => c.id === form.comboId) : undefined

  const precioCombo = comboSeleccionado
    ? precioComboCalculado(comboSeleccionado, form.tipoVehiculoId, comboServicios, preciosServicioCombo, preciosComboFijo)
    : undefined

  // Servicios que ya vienen incluidos en el combo elegido no se ofrecen para agregar de nuevo
  // (aparte, encima) — evita cobrar dos veces lo mismo.
  const servicioIdsDelCombo = useMemo(
    () => new Set(comboServicios.filter((cs) => cs.comboId === form.comboId).map((cs) => cs.servicioId)),
    [comboServicios, form.comboId],
  )

  const serviciosDisponibles = useMemo(
    () =>
      servicios.filter(
        (s) =>
          s.activo &&
          s.categoria === (tipoSeleccionado?.categoria as CategoriaVehiculo | undefined) &&
          !servicioIdsDelCombo.has(s.id),
      ),
    [servicios, tipoSeleccionado, servicioIdsDelCombo],
  )

  // Servicios individuales (sea que la orden no lleve combo, o que se agreguen sueltos encima
  // de uno) siempre se cobran al precio individual, no al precio de combo — regla de negocio
  // confirmada: el recargo por venderse solo/suelto es real y no siempre es exactamente $5.000.
  const precioServiciosIndividuales = serviciosAdicionales.reduce((suma, servicioId) => {
    const precio = findPrecioServicioIndividual(preciosServicioIndividual, servicioId, form.tipoVehiculoId)?.precio
    return suma + (precio ?? 0)
  }, 0)

  // Recargo fijo de moto alto cilindraje (configurable en Admin > Configuración) — solo aplica
  // si el tipo elegido es de categoría moto, aunque el checkbox ya se oculta en ese caso.
  const recargoAltoCilindraje =
    form.altoCilindraje && tipoSeleccionado?.categoria === 'moto' ? configuracion.recargoAltoCilindraje : 0

  // Si hay combo elegido pero no se le pudo calcular precio (ej. le faltan servicios/precios
  // configurados para este tipo de vehículo — como pasa hoy con las motos), el total NO está
  // listo: mostrar $0 sería engañoso y dejaría enviar una orden que el servidor va a rechazar.
  const precio =
    form.comboId && precioCombo === undefined
      ? undefined
      : form.comboId || serviciosAdicionales.length > 0
        ? (precioCombo ?? 0) + precioServiciosIndividuales + recargoAltoCilindraje
        : undefined

  const paso1Completo = !!(form.placa && form.clienteNombre && form.tipoVehiculoId)
  // El lavador es opcional: si los 4 están ocupados y hay cola, se registra sin asignar y se
  // asigna después desde el tablero de seguimiento (jefe de zona).
  const paso2Completo = !!(
    (form.comboId && precioCombo !== undefined) || (!form.comboId && serviciosAdicionales.length > 0)
  )

  function update<K extends keyof typeof emptyForm>(key: K, value: (typeof emptyForm)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function toggleStep(step: number) {
    setOpenStep((prev) => (prev === step ? 0 : step))
  }

  // Solo se dispara con moto ya seleccionada (o recién elegida en handleTipoChange) — se pasa el
  // tipo explícito en vez de leer `form.tipoVehiculoId` porque handleTipoChange lo llama ANTES de
  // que el estado se actualice.
  async function checkMotoDuplicada(placa: string, tipoVehiculoId: string) {
    const tipo = tipos.find((t) => t.id === tipoVehiculoId)
    if (tipo?.categoria !== 'moto' || !placa.trim()) {
      setMotoDuplicada(undefined)
      return
    }
    setMotoDuplicada(await fetchOrdenEnProcesoPorPlaca(placa))
  }

  async function handlePlacaBlur() {
    checkMotoDuplicada(form.placa, form.tipoVehiculoId)
    const historial = await buscarPorPlaca(form.placa)
    if (!historial) return
    // Solo restaurar el combo del histórico si hoy todavía tiene precio calculable para ese
    // tipo de vehículo — si le faltan servicios/precios configurados, dejarlo vacío para que
    // el usuario elija en vez de heredar un combo que no se puede cobrar.
    const comboHistorial = historial.comboId ? combos.find((c) => c.id === historial.comboId) : undefined
    const comboHistorialValido =
      comboHistorial &&
      precioComboCalculado(
        comboHistorial,
        historial.tipoVehiculoId,
        comboServicios,
        preciosServicioCombo,
        preciosComboFijo,
      ) !== undefined
    setForm((prev) => ({
      ...prev,
      clienteNombre: prev.clienteNombre || historial.clienteNombre,
      clienteTelefono: prev.clienteTelefono || historial.clienteTelefono || '',
      clienteCorreo: prev.clienteCorreo || historial.clienteCorreo || '',
      tipoVehiculoId: prev.tipoVehiculoId || historial.tipoVehiculoId,
      comboId: prev.comboId || (comboHistorialValido ? historial.comboId ?? '' : ''),
    }))
  }

  function handleTipoChange(tipoVehiculoId: string) {
    setForm((prev) => ({ ...prev, tipoVehiculoId, comboId: '', altoCilindraje: false }))
    setServiciosAdicionales([])
    checkMotoDuplicada(form.placa, tipoVehiculoId)
  }

  function handleComboChange(comboId: string) {
    update('comboId', comboId)
    setServiciosAdicionales([])
  }

  function handleModoChange(nuevoModo: 'combo' | 'servicios') {
    setModo(nuevoModo)
    update('comboId', '')
    setServiciosAdicionales([])
  }

  function toggleServicioAdicional(servicioId: string) {
    setServiciosAdicionales((prev) =>
      prev.includes(servicioId) ? prev.filter((id) => id !== servicioId) : [...prev, servicioId],
    )
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const parsed = ordenInputSchema.safeParse({
      ...form,
      comboId: form.comboId || undefined,
      lavadorId: form.lavadorId || undefined,
      lavadorId2: lavarEntreDos ? form.lavadorId2 || undefined : undefined,
      clienteTelefono: form.clienteTelefono || undefined,
      clienteCorreo: form.clienteCorreo || undefined,
      observaciones: form.observaciones || undefined,
      serviciosAdicionales,
    })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Revisa los datos del formulario')
      return
    }
    setError(null)
    setSaving(true)
    try {
      const orden = await createOrden(parsed.data)
      setRecibo({
        consecutivo: orden.consecutivo,
        placa: orden.placa,
        clienteNombre: orden.clienteNombre,
        comboNombre: orden.comboId ? combos.find((c) => c.id === orden.comboId)?.nombre ?? '—' : 'Sin combo',
        serviciosAdicionales: orden.serviciosAdicionales.map((s) => s.nombre),
        tipoNombre: tipos.find((t) => t.id === orden.tipoVehiculoId)?.nombre ?? '—',
        lavadorNombre: orden.lavadorId ? lavadores.find((l) => l.id === orden.lavadorId)?.nombre ?? '—' : 'Sin asignar',
        lavadorNombre2: orden.lavadorId2 ? lavadores.find((l) => l.id === orden.lavadorId2)?.nombre ?? '—' : undefined,
        precio: orden.precio,
        fecha: orden.creadoEn,
      })
      const siguienteLavador = await suggestNextLavador()
      setForm({ ...emptyForm, lavadorId: siguienteLavador ?? '' })
      setServiciosAdicionales([])
      setMotoDuplicada(undefined)
      setLavarEntreDos(false)
      setOpenStep(1)
      onCreated()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar la orden')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <AccordionSection
        step={1}
        title="Vehículo"
        summary={form.placa ? `${form.placa}${form.clienteNombre ? ` · ${form.clienteNombre}` : ''}` : 'Placa y cliente'}
        isOpen={openStep === 1}
        isComplete={paso1Completo}
        onToggle={() => toggleStep(1)}
      >
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-neutral-700">Placa</span>
          <input
            autoFocus
            value={form.placa}
            onChange={(e) => {
              // Placa colombiana: solo letras y números, máximo 6 caracteres (3+3 carro, 3+2+1
              // moto) — se filtra al teclear, el formato exacto se valida al enviar (placaSchema).
              update('placa', e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))
              setMotoDuplicada(undefined)
            }}
            onBlur={handlePlacaBlur}
            maxLength={6}
            placeholder="MAQ068"
            className="rounded-lg border border-neutral-300 px-3 py-3 font-mono text-base uppercase outline-none transition-colors focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
          />
        </label>

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-neutral-700">Tipo de vehículo</span>
          <CustomSelect
            value={form.tipoVehiculoId}
            onChange={handleTipoChange}
            placeholder="Selecciona…"
            options={tipos.filter((t) => t.activo).map((t) => ({ value: t.id, label: t.nombre }))}
          />
        </label>

        {motoDuplicada ? (
          <div className="flex items-start gap-2.5 rounded-lg border border-warning-300 bg-warning-50 px-3 py-2.5 text-sm text-warning-800">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <span>
              Esta moto ya está registrada y en proceso — orden #{motoDuplicada.consecutivo},{' '}
              {motoDuplicada.clienteNombre}
              {motoDuplicada.lavadorId
                ? ` con ${lavadores.find((l) => l.id === motoDuplicada.lavadorId)?.nombre ?? 'un lavador'}`
                : ', sin lavador asignado'}
              . Verifica que no sea un duplicado antes de continuar.
            </span>
          </div>
        ) : null}

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-neutral-700">Cliente</span>
          <input
            value={form.clienteNombre}
            onChange={(e) => update('clienteNombre', e.target.value)}
            placeholder="Nombre"
            className="rounded-lg border border-neutral-300 px-3 py-3 text-base outline-none transition-colors focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-neutral-700">Teléfono</span>
            <input
              value={form.clienteTelefono}
              onChange={(e) => update('clienteTelefono', e.target.value)}
              placeholder="Opcional"
              className="rounded-lg border border-neutral-300 px-3 py-3 text-base outline-none transition-colors focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-neutral-700">Correo</span>
            <input
              type="email"
              value={form.clienteCorreo}
              onChange={(e) => update('clienteCorreo', e.target.value)}
              placeholder="Opcional"
              className="rounded-lg border border-neutral-300 px-3 py-3 text-base outline-none transition-colors focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
            />
          </label>
        </div>

        <button
          type="button"
          onClick={() => setOpenStep(2)}
          disabled={!paso1Completo}
          className="rounded-lg bg-primary-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-700 disabled:opacity-40"
        >
          Continuar
        </button>
      </AccordionSection>

      <AccordionSection
        step={2}
        title="Servicio"
        summary={form.comboId ? combos.find((c) => c.id === form.comboId)?.nombre : 'Servicios y lavador'}
        isOpen={openStep === 2}
        isComplete={paso2Completo}
        onToggle={() => toggleStep(2)}
      >
        <div className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-neutral-700">¿Qué se registra?</span>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                { value: 'combo' as const, label: 'Combo' },
                { value: 'servicios' as const, label: 'Servicios sueltos' },
              ]
            ).map(({ value, label }) => (
              <button
                key={value}
                type="button"
                onClick={() => handleModoChange(value)}
                className={`rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors ${
                  modo === value
                    ? 'border-primary-600 bg-primary-50 text-primary-700'
                    : 'border-neutral-200 text-neutral-600 hover:bg-neutral-50'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {modo === 'combo' ? (
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="flex items-center gap-1.5 font-medium text-neutral-700">
              <Package size={14} className="text-primary-500" /> Combo
            </span>
            <CustomSelect
              value={form.comboId}
              onChange={handleComboChange}
              disabled={!form.tipoVehiculoId}
              placeholder={form.tipoVehiculoId ? 'Selecciona…' : 'Primero elige el tipo de vehículo'}
              emptyLabel="No hay combos con precio para ese tipo"
              options={combosDisponibles.map((c) => ({ value: c.id, label: c.nombre, description: c.descripcion }))}
            />
          </label>
        ) : null}

        {comboSeleccionado?.descripcion ? (
          <p className="text-sm text-neutral-500">{comboSeleccionado.descripcion}</p>
        ) : null}

        {form.tipoVehiculoId && (modo === 'servicios' || serviciosDisponibles.length > 0) ? (
          <div className="flex flex-col gap-1.5 rounded-lg border border-neutral-200 p-3">
            <span className="flex items-center gap-1.5 text-sm font-medium text-neutral-700">
              <Sparkles size={14} className="text-primary-500" />
              {modo === 'combo' ? 'Servicios adicionales' : 'Servicios'}
              <span className="font-normal text-neutral-400">
                {modo === 'combo' ? '(opcional, fuera del combo)' : '(precio individual)'}
              </span>
            </span>
            {serviciosDisponibles.map((servicio) => (
              <label key={servicio.id} className="flex items-center gap-2.5 rounded-lg px-1 py-1 text-sm">
                <input
                  type="checkbox"
                  checked={serviciosAdicionales.includes(servicio.id)}
                  onChange={() => toggleServicioAdicional(servicio.id)}
                  className="size-4 rounded border-neutral-300 text-primary-600 focus:ring-primary-500"
                />
                <span className="text-neutral-700">{servicio.nombre}</span>
                <span className="ml-auto text-xs text-neutral-400">
                  {COP.format(findPrecioServicioIndividual(preciosServicioIndividual, servicio.id, form.tipoVehiculoId)?.precio ?? 0)}
                </span>
              </label>
            ))}
          </div>
        ) : null}

        {tipoSeleccionado?.categoria === 'moto' ? (
          <label className="flex items-center gap-2.5 rounded-lg border border-neutral-200 px-3 py-3 text-sm">
            <input
              type="checkbox"
              checked={form.altoCilindraje}
              onChange={(e) => update('altoCilindraje', e.target.checked)}
              className="size-4 rounded border-neutral-300 text-primary-600 focus:ring-primary-500"
            />
            <span className="text-neutral-700">
              Alto cilindraje
              <span className="ml-1 text-xs text-neutral-400">(+{COP.format(configuracion.recargoAltoCilindraje)})</span>
            </span>
          </label>
        ) : null}

        {precio !== undefined ? (
          <div className="flex items-center justify-between rounded-lg bg-primary-50 px-3 py-2.5 text-sm">
            <span className="font-medium text-primary-900">Precio: {COP.format(precio)}</span>
          </div>
        ) : null}
        <p className="text-xs text-neutral-400">
          El precio se cobra al entregar el vehículo, no ahora — este tiquete es solo de ingreso.
        </p>

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="flex items-center gap-1.5 font-medium text-neutral-700">
            <Car size={14} className="text-primary-500" /> Lavador asignado
            <span className="font-normal text-neutral-400">(opcional)</span>
          </span>
          <CustomSelect
            value={form.lavadorId}
            onChange={(value) => update('lavadorId', value)}
            placeholder="Sin asignar — se asigna después"
            options={lavadorOptions}
          />
          <span className="text-xs text-neutral-400">
            {todosOcupados
              ? 'Todos los lavadores están ocupados ahora mismo — se recomienda dejarlo sin asignar y hacerlo después desde el tablero de seguimiento, aunque igual puedes elegir uno si va a lavar dos a la vez.'
              : 'Sugerido por la cola de rotación, pero se puede dejar "Sin asignar" aunque no todos estén ocupados — por si las moscas (el lavador cambia de plan, el sistema no se dio cuenta de que ya está ocupado, etc.) — y hacerlo después desde el tablero de seguimiento.'}
          </span>
        </label>

        {form.lavadorId ? (
          <label className="flex items-center gap-2.5 rounded-lg border border-neutral-200 px-3 py-3 text-sm">
            <input
              type="checkbox"
              checked={lavarEntreDos}
              onChange={(e) => {
                setLavarEntreDos(e.target.checked)
                if (!e.target.checked) update('lavadorId2', '')
              }}
              className="size-4 rounded border-neutral-300 text-primary-600 focus:ring-primary-500"
            />
            <span className="text-neutral-700">Lavar entre 2 — la comisión se reparte entre los dos lavadores</span>
          </label>
        ) : null}

        {lavarEntreDos && form.lavadorId ? (
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="flex items-center gap-1.5 font-medium text-neutral-700">
              <Car size={14} className="text-primary-500" /> Segundo lavador
            </span>
            <CustomSelect
              value={form.lavadorId2}
              onChange={(value) => update('lavadorId2', value)}
              placeholder="Selecciona…"
              options={lavadorOptions.filter((o) => o.value !== form.lavadorId)}
              emptyLabel="No hay otro lavador disponible"
            />
          </label>
        ) : null}

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-neutral-700">Observaciones</span>
          <textarea
            value={form.observaciones}
            onChange={(e) => update('observaciones', e.target.value)}
            rows={2}
            placeholder="Estado del vehículo, rayones, etc. (opcional)"
            className="resize-none rounded-lg border border-neutral-300 px-3 py-2.5 text-base outline-none transition-colors focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
          />
        </label>
      </AccordionSection>

      {error ? <p className="px-1 text-xs text-danger-600">{error}</p> : null}

      <button
        type="submit"
        disabled={saving || !paso1Completo || !paso2Completo}
        className="rounded-lg bg-primary-600 py-3.5 text-sm font-semibold text-white shadow-nav-active transition-colors hover:bg-primary-700 disabled:opacity-40"
      >
        {saving ? 'Registrando…' : 'Registrar ingreso'}
      </button>

      {recibo ? <ReciboModal recibo={recibo} variant="ingreso" onClose={() => setRecibo(null)} /> : null}
    </form>
  )
}
