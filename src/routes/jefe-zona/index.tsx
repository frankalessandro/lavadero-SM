import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import {
  Droplets,
  ClipboardList,
  Users,
  Wallet,
  ArrowRight,
  X,
  CheckCircle2,
  Banknote,
  Package,
  Car,
  Clock,
  SprayCan,
  Repeat,
  Timer,
  LockOpen,
  Lock,
  MessageCircle,
  Motorbike,
  UserRound,
  Pencil,
} from 'lucide-react'
import {
  fetchOrdenesHoy,
  fetchOrdenesEntregadasHoy,
  marcarListo,
  cobrarYEntregarOrden,
  reasignarLavador,
  editarInfoCliente,
} from '../../data/ordenes'
import { fetchLavadores } from '../../data/lavadores'
import { fetchAsistenciasDelDia, fetchDiasDescanso } from '../../data/asistenciaLavadores'
import { fetchCombos } from '../../data/combos'
import { fetchTiposVehiculo } from '../../data/tiposVehiculo'
import { fetchTurnoAbierto } from '../../data/turnos'
import { clienteInfoInputSchema, cobroInputSchema, type MetodoPago, type Orden } from '../../schemas/orden'
import { StatCard } from '../../components/layout/StatCard'
import { Card } from '../../components/layout/Card'
import { CustomSelect } from '../../components/layout/CustomSelect'
import { ReciboModal, type ReciboData } from '../../components/layout/ReciboModal'
import { ConfirmModal } from '../../components/layout/ConfirmModal'
import { ContactoModal } from '../../components/layout/ContactoModal'
import { LavadoAnimation } from '../../components/layout/LavadoAnimation'
import { BarChart } from '../../components/layout/BarChart'

function hoyISO(): string {
  return new Date().toISOString().slice(0, 10)
}

async function loadDashboard() {
  const hoy = hoyISO()
  const [ordenesHoy, entregadasHoy, lavadores, combos, tiposVehiculo, turno, asistenciasHoy, descansosHoy] =
    await Promise.all([
      fetchOrdenesHoy(),
      fetchOrdenesEntregadasHoy(),
      fetchLavadores(),
      fetchCombos(),
      fetchTiposVehiculo(),
      fetchTurnoAbierto('jefe_zona'),
      fetchAsistenciasDelDia(hoy),
      fetchDiasDescanso(hoy, hoy),
    ])
  return { ordenesHoy, entregadasHoy, lavadores, combos, tiposVehiculo, turno, asistenciasHoy, descansosHoy }
}

export const Route = createFileRoute('/jefe-zona/')({
  loader: loadDashboard,
  component: JefeZonaDashboard,
})

const COP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })

// Formato "45 seg" / "12 min 5 seg" / "1 h 5 min 30 seg" — a diferencia de `tiempoTranscurrido` en
// src/routes/vigilante/index.tsx (ese se queda en min), este dashboard sí necesita precisión de segundos.
// Recibe `ahora` en vez de leer Date.now() adentro: el React Compiler solo re-evalúa esta llamada
// en cada render si detecta que uno de sus argumentos cambió, y `ahora` (el tick del estado) es
// justamente lo que lo fuerza a actualizarse cada segundo en vez de quedarse memoizado.
function tiempoTranscurrido(desde: string, ahora: number): string {
  const totalSegundos = Math.max(0, Math.floor((ahora - new Date(desde).getTime()) / 1000))
  const horas = Math.floor(totalSegundos / 3600)
  const minutos = Math.floor((totalSegundos % 3600) / 60)
  const segundos = totalSegundos % 60
  const partes: string[] = []
  if (horas > 0) partes.push(`${horas} h`)
  if (horas > 0 || minutos > 0) partes.push(`${minutos} min`)
  partes.push(`${segundos} seg`)
  return partes.join(' ')
}

function formatMinutos(minutos: number): string {
  if (minutos < 60) return `${Math.round(minutos)} min`
  const horas = Math.floor(minutos / 60)
  return `${horas} h ${Math.round(minutos % 60)} min`
}

function JefeZonaDashboard() {
  const data = Route.useLoaderData()
  const router = useRouter()
  const [ordenesHoy, setOrdenesHoy] = useState(data.ordenesHoy)
  const [entregadasHoy, setEntregadasHoy] = useState(data.entregadasHoy)
  const [lavadores] = useState(data.lavadores)
  const [asistenciasHoy] = useState(data.asistenciasHoy)
  const [descansosHoy] = useState(data.descansosHoy)
  const [combos] = useState(data.combos)
  const [tiposVehiculo] = useState(data.tiposVehiculo)
  const [turno, setTurno] = useState(data.turno)
  const [cobrando, setCobrando] = useState<Orden | null>(null)
  const [reasignando, setReasignando] = useState<Orden | null>(null)
  const [editandoCliente, setEditandoCliente] = useState<Orden | null>(null)
  const [finalizando, setFinalizando] = useState<Orden | null>(null)
  const [recibo, setRecibo] = useState<ReciboData | null>(null)
  const [contactando, setContactando] = useState<Orden | null>(null)

  // Reloj compartido para el contador en vivo de cada tarjeta — un solo interval en vez de
  // uno por tarjeta, se limpia al desmontar el dashboard. Se guarda como estado (no un simple
  // contador descartado) porque `tiempoTranscurrido` lo recibe como argumento explícito: así el
  // React Compiler lo detecta como dependencia real y no memoiza el texto entre ticks.
  const [ahora, setAhora] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setAhora(Date.now()), 1_000)
    return () => clearInterval(id)
  }, [])

  async function refresh() {
    const [nuevasOrdenes, nuevasEntregadas, nuevoTurno] = await Promise.all([
      fetchOrdenesHoy(),
      fetchOrdenesEntregadasHoy(),
      fetchTurnoAbierto('jefe_zona'),
    ])
    setOrdenesHoy(nuevasOrdenes)
    setEntregadasHoy(nuevasEntregadas)
    setTurno(nuevoTurno)
    router.invalidate()
  }

  async function handleMarcarListo(orden: Orden) {
    await marcarListo(orden.id)
    await refresh()
  }

  const comboNombre = (id: string) => combos.find((c) => c.id === id)?.nombre ?? '—'
  const lavadorNombre = (id: string) => lavadores.find((l) => l.id === id)?.nombre ?? '—'
  const tipoVehiculo = (id: string) => tiposVehiculo.find((t) => t.id === id)

  const enProcesoLista = ordenesHoy.filter((o) => o.estado === 'en_proceso')
  const listoLista = ordenesHoy.filter((o) => o.estado === 'listo')
  const lavadoresActivos = lavadores.filter((l) => l.activo).length

  // Misma regla de la cola de rotación que usa `suggestNextLavador` en /recepcion (regla de
  // negocio 9): NULL primero (nunca asignado), luego el que lleva más tiempo sin lavar; si
  // empatan (típicamente todos en NULL al abrir un día nuevo, antes del primer lavado), la
  // primera oleada del día se desempata por `hora_entrada` real de la asistencia (confirmado con
  // Alessandro). Acá se ordena en el cliente sobre la misma lista que ya trae el loader — no es
  // una fuente de verdad aparte, es la misma cola, solo que mostrando el orden completo en vez de
  // únicamente el primero.
  const horaEntradaPorId = new Map(asistenciasHoy.map((a) => [a.lavadorId, a.horaEntrada]))
  const ordenRotacion = [...lavadores]
    .filter((l) => l.activo)
    .sort((a, b) => {
      const asigA = a.ultimaAsignacion ? new Date(a.ultimaAsignacion).getTime() : -Infinity
      const asigB = b.ultimaAsignacion ? new Date(b.ultimaAsignacion).getTime() : -Infinity
      if (asigA !== asigB) return asigA - asigB
      const horaA = horaEntradaPorId.get(a.id)
      const horaB = horaEntradaPorId.get(b.id)
      if (!horaA || !horaB) return 0
      return new Date(horaA).getTime() - new Date(horaB).getTime()
    })
  const presentesHoyIds = new Set(asistenciasHoy.map((a) => a.lavadorId))
  const descansaHoyId = descansosHoy[0]?.lavadorId
  const ocupadosIds = new Set(enProcesoLista.map((o) => o.lavadorId))
  // Mismo criterio de elegibilidad que suggestNextLavador (M9 + regla de negocio 9): activo,
  // presente hoy, sin descanso asignado hoy, y no ocupado ahora mismo (con una orden en_proceso
  // a su cargo). No se ocultan los demás de la lista — se marcan, para que quede claro por qué se
  // saltan en vez de simplemente desaparecer.
  const proximoEnRotacion = ordenRotacion.find(
    (l) => presentesHoyIds.has(l.id) && l.id !== descansaHoyId && !ocupadosIds.has(l.id),
  )
  // Solo lo cobrado hoy — un vehículo registrado hoy pero no entregado no cuenta como plata en caja.
  const cajaDelDia = entregadasHoy.reduce((total, o) => total + o.precio, 0)

  // Tiempo de lavado de hoy (M3), por combo y por lavador — mide solo el lavado en sí
  // (creado→listo, `tiempoLavadoSegundos`), no el ciclo completo. Antes se calculaba como
  // entregadaEn−creadoEn, pero eso mezclaba el lavado con cuánto se demora el CLIENTE en venir
  // a recoger — un combo podía verse "lento" solo porque a sus clientes les gusta dejar el carro
  // más tiempo, sin que el lavado en sí tardara más. Con las columnas fijas en cada orden
  // (ver M3/M9) separamos las dos cosas: esto sí varía por combo/lavador (tiene sentido como
  // chart), la espera del cliente no depende de ninguno de los dos (por eso va como un solo
  // número más abajo, no como una tercera barra sin lógica real detrás).
  const promedios = useMemo(() => {
    const porCombo = new Map<string, { total: number; cantidad: number }>()
    const porLavador = new Map<string, { total: number; cantidad: number }>()
    let esperaTotal = 0
    let esperaCantidad = 0
    for (const orden of entregadasHoy) {
      if (orden.tiempoLavadoSegundos != null) {
        const minutos = orden.tiempoLavadoSegundos / 60
        const combo = porCombo.get(orden.comboId) ?? { total: 0, cantidad: 0 }
        combo.total += minutos
        combo.cantidad += 1
        porCombo.set(orden.comboId, combo)
        const lavador = porLavador.get(orden.lavadorId) ?? { total: 0, cantidad: 0 }
        lavador.total += minutos
        lavador.cantidad += 1
        porLavador.set(orden.lavadorId, lavador)
      }
      if (orden.tiempoEsperaEntregaSegundos != null) {
        esperaTotal += orden.tiempoEsperaEntregaSegundos / 60
        esperaCantidad += 1
      }
    }
    return {
      porCombo: Array.from(porCombo.entries()).map(([id, v]) => ({
        nombre: comboNombre(id),
        promedio: v.total / v.cantidad,
      })),
      porLavador: Array.from(porLavador.entries()).map(([id, v]) => ({
        nombre: lavadorNombre(id),
        promedio: v.total / v.cantidad,
      })),
      esperaPromedioMinutos: esperaCantidad > 0 ? esperaTotal / esperaCantidad : undefined,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entregadasHoy])

  async function handleCobrado(orden: Orden, metodoPago: MetodoPago, referenciaPago?: string) {
    setRecibo({
      consecutivo: orden.consecutivo,
      placa: orden.placa,
      clienteNombre: orden.clienteNombre,
      comboNombre: comboNombre(orden.comboId),
      tipoNombre: '—',
      lavadorNombre: lavadorNombre(orden.lavadorId),
      precio: orden.precio,
      fecha: new Date().toISOString(),
      metodoPago,
      referenciaPago,
    })
    setCobrando(null)
    await refresh()
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-start gap-3 rounded-2xl bg-primary-600 p-5 text-white shadow-card sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold">Recepción de lavado</h2>
          <p className="text-sm text-primary-100">Ingreso de vehículos — el seguimiento y el cobro se hacen aquí mismo.</p>
        </div>
        <Link
          to="/recepcion"
          className="flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-primary-700 transition-colors hover:bg-primary-50"
        >
          Abrir recepción <ArrowRight size={15} />
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Lavados de hoy" value={String(ordenesHoy.length)} icon={Droplets} />
        <StatCard label="En proceso / listos" value={String(enProcesoLista.length + listoLista.length)} icon={ClipboardList} />
        <StatCard label="Lavadores activos" value={String(lavadoresActivos)} icon={Users} />
        <StatCard label="Caja del día" value={COP.format(cajaDelDia)} hint="Solo lo cobrado — sin arqueo (M5)" icon={Wallet} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Uso de escritorio: caja a la vista, sin salir del dashboard */}
        <Card className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span
              className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${
                turno ? 'bg-success-50 text-success-700' : 'bg-warning-50 text-warning-700'
              }`}
            >
              {turno ? <LockOpen size={18} strokeWidth={2} /> : <Lock size={18} strokeWidth={2} />}
            </span>
            <div>
              <p className="text-sm font-semibold text-neutral-900">
                {turno ? `Turno abierto — ${turno.responsableActual}` : 'No hay turno abierto'}
              </p>
              <p className="text-xs text-neutral-500">
                {turno ? `Desde las ${new Date(turno.abiertoEn).toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' })} · base ${COP.format(turno.baseInicial)}` : 'Ábrelo para que el arqueo cuadre al cierre.'}
              </p>
            </div>
          </div>
          <Link
            to="/jefe-zona/caja"
            className="whitespace-nowrap rounded-lg border border-neutral-200 px-3 py-2 text-xs font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
          >
            {turno ? 'Ir a caja' : 'Abrir turno'}
          </Link>
        </Card>

        {/* Misma cola que sugiere /recepcion al recibir un vehículo (regla de negocio 9) —
            mostrar el orden completo, no solo el primero, para que quede claro por qué se
            sugiere a ese lavador y no a otro. */}
        <Card className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-600">
              <Repeat size={18} strokeWidth={2} />
            </span>
            <div>
              <p className="text-sm font-semibold text-neutral-900">
                {proximoEnRotacion ? `Próximo en rotación: ${proximoEnRotacion.nombre}` : 'Nadie disponible ahora mismo'}
              </p>
              <p className="text-xs text-neutral-500">
                Por orden de llegada, entre quienes marcaron asistencia hoy y no descansan (M9).
              </p>
            </div>
          </div>
          {ordenRotacion.length > 0 ? (
            <ol className="flex flex-wrap gap-1.5">
              {ordenRotacion.map((lavador) => {
                const descansaHoy = lavador.id === descansaHoyId
                const presente = presentesHoyIds.has(lavador.id)
                const ocupado = ocupadosIds.has(lavador.id)
                const esProximo = lavador.id === proximoEnRotacion?.id
                const etiqueta = descansaHoy ? 'descansa hoy' : !presente ? 'sin llegada' : ocupado ? 'ocupado' : undefined
                return (
                  <li
                    key={lavador.id}
                    className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${
                      esProximo ? 'bg-primary-50 text-primary-700' : etiqueta ? 'bg-neutral-50 text-neutral-400' : 'bg-neutral-50 text-neutral-500'
                    }`}
                  >
                    {lavador.nombre}
                    {etiqueta ? <span className="italic">({etiqueta})</span> : null}
                  </li>
                )
              })}
            </ol>
          ) : null}
        </Card>
      </div>

      {/* Tiempo de lavado — solo tiene sentido como chart cuando hay varios combos/lavadores que
          comparar; con 1–2 nada más un número es más claro que una barra. Full-width para que
          las barras horizontales tengan espacio real, no un cuarto de página. La espera para
          recoger va como un solo número junto al título, no como una tercera barra: no depende
          de combo ni de lavador, así que partirla "por categoría" no tendría una lógica real
          detrás (ver comentario de `promedios` arriba). */}
      {entregadasHoy.length > 0 ? (
        <Card>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold text-neutral-900">
              <Timer size={15} className="text-primary-500" />
              Tiempo de lavado (hoy)
            </h3>
            {promedios.esperaPromedioMinutos !== undefined ? (
              <p className="text-xs text-neutral-500">
                Espera promedio para recoger:{' '}
                <span className="font-semibold text-neutral-900">{formatMinutos(promedios.esperaPromedioMinutos)}</span>
              </p>
            ) : null}
          </div>
          {promedios.porCombo.length === 0 ? (
            <p className="py-6 text-center text-sm text-neutral-400">Sin datos de tiempo de lavado hoy todavía.</p>
          ) : (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div>
                <p className="mb-2 text-xs font-medium text-neutral-500">Por combo</p>
                {promedios.porCombo.length > 2 ? (
                  <BarChart
                    labels={promedios.porCombo.map((p) => p.nombre)}
                    data={promedios.porCombo.map((p) => p.promedio)}
                    valueFormatter={formatMinutos}
                    height={Math.max(100, promedios.porCombo.length * 36)}
                  />
                ) : (
                  <ul className="flex flex-col gap-1.5 text-sm">
                    {promedios.porCombo.map((p) => (
                      <li key={p.nombre} className="flex items-center justify-between gap-2">
                        <span className="truncate text-neutral-600">{p.nombre}</span>
                        <span className="shrink-0 font-medium text-neutral-900">{formatMinutos(p.promedio)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <p className="mb-2 text-xs font-medium text-neutral-500">Por lavador</p>
                {promedios.porLavador.length > 2 ? (
                  <BarChart
                    labels={promedios.porLavador.map((p) => p.nombre)}
                    data={promedios.porLavador.map((p) => p.promedio)}
                    valueFormatter={formatMinutos}
                    height={Math.max(100, promedios.porLavador.length * 36)}
                  />
                ) : (
                  <ul className="flex flex-col gap-1.5 text-sm">
                    {promedios.porLavador.map((p) => (
                      <li key={p.nombre} className="flex items-center justify-between gap-2">
                        <span className="truncate text-neutral-600">{p.nombre}</span>
                        <span className="shrink-0 font-medium text-neutral-900">{formatMinutos(p.promedio)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </Card>
      ) : null}

      {/* Tablero de seguimiento (M3) — 2 columnas en escritorio, apiladas en celular */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div>
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-neutral-900">
            <SprayCan size={15} className="text-warning-600" />
            En proceso ({enProcesoLista.length})
          </h2>
          <div className="flex flex-col gap-3">
            {enProcesoLista.map((orden) => (
              <OrdenCard
                key={orden.id}
                orden={orden}
                comboNombre={comboNombre(orden.comboId)}
                lavadorNombre={lavadorNombre(orden.lavadorId)}
                tipoVehiculoNombre={tipoVehiculo(orden.tipoVehiculoId)?.nombre ?? '—'}
                esMoto={tipoVehiculo(orden.tipoVehiculoId)?.categoria === 'moto'}
                tiempoTexto={tiempoTranscurrido(orden.creadoEn, ahora)}
                onFinalizar={() => setFinalizando(orden)}
                onReasignar={() => setReasignando(orden)}
                onContactar={() => setContactando(orden)}
                onEditarCliente={() => setEditandoCliente(orden)}
              />
            ))}
            {enProcesoLista.length === 0 ? (
              <Card className="py-8 text-center text-sm text-neutral-400">Nada en proceso ahora mismo.</Card>
            ) : null}
          </div>
        </div>

        <div>
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-neutral-900">
            <CheckCircle2 size={15} className="text-primary-600" />
            Listos para cobrar ({listoLista.length})
          </h2>
          <div className="flex flex-col gap-3">
            {listoLista.map((orden) => (
              <OrdenCard
                key={orden.id}
                orden={orden}
                comboNombre={comboNombre(orden.comboId)}
                lavadorNombre={lavadorNombre(orden.lavadorId)}
                tipoVehiculoNombre={tipoVehiculo(orden.tipoVehiculoId)?.nombre ?? '—'}
                esMoto={tipoVehiculo(orden.tipoVehiculoId)?.categoria === 'moto'}
                tiempoTexto={tiempoTranscurrido(orden.listaEn ?? orden.creadoEn, ahora)}
                onCobrar={() => setCobrando(orden)}
                onContactar={() => setContactando(orden)}
                onEditarCliente={() => setEditandoCliente(orden)}
              />
            ))}
            {listoLista.length === 0 ? (
              <Card className="py-8 text-center text-sm text-neutral-400">Nada listo para cobrar todavía.</Card>
            ) : null}
          </div>
        </div>
      </div>

      {cobrando ? (
        <CobroModal
          orden={cobrando}
          onClose={() => setCobrando(null)}
          onCobrado={(metodoPago, referenciaPago) => handleCobrado(cobrando, metodoPago, referenciaPago)}
        />
      ) : null}

      {reasignando ? (
        <ReasignarModal
          orden={reasignando}
          lavadores={lavadores.filter((l) => l.activo)}
          onClose={() => setReasignando(null)}
          onReasignado={async () => {
            setReasignando(null)
            await refresh()
          }}
        />
      ) : null}

      {editandoCliente ? (
        <EditarClienteModal
          orden={editandoCliente}
          onClose={() => setEditandoCliente(null)}
          onGuardado={async () => {
            setEditandoCliente(null)
            await refresh()
          }}
        />
      ) : null}

      {recibo ? <ReciboModal recibo={recibo} variant="pago" onClose={() => setRecibo(null)} /> : null}

      {contactando ? (
        <ContactoModal
          nombre={contactando.clienteNombre}
          placa={contactando.placa}
          telefono={contactando.clienteTelefono}
          correo={contactando.clienteCorreo}
          mensajeWhatsapp={
            contactando.estado === 'listo'
              ? `Hola ${contactando.clienteNombre}, tu vehículo ${contactando.placa} ya está listo para recoger.`
              : `Hola ${contactando.clienteNombre}, te contactamos sobre tu vehículo ${contactando.placa}.`
          }
          onClose={() => setContactando(null)}
        />
      ) : null}

      {finalizando ? (
        <ConfirmModal
          title={`¿Finalizar el lavado de ${finalizando.placa}?`}
          message="Pasará a la columna de Listos para cobrar."
          confirmLabel="Finalizar lavado"
          variant="primary"
          onConfirm={async () => {
            await handleMarcarListo(finalizando)
            setFinalizando(null)
          }}
          onCancel={() => setFinalizando(null)}
        />
      ) : null}
    </div>
  )
}

function OrdenCard({
  orden,
  comboNombre,
  lavadorNombre,
  tipoVehiculoNombre,
  esMoto,
  tiempoTexto,
  onFinalizar,
  onCobrar,
  onReasignar,
  onContactar,
  onEditarCliente,
}: {
  orden: Orden
  comboNombre: string
  lavadorNombre: string
  tipoVehiculoNombre: string
  esMoto: boolean
  tiempoTexto: string
  onFinalizar?: () => void
  onCobrar?: () => void
  onReasignar?: () => void
  onContactar?: () => void
  onEditarCliente?: () => void
}) {
  const enProceso = orden.estado === 'en_proceso'
  const VehiculoIcon = esMoto ? Motorbike : Car
  return (
    <Card
      className={`group border-l-4 p-0 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-card-hover ${
        enProceso ? 'border-l-warning-600 bg-warning-50/40' : 'border-l-primary-500 bg-primary-50/40 shadow-nav-active'
      }`}
    >
      <div className="flex items-center justify-between gap-2 p-3 pb-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-lg font-bold tracking-tight text-neutral-900">{orden.placa}</span>
            <span className="text-xs text-neutral-400">#{orden.consecutivo}</span>
          </div>
          <p className="mt-0.5 flex items-center gap-1.5 text-sm font-medium text-neutral-700">
            <UserRound size={14} className="shrink-0 text-neutral-400" />
            <span className="truncate">{orden.clienteNombre}</span>
          </p>

          <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-neutral-500">
            <span className="flex items-center gap-1">
              <VehiculoIcon size={13} className="text-primary-500" /> {tipoVehiculoNombre}
            </span>
            <span className="flex items-center gap-1">
              <Package size={13} className="text-primary-500" /> {comboNombre}
            </span>
            <span className="flex items-center gap-1">
              <Users size={13} className="text-primary-500" /> {lavadorNombre}
            </span>
            <span className="flex items-center gap-1 font-medium text-neutral-600">
              <Clock size={13} /> {tiempoTexto}
            </span>
          </p>
        </div>

        {/* Protagonista pero a la medida del bloque de texto — no un banner aparte. Solo mientras
            está en proceso; "listo para cobrar" se queda con el ícono de tipo de vehículo de arriba. */}
        {enProceso ? (
          <LavadoAnimation tipo={esMoto ? 'moto' : 'auto'} className="h-20 w-28 shrink-0 sm:h-24 sm:w-32" />
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-neutral-100 bg-white/60 px-3 py-2">
        <div className="flex items-center gap-1">
          {onContactar ? (
            <button
              type="button"
              onClick={onContactar}
              className="group/btn flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-neutral-600 transition-colors hover:bg-success-50 hover:text-success-700"
            >
              <MessageCircle size={14} className="transition-transform group-hover/btn:scale-110" />
              Contactar
            </button>
          ) : null}
          {onReasignar ? (
            <button
              type="button"
              onClick={onReasignar}
              className="group/btn flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-neutral-600 transition-colors hover:bg-primary-50 hover:text-primary-700"
            >
              <Repeat size={14} className="transition-transform group-hover/btn:rotate-180" />
              Reasignar
            </button>
          ) : null}
          {onEditarCliente ? (
            <button
              type="button"
              onClick={onEditarCliente}
              className="group/btn flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-neutral-600 transition-colors hover:bg-primary-50 hover:text-primary-700"
            >
              <Pencil size={14} />
              Editar cliente
            </button>
          ) : null}
        </div>

        <div className="flex items-center gap-2.5">
          <span className="rounded-md bg-success-50 px-2 py-1 text-sm font-bold text-success-700">
            {COP.format(orden.precio)}
          </span>
          {onFinalizar ? (
            <button
              type="button"
              onClick={onFinalizar}
              className="flex items-center gap-1.5 rounded-lg bg-warning-600 px-3 py-2 text-xs font-semibold text-white shadow-card transition-all hover:-translate-y-0.5 hover:bg-warning-700 hover:shadow-card-hover"
            >
              <SprayCan size={14} />
              Finalizar lavado
            </button>
          ) : null}
          {onCobrar ? (
            <button
              type="button"
              onClick={onCobrar}
              className="flex items-center gap-1.5 rounded-lg bg-success-600 px-3 py-2 text-xs font-semibold text-white shadow-nav-active transition-all hover:-translate-y-0.5 hover:bg-success-700 hover:shadow-card-hover"
            >
              <Banknote size={14} />
              Cobrar y entregar
            </button>
          ) : null}
        </div>
      </div>
    </Card>
  )
}

function ReasignarModal({
  orden,
  lavadores,
  onClose,
  onReasignado,
}: {
  orden: Orden
  lavadores: { id: string; nombre: string }[]
  onClose: () => void
  onReasignado: () => Promise<void>
}) {
  const [lavadorId, setLavadorId] = useState(orden.lavadorId)
  const [saving, setSaving] = useState(false)

  async function handleConfirmar() {
    if (lavadorId === orden.lavadorId) {
      onClose()
      return
    }
    setSaving(true)
    try {
      await reasignarLavador(orden.id, lavadorId)
      await onReasignado()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-neutral-900/40 p-4 backdrop-blur-[2px]">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-card-hover">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-neutral-900">Reasignar lavador</h3>
          <button
            type="button"
            onClick={onClose}
            className="flex size-8 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-neutral-100"
          >
            <X size={18} />
          </button>
        </div>
        <p className="mb-4 text-xs text-neutral-500">
          {orden.placa} · #{orden.consecutivo}
        </p>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-neutral-700">Lavador</span>
          <CustomSelect
            size="sm"
            value={lavadorId}
            onChange={setLavadorId}
            placeholder="Selecciona…"
            options={lavadores.map((l) => ({ value: l.id, label: l.nombre }))}
          />
        </label>
        <button
          type="button"
          onClick={handleConfirmar}
          disabled={saving}
          className="mt-5 w-full rounded-lg bg-primary-600 py-2.5 text-sm font-semibold text-white shadow-nav-active transition-colors hover:bg-primary-700 disabled:opacity-60"
        >
          {saving ? 'Guardando…' : 'Confirmar reasignación'}
        </button>
      </div>
    </div>
  )
}

function EditarClienteModal({
  orden,
  onClose,
  onGuardado,
}: {
  orden: Orden
  onClose: () => void
  onGuardado: () => Promise<void>
}) {
  const [clienteNombre, setClienteNombre] = useState(orden.clienteNombre)
  const [clienteTelefono, setClienteTelefono] = useState(orden.clienteTelefono ?? '')
  const [clienteCorreo, setClienteCorreo] = useState(orden.clienteCorreo ?? '')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const parsed = clienteInfoInputSchema.safeParse({
      clienteNombre,
      clienteTelefono: clienteTelefono || undefined,
      clienteCorreo: clienteCorreo || undefined,
    })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Datos inválidos')
      return
    }
    setError(null)
    setSaving(true)
    try {
      await editarInfoCliente(orden.id, parsed.data)
      await onGuardado()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el cambio')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-neutral-900/40 p-4 backdrop-blur-[2px]">
      <form onSubmit={handleSubmit} className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-card-hover">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-neutral-900">Editar datos del cliente</h3>
          <button
            type="button"
            onClick={onClose}
            className="flex size-8 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-neutral-100"
          >
            <X size={18} />
          </button>
        </div>
        <p className="mb-4 text-xs text-neutral-500">
          {orden.placa} · #{orden.consecutivo}
        </p>
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-neutral-700">Nombre</span>
            <input
              value={clienteNombre}
              onChange={(event) => setClienteNombre(event.target.value)}
              className="rounded-lg border border-neutral-300 px-3 py-2.5 text-sm outline-none transition-colors focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-neutral-700">Teléfono</span>
            <input
              value={clienteTelefono}
              onChange={(event) => setClienteTelefono(event.target.value)}
              className="rounded-lg border border-neutral-300 px-3 py-2.5 text-sm outline-none transition-colors focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-neutral-700">Correo</span>
            <input
              type="email"
              value={clienteCorreo}
              onChange={(event) => setClienteCorreo(event.target.value)}
              className="rounded-lg border border-neutral-300 px-3 py-2.5 text-sm outline-none transition-colors focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
            />
          </label>
        </div>
        {error ? <p className="mt-3 text-xs text-danger-600">{error}</p> : null}
        <button
          type="submit"
          disabled={saving}
          className="mt-5 w-full rounded-lg bg-primary-600 py-2.5 text-sm font-semibold text-white shadow-nav-active transition-colors hover:bg-primary-700 disabled:opacity-60"
        >
          {saving ? 'Guardando…' : 'Guardar cambios'}
        </button>
      </form>
    </div>
  )
}

function CobroModal({
  orden,
  onClose,
  onCobrado,
}: {
  orden: Orden
  onClose: () => void
  onCobrado: (metodoPago: MetodoPago, referenciaPago?: string) => void
}) {
  const [metodoPago, setMetodoPago] = useState<MetodoPago>('efectivo')
  const [referenciaPago, setReferenciaPago] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const parsed = cobroInputSchema.safeParse({
      metodoPago,
      referenciaPago: referenciaPago || undefined,
    })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Datos inválidos')
      return
    }
    setError(null)
    setSaving(true)
    try {
      await cobrarYEntregarOrden(orden.id, parsed.data)
      onCobrado(parsed.data.metodoPago, parsed.data.referenciaPago)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar el cobro')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center bg-neutral-900/40 backdrop-blur-[2px] sm:items-center sm:p-4">
      <div className="w-full max-w-sm rounded-t-2xl bg-white p-5 shadow-card-hover sm:rounded-2xl sm:p-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-neutral-900">Cobrar y entregar</h3>
            <p className="text-xs text-neutral-500">
              {orden.placa} · #{orden.consecutivo}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex size-8 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-neutral-100"
          >
            <X size={18} />
          </button>
        </div>

        <div className="mb-4 flex items-center justify-between rounded-lg bg-primary-50 px-3 py-2.5 text-sm">
          <span className="font-medium text-primary-900">Total a cobrar</span>
          <span className="font-semibold text-primary-900">{COP.format(orden.precio)}</span>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
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

          {metodoPago === 'transferencia' ? (
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-neutral-700">Referencia</span>
              <input
                autoFocus
                value={referenciaPago}
                onChange={(e) => setReferenciaPago(e.target.value)}
                placeholder="Comprobante"
                className="rounded-lg border border-neutral-300 px-3 py-3 text-base outline-none transition-colors focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
              />
            </label>
          ) : null}

          {error ? <p className="text-xs text-danger-600">{error}</p> : null}

          <button
            type="submit"
            disabled={saving}
            className="flex items-center justify-center gap-2 rounded-lg bg-primary-600 py-3 text-sm font-semibold text-white shadow-nav-active transition-colors hover:bg-primary-700 disabled:opacity-60"
          >
            <CheckCircle2 size={16} />
            {saving ? 'Registrando…' : 'Confirmar cobro y entrega'}
          </button>
        </form>
      </div>
    </div>
  )
}
