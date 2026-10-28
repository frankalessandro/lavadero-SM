import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Droplets,
  Users,
  Wallet,
  ArrowRight,
  CheckCircle2,
  Banknote,
  Car,
  Clock,
  SprayCan,
  Repeat,
  Timer,
  MessageCircle,
  Motorbike,
  Pencil,
  FileWarning,
  Receipt,
  ClipboardCheck,
  Bell,
  BellRing,
  Undo2,
  Plus,
  Trash2,
  CupSoda,
  Percent,
  Landmark,
  CreditCard,
  AlertTriangle,
  Ban,
  ClipboardPlus,
} from 'lucide-react'
import {
  fetchOrdenesHoy,
  fetchOrdenesAbiertas,
  fetchOrdenesEntregadasHoy,
  marcarListo,
  volverAProceso,
  cobrarYEntregarOrden,
  reasignarLavador,
  editarInfoCliente,
  cambiarTipoOrden,
  marcarNotificado,
} from '../../data/ordenes'
import { asignacionDeHoy, fetchLavadores } from '../../data/lavadores'
import { fetchAsistenciasDelDia, fetchDiasDescanso, ensureDiasDescansoGenerados } from '../../data/asistenciaLavadores'
import { fetchCombos } from '../../data/combos'
import { fetchTiposVehiculo } from '../../data/tiposVehiculo'
import { fetchTurnoAbierto } from '../../data/turnos'
import { fetchProductosOperativo } from '../../data/productos'
import { fetchStockProductosOperativo } from '../../data/movimientosInventario'
import { createVenta, anularVenta, fetchVentasPendientes, fetchVentasDeOrden } from '../../data/ventas'
import { fetchPagosHoy } from '../../data/pagos'
import type { Venta } from '../../schemas/venta'
import { toast } from '../../lib/toast'
import type { Pago } from '../../schemas/pago'
import type { Producto } from '../../schemas/producto'
import { clienteInfoInputSchema, type Orden } from '../../schemas/orden'
import type { TipoVehiculo } from '../../schemas/tipoVehiculo'
import type { PagoLineaInput } from '../../schemas/pago'
import { StatCard } from '../../components/layout/StatCard'
import { PageHeader } from '../../components/layout/PageHeader'
import { EstadoTurno } from '../../components/layout/EstadoTurno'
import { BarraFiltros, FiltroBusqueda, FiltroMenu } from '../../components/layout/Filtros'
import { Card } from '../../components/layout/Card'
import { Modal } from '../../components/layout/Modal'
import { Button } from '../../components/layout/Button'
import { CustomSelect } from '../../components/layout/CustomSelect'
import { ReciboModal, type ReciboData } from '../../components/layout/ReciboModal'
import { ConfirmModal } from '../../components/layout/ConfirmModal'
import { CurrencyInput } from '../../components/layout/CurrencyInput'
import { PagoLineas } from '../../components/layout/PagoLineas'
import { borradorAPagos, nuevaLineaBorrador, pagoLineasCuadra, type PagoLineaBorrador } from '../../lib/pagoLineas'
import { CorregirPagoModal } from '../../components/layout/CorregirPagoModal'
import { ContactoModal } from '../../components/layout/ContactoModal'
import { LavadoAnimation } from '../../components/layout/LavadoAnimation'
import { AgregarProductoModal } from '../../components/layout/AgregarProductoModal'
import { QuitarProductoModal } from '../../components/layout/QuitarProductoModal'
import { BarChart } from '../../components/layout/BarChart'
import { METODO_PAGO_LABEL } from '../../lib/metodoPago'
import { queryKeys } from '../../lib/queryKeys'
import { fechaLocalISO } from '../../lib/periodo'

function hoyISO(): string {
  return fechaLocalISO(new Date())
}

async function loadDashboard() {
  const hoy = hoyISO()
  // Mismo self-heal que /recepcion: sin esto, si nadie visitó /jefe-zona/asistencia hoy, la
  // fila de dias_descanso de hoy no existe y nadie aparece marcado como "descansa hoy" acá.
  await ensureDiasDescansoGenerados(hoy)
  const [
    ordenesHoy,
    entregadasHoy,
    lavadores,
    combos,
    tiposVehiculo,
    turno,
    asistenciasHoy,
    descansosHoy,
    productos,
    stock,
    ventasPendientes,
    pagosHoy,
    ordenesAbiertas,
  ] = await Promise.all([
    fetchOrdenesHoy(),
    fetchOrdenesEntregadasHoy(),
    fetchLavadores(),
    fetchCombos(),
    fetchTiposVehiculo(),
    fetchTurnoAbierto('jefe_zona'),
    fetchAsistenciasDelDia(hoy),
    fetchDiasDescanso(hoy, hoy),
    fetchProductosOperativo(),
    fetchStockProductosOperativo(),
    fetchVentasPendientes(),
    fetchPagosHoy(),
    fetchOrdenesAbiertas(),
  ])
  return {
    ordenesHoy,
    ordenesAbiertas,
    entregadasHoy,
    lavadores,
    combos,
    tiposVehiculo,
    turno,
    asistenciasHoy,
    descansosHoy,
    productos,
    stock,
    ventasPendientes,
    pagosHoy,
  }
}

const FECHA_HOY = new Intl.DateTimeFormat('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })

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

// Mensaje de WhatsApp para "Contactar" — con nombre cuando hay uno registrado (caso normal, el
// formulario de recepción lo exige), y un mensaje genérico solo con placa como respaldo si algún
// registro viejo/importado llegara sin nombre. Menciona "carro"/"moto" explícito (no solo el
// emoji) porque es lo que pidió el negocio para que el cliente reconozca de inmediato cuál es.
function construirMensajeWhatsapp(orden: Orden, esMoto: boolean): string {
  const tipoPalabra = esMoto ? 'moto' : 'carro'
  const emoji = esMoto ? '🏍️' : '🚘'
  const nombre = orden.clienteNombre.trim()
  const saludo = nombre ? `Hola ${nombre}, te hablamos de CarWash SM ✨.` : 'Hola, te hablamos de CarWash SM ✨.'
  const cuerpo =
    orden.estado === 'listo'
      ? `Te informamos que tu ${tipoPalabra} ${orden.placa} ya está listo para recoger. ${emoji}`
      : `Te contactamos sobre tu ${tipoPalabra} ${orden.placa}. ${emoji}`
  return `${saludo}\n\n${cuerpo}`
}

// Mismo intervalo que tenía el `setInterval` manual — reemplazado por `refetchInterval` de
// TanStack Query, que ya trae su propia protección contra apilar refrescos si uno tarda más que
// el intervalo (no hace falta el `useRef` de "en vuelo" que tenía el código anterior).
const REFETCH_MS = 12_000

function JefeZonaDashboard() {
  const data = Route.useLoaderData()
  const queryClient = useQueryClient()

  // Fase 4 (2026-09-14): mismo patrón que /jefe-zona/ventas — cada pieza que antes vivía en un
  // useState alimentado por `refresh()` (Promise.all + setState + router.invalidate(), bajando
  // todo dos veces por acción y otra vez cada 12s) pasa a useQuery con `initialData` del loader.
  const { data: ordenesHoy = [] } = useQuery({
    queryKey: queryKeys.ordenesHoy,
    queryFn: fetchOrdenesHoy,
    initialData: data.ordenesHoy,
    refetchInterval: REFETCH_MS,
  })
  // Tablero: toda orden sin cobrar, de cualquier fecha (ver fetchOrdenesAbiertas).
  const { data: ordenesAbiertas = [] } = useQuery({
    queryKey: queryKeys.ordenesAbiertas,
    queryFn: fetchOrdenesAbiertas,
    initialData: data.ordenesAbiertas,
    refetchInterval: REFETCH_MS,
  })
  const { data: entregadasHoy = [] } = useQuery({
    queryKey: queryKeys.ordenesEntregadasHoy,
    queryFn: fetchOrdenesEntregadasHoy,
    initialData: data.entregadasHoy,
    refetchInterval: REFETCH_MS,
  })
  const [lavadores] = useState(data.lavadores)
  const [asistenciasHoy] = useState(data.asistenciasHoy)
  const [descansosHoy] = useState(data.descansosHoy)
  const [combos] = useState(data.combos)
  const [tiposVehiculo] = useState(data.tiposVehiculo)
  const { data: turno } = useQuery({
    queryKey: queryKeys.turnoAbierto('jefe_zona'),
    queryFn: () => fetchTurnoAbierto('jefe_zona'),
    initialData: data.turno,
    refetchInterval: REFETCH_MS,
  })
  // Antes un useState sin setter: quedaba congelado toda la sesión aunque cambiara un precio o se
  // diera de alta un producto desde otra pantalla. Con useQuery se refresca solo (staleTime +
  // refetch periódico) y comparte caché con /jefe-zona/ventas (misma clave).
  const { data: productos = [] as Producto[] } = useQuery({
    queryKey: queryKeys.productosOperativo,
    queryFn: fetchProductosOperativo,
    initialData: data.productos,
  })
  const { data: stock = [] } = useQuery({
    queryKey: queryKeys.stockOperativo,
    queryFn: fetchStockProductosOperativo,
    initialData: data.stock,
    refetchInterval: REFETCH_MS,
  })
  // Productos de nevera cargados a órdenes que todavía no se cobran (estado 'pendiente'). Se
  // agrupan por orden para el chip de cada tarjeta y para sumarlos al total del cobro.
  const { data: ventasPendientes = [] as Venta[] } = useQuery({
    queryKey: queryKeys.ventasPendientes,
    queryFn: fetchVentasPendientes,
    initialData: data.ventasPendientes,
    refetchInterval: REFETCH_MS,
  })
  const { data: pagosHoy = [] as Pago[] } = useQuery({
    queryKey: queryKeys.pagosHoy,
    queryFn: fetchPagosHoy,
    initialData: data.pagosHoy,
    refetchInterval: REFETCH_MS,
  })
  const [agregandoProductoA, setAgregandoProductoA] = useState<Orden | null>(null)
  const [quitandoProducto, setQuitandoProducto] = useState<Venta | null>(null)
  // `finalizarPrimero`: cuando se cobra directo desde una orden en_proceso (cliente esperando en
  // sala, no hace falta esperar a que "venga por ella" — ver onCobrarDirecto en OrdenCard), el
  // submit del modal marca listo (fija tiempo_lavado_segundos) y de inmediato cobra/entrega.
  const [cobrando, setCobrando] = useState<{ orden: Orden; finalizarPrimero: boolean } | null>(null)
  const [busquedaPlaca, setBusquedaPlaca] = useState('')
  // 'todos' (default) | 'sin_asignar' | id de lavador.
  const [lavadorFiltro, setLavadorFiltro] = useState('todos')
  const [reasignando, setReasignando] = useState<Orden | null>(null)
  const [editandoCliente, setEditandoCliente] = useState<Orden | null>(null)
  const [finalizando, setFinalizando] = useState<Orden | null>(null)
  // Corrige un "Finalizar lavado" por equivocación — vuelve la orden a en_proceso.
  const [volviendoAProceso, setVolviendoAProceso] = useState<Orden | null>(null)
  // Orden cuyo reparto de pago se está corrigiendo (solo entregadas).
  const [corrigiendoPago, setCorrigiendoPago] = useState<Orden | null>(null)
  const [recibo, setRecibo] = useState<ReciboData | null>(null)
  // Solo se activa al cobrar (handleCobrado) — al reabrir un tiquete ya emitido (abrirTiquete)
  // no queremos disparar la impresión sola cada vez que alguien solo quiere verlo.
  const [reciboAutoPrint, setReciboAutoPrint] = useState(false)
  const [contactando, setContactando] = useState<Orden | null>(null)
  // Tablero de seguimiento (en proceso/listos) vs. tabla de entregados hoy — ambas vistas
  // permiten reabrir e imprimir el tiquete de cualquier orden, en cualquier estado.
  const [vista, setVista] = useState<'seguimiento' | 'entregados'>('seguimiento')
  const [viendoDetalle, setViendoDetalle] = useState<Orden | null>(null)
  const [viendoCajaDesglose, setViendoCajaDesglose] = useState(false)

  // Reloj compartido para el contador en vivo de cada tarjeta — un solo interval en vez de
  // uno por tarjeta, se limpia al desmontar el dashboard. Se guarda como estado (no un simple
  // contador descartado) porque `tiempoTranscurrido` lo recibe como argumento explícito: así el
  // React Compiler lo detecta como dependencia real y no memoiza el texto entre ticks.
  const [ahora, setAhora] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setAhora(Date.now()), 1_000)
    return () => clearInterval(id)
  }, [])

  // Invalida todo lo que este dashboard lee tras una acción — mismo alcance que el `refresh()`
  // manual de antes, pero como una sola ronda de refetch deduplicada por TanStack Query, y sin la
  // segunda descarga que hacía `router.invalidate()` por separado. El sondeo de 12s (antes un
  // `setInterval` a mano) ya lo cubre `refetchInterval` en cada `useQuery` de arriba — no hace
  // falta un efecto aparte ni el `useRef` de "no apilar", eso ya lo maneja la librería.
  async function refresh() {
    await Promise.all(
      [
        queryKeys.ordenesHoy,
        queryKeys.ordenesAbiertas,
        queryKeys.ordenesEntregadasHoy,
        queryKeys.turnoAbierto('jefe_zona'),
        queryKeys.stockOperativo,
        queryKeys.ventasPendientes,
        queryKeys.pagosHoy,
      ].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
    )
  }

  async function handleMarcarListo(orden: Orden) {
    await marcarListo(orden.id)
    await refresh()
  }

  async function handleToggleNotificado(orden: Orden) {
    // Sin ConfirmModal (es un check rápido, no una acción que pida confirmación) — sin este
    // catch, un rechazo de la RPC fallaba en silencio, sin nada en pantalla.
    try {
      await marcarNotificado(orden.id, !orden.notificadoListo)
      await refresh()
    } catch (err) {
      toast.desdeError(err, 'No se pudo actualizar el aviso')
    }
  }

  async function handleVolverAProceso(orden: Orden) {
    await volverAProceso(orden.id)
    await refresh()
  }

  // Carga un producto de nevera a un vehículo en espera — queda 'pendiente' (sin descontar
  // stock) hasta que se cobra la orden. Se cobra junto con el lavado al entregar.
  async function handleAgregarProducto(orden: Orden, productoId: string, cantidad: number) {
    await createVenta({
      productoId,
      cantidad,
      metodoPago: 'efectivo', // provisional — el método real se define al cobrar la orden
      vendidoPor: turno?.responsableActual ?? orden.jefeZonaResponsable ?? 'jefe de zona',
      ordenId: orden.id,
    })
    await refresh()
  }

  async function handleQuitarProducto(venta: Venta, motivo: string, seConsumio: boolean) {
    await anularVenta(venta.id, {
      motivo,
      anuladaPor: turno?.responsableActual ?? 'jefe de zona',
      seConsumio,
    })
    setQuitandoProducto(null)
    await refresh()
  }

  const comboNombre = (id: string | undefined) => (id ? combos.find((c) => c.id === id)?.nombre : undefined) ?? 'Sin combo'
  const lavadorNombre = (id: string | undefined) => (id ? lavadores.find((l) => l.id === id)?.nombre : undefined) ?? 'Sin asignar'
  const tipoVehiculo = (id: string) => tiposVehiculo.find((t) => t.id === id)
  const productoNombre = (id: string) => productos.find((p) => p.id === id)?.nombre ?? 'Producto'

  const productosVendibles = useMemo(
    () => productos.filter((p) => p.activo && p.precioVenta != null),
    [productos],
  )
  // Disponible (stock − lo ya cargado a órdenes/cuentas sin cobrar) — es lo que valida la RPC.
  const stockPorProducto = useMemo(() => {
    const mapa = new Map<string, number>()
    for (const s of stock) mapa.set(s.productoId, s.disponible)
    return mapa
  }, [stock])
  // ordenId -> productos pendientes de esa orden (para el chip de la tarjeta y el total del cobro).
  const ventasPendientesPorOrden = useMemo(() => {
    const mapa = new Map<string, Venta[]>()
    for (const v of ventasPendientes) {
      if (!v.ordenId) continue
      const lista = mapa.get(v.ordenId) ?? []
      lista.push(v)
      mapa.set(v.ordenId, lista)
    }
    return mapa
  }, [ventasPendientes])

  const enProcesoLista = ordenesAbiertas.filter((o) => o.estado === 'en_proceso')
  const listoLista = ordenesAbiertas.filter((o) => o.estado === 'listo')
  // Inicio del día local, derivado del reloj compartido (`ahora`) para no leer la hora en render.
  const inicioHoyMs = useMemo(() => {
    const d = new Date(ahora)
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  }, [ahora])
  const deOtroDia = (orden: Orden) => new Date(orden.creadoEn).getTime() < inicioHoyMs
  const anuladasHoyLista = ordenesHoy.filter((o) => o.estado === 'anulada')
  // Buscador por placa + filtro por lavador (seguimiento y entregados hoy) — ambos se combinan.
  // Coincidencia de placa parcial, sin distinguir mayúsculas/minúsculas. "Sin asignar" filtra las
  // órdenes sin lavador (ver M2). Solo filtra lo que se muestra; las listas sin filtrar (arriba)
  // siguen siendo la fuente para rotación/ocupados/cola.
  const placaBuscada = busquedaPlaca.trim().toUpperCase()
  const coincidePlaca = (orden: Orden) => !placaBuscada || orden.placa.toUpperCase().includes(placaBuscada)
  const coincideLavador = (orden: Orden) =>
    lavadorFiltro === 'todos' ||
    (lavadorFiltro === 'sin_asignar' ? !orden.lavadorId : orden.lavadorId === lavadorFiltro || orden.lavadorId2 === lavadorFiltro)
  const enProcesoFiltrada = enProcesoLista.filter(coincidePlaca).filter(coincideLavador)
  const listoFiltrada = listoLista.filter(coincidePlaca).filter(coincideLavador)
  const entregadasFiltradas = entregadasHoy.filter(coincidePlaca).filter(coincideLavador)

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
      const asigA = asignacionDeHoy(a.ultimaAsignacion)
      const asigB = asignacionDeHoy(b.ultimaAsignacion)
      if (asigA !== asigB) return asigA === -Infinity ? -1 : asigB === -Infinity ? 1 : asigA - asigB
      const horaA = horaEntradaPorId.get(a.id)
      const horaB = horaEntradaPorId.get(b.id)
      if (!horaA || !horaB) return 0
      return new Date(horaA).getTime() - new Date(horaB).getTime()
    })
  const presentesHoyIds = new Set(asistenciasHoy.map((a) => a.lavadorId))
  const descansaHoyId = descansosHoy[0]?.lavadorId
  const ocupadosIds = new Set(
    enProcesoLista.flatMap((o) => [o.lavadorId, o.lavadorId2]).filter((id): id is string => !!id),
  )
  // Mismo criterio de elegibilidad que suggestNextLavador (M9 + regla de negocio 9): activo,
  // presente hoy, sin descanso asignado hoy, y no ocupado ahora mismo (con una orden en_proceso
  // a su cargo). No se ocultan los demás de la lista — se marcan, para que quede claro por qué se
  // saltan en vez de simplemente desaparecer.
  const proximoEnRotacion = ordenRotacion.find(
    (l) => presentesHoyIds.has(l.id) && l.id !== descansaHoyId && !ocupadosIds.has(l.id),
  )
  // Quien sigue en la cola aunque todos estén ocupados: mismo orden, sin el filtro de ocupados.
  const siguienteAunOcupado = ordenRotacion.find((l) => presentesHoyIds.has(l.id) && l.id !== descansaHoyId)
  // Desglose de "Lavadores en turno": mismos Sets ya calculados arriba para la cola de rotación,
  // sin ningún fetch nuevo. "Disponible" = mismo criterio de elegibilidad de suggestNextLavador.
  const lavadoresDisponibles = lavadores.filter(
    (l) => l.activo && presentesHoyIds.has(l.id) && l.id !== descansaHoyId && !ocupadosIds.has(l.id),
  ).length
  const lavadoresSinLlegada = lavadores.filter((l) => l.activo && !presentesHoyIds.has(l.id)).length

  // Caja del día desglosada: mismo criterio de clasificación que fetchEfectivoDeTurno (src/data/
  // pagos.ts) — orden_id presente = lavado, ausente = producto (mostrador o cuenta abierta, da
  // igual para este desglose, las dos son vitrina). Solo líneas vigentes (no anuladas).
  const pagosVigentesHoy = pagosHoy.filter((p) => !p.anulado)
  const totalCajaHoy = pagosVigentesHoy.reduce((s, p) => s + p.monto, 0)
  const cajaPorMetodo = {
    efectivo: pagosVigentesHoy.filter((p) => p.metodoPago === 'efectivo').reduce((s, p) => s + p.monto, 0),
    transferencia: pagosVigentesHoy.filter((p) => p.metodoPago === 'transferencia').reduce((s, p) => s + p.monto, 0),
    datafono: pagosVigentesHoy.filter((p) => p.metodoPago === 'datafono').reduce((s, p) => s + p.monto, 0),
  }
  const cajaLavados = pagosVigentesHoy.filter((p) => p.ordenId).reduce((s, p) => s + p.monto, 0)
  const cajaProductos = totalCajaHoy - cajaLavados
  // Productos de vitrina ya cargados (a órdenes o cuentas) pero todavía sin cobrar: no están en
  // `pagos`, así que se muestran aparte como acumulado por cobrar.
  const productosPorCobrar = ventasPendientes.reduce((s, v) => s + v.total, 0)

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
        // Órdenes sin combo (solo servicios individuales) no aportan a este promedio "por
        // combo" — no hay combo que promediar.
        if (orden.comboId) {
          const combo = porCombo.get(orden.comboId) ?? { total: 0, cantidad: 0 }
          combo.total += minutos
          combo.cantidad += 1
          porCombo.set(orden.comboId, combo)
        }
        // Una orden entregada siempre tiene lavador asignado (no se puede cobrar/entregar sin
        // asignar primero) — el guard es solo para que TS acepte `lavadorId` opcional en el tipo.
        // Si se lavó entre 2, el mismo tiempo cuenta para ambos (regla de negocio 16: mide
        // vehículos atendidos, no reparte el tiempo — los dos lo atendieron completo).
        for (const lavadorId of [orden.lavadorId, orden.lavadorId2].filter((id): id is string => !!id)) {
          const lavador = porLavador.get(lavadorId) ?? { total: 0, cantidad: 0 }
          lavador.total += minutos
          lavador.cantidad += 1
          porLavador.set(lavadorId, lavador)
        }
      }
      if (orden.tiempoEsperaEntregaSegundos != null) {
        esperaTotal += orden.tiempoEsperaEntregaSegundos / 60
        esperaCantidad += 1
      }
    }
    return {
      // Minutos promedio de lavado por combo (id) — la barra de tiempo de cada tarjeta en proceso.
      minutosPorComboId: new Map(Array.from(porCombo.entries()).map(([id, v]) => [id, v.total / v.cantidad])),
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

  // Avance de un lavado en curso contra lo que ese combo tarda hoy en promedio (barra de la
  // tarjeta). Sin entregas del combo hoy no hay referencia: la barra queda vacía.
  function progresoLavado(orden: Orden): { progreso?: number; promedioTexto?: string } {
    const promedio = orden.comboId ? promedios.minutosPorComboId.get(orden.comboId) : undefined
    if (!promedio) return {}
    const minutos = (ahora - new Date(orden.creadoEn).getTime()) / 60000
    return { progreso: minutos / promedio, promedioTexto: `prom. ${formatMinutos(promedio)}` }
  }

  async function handleCobrado(orden: Orden, pagos: PagoLineaInput[], descuento?: DescuentoResumen) {
    // Se capturan ANTES del refresh: tras cobrar dejan de estar 'pendiente' y salen del mapa.
    const productos = (ventasPendientesPorOrden.get(orden.id) ?? []).map((v) => ({
      nombre: productoNombre(v.productoId),
      cantidad: v.cantidad,
      total: v.total,
    }))
    const totalProductos = productos.reduce((suma, p) => suma + p.total, 0)
    const descuentoMonto = descuento?.monto ?? 0
    // Etiqueta-resumen para el recibo: método único si todas las líneas comparten método, si no
    // 'mixto'. El desglose real va en `pagos`. Sin pagos = cortesía total.
    const metodos = new Set(pagos.map((p) => p.metodo))
    const hayDetalle = productos.length > 0 || descuentoMonto > 0
    setRecibo({
      consecutivo: orden.consecutivo,
      placa: orden.placa,
      clienteNombre: orden.clienteNombre,
      comboNombre: comboNombre(orden.comboId),
      serviciosAdicionales: orden.serviciosAdicionales.map((s) => s.nombre),
      tipoNombre: tipoVehiculo(orden.tipoVehiculoId)?.nombre ?? '—',
      lavadorNombre: lavadorNombre(orden.lavadorId),
      lavadorNombre2: orden.lavadorId2 ? lavadorNombre(orden.lavadorId2) : undefined,
      productos: productos.length > 0 ? productos : undefined,
      precioLavado: hayDetalle ? orden.precio : undefined,
      descuento: descuentoMonto > 0 ? descuentoMonto : undefined,
      descuentoMotivo: descuento?.motivo,
      precio: orden.precio - descuentoMonto + totalProductos,
      fecha: new Date().toISOString(),
      entregada: true,
      metodoPago: pagos.length === 0 ? undefined : metodos.size === 1 ? [...metodos][0] : 'mixto',
      referenciaPago: pagos.length === 1 ? pagos[0].referencia : undefined,
      pagos: pagos.length > 1 ? pagos.map((p) => ({ metodo: p.metodo, monto: p.monto, referencia: p.referencia })) : undefined,
    })
    setReciboAutoPrint(true)
    setCobrando(null)
    await refresh()
  }

  // Reabrir el tiquete de una orden ya existente, en cualquier estado (en proceso, listo o
  // entregado) — mismo componente/diseño que el comprobante que se muestra al registrar o
  // cobrar, para poder verlo/reimprimirlo en cualquier momento sin repetir esa acción. Para una
  // orden entregada trae también sus productos de vitrina para que la factura reimpresa muestre
  // el mismo detalle que la original.
  async function abrirTiquete(orden: Orden) {
    const entregada = orden.estado === 'entregado'
    const ventasOrden = entregada ? await fetchVentasDeOrden(orden.id) : []
    const productos = ventasOrden.map((v) => ({
      nombre: productoNombre(v.productoId),
      cantidad: v.cantidad,
      total: v.total,
    }))
    const totalProductos = productos.reduce((s, p) => s + p.total, 0)
    const hayDetalle = productos.length > 0 || orden.descuento > 0
    setRecibo({
      consecutivo: orden.consecutivo,
      placa: orden.placa,
      clienteNombre: orden.clienteNombre,
      comboNombre: comboNombre(orden.comboId),
      serviciosAdicionales: orden.serviciosAdicionales.map((s) => s.nombre),
      tipoNombre: tipoVehiculo(orden.tipoVehiculoId)?.nombre ?? '—',
      lavadorNombre: lavadorNombre(orden.lavadorId),
      lavadorNombre2: orden.lavadorId2 ? lavadorNombre(orden.lavadorId2) : undefined,
      productos: productos.length > 0 ? productos : undefined,
      precioLavado: hayDetalle ? orden.precio : undefined,
      descuento: orden.descuento > 0 ? orden.descuento : undefined,
      descuentoMotivo: orden.descuentoMotivo,
      precio: orden.precio - orden.descuento + totalProductos,
      fecha: entregada ? (orden.entregadaEn ?? orden.creadoEn) : orden.creadoEn,
      entregada,
      metodoPago: orden.metodoPago,
      referenciaPago: orden.referenciaPago,
    })
    setReciboAutoPrint(false)
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        showTitle
        title={`Hoy, ${FECHA_HOY.format(new Date())}`}
        description="Los vehículos en el patio, quién los lava y qué falta por cobrar."
        help={{
          body:
            'Seguimiento es el tablero del turno: "En proceso" y "Listos para cobrar". Cada tarjeta muestra hace cuánto entró o está listo, y desde ahí se reasigna lavador, se avisa al cliente, se carga un producto, se corrige o se cobra.\n\n' +
            'Los vehículos se ingresan en Recepción. Un vehículo sin lavador queda "En cola" hasta que se le asigne; no se puede finalizar sin lavador.\n\n' +
            'El próximo en cola sale de la rotación por orden de llegada (regla 9).',
        }}
        actions={
          <Link
            to="/recepcion"
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary-600 px-5 py-3 text-sm font-semibold text-white shadow-nav-active transition-colors hover:bg-primary-700 sm:w-auto"
          >
            <ClipboardPlus size={17} />
            Abrir recepción
          </Link>
        }
      />

      <EstadoTurno
        abierto={Boolean(turno)}
        titulo={turno ? `Caja abierta · ${turno.responsableActual}` : 'Sin turno abierto'}
        detalle={turno ? `Base ${COP.format(turno.baseInicial)}` : 'Ábrelo para que el arqueo cuadre al cierre.'}
        accion={
          <Link
            to="/jefe-zona/caja"
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-neutral-200 bg-white px-4 py-2.5 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50 sm:flex-none"
          >
            {turno ? 'Ir a caja' : 'Abrir turno'} <ArrowRight size={14} />
          </Link>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Lavados de hoy"
          value={String(ordenesHoy.filter((o) => o.estado !== 'anulada').length)}
          hint={anuladasHoyLista.length > 0 ? `${anuladasHoyLista.length} anulada${anuladasHoyLista.length === 1 ? '' : 's'} aparte` : `${entregadasHoy.length} entregados`}
          icon={Droplets}
        />
        <StatCard
          label="Caja del día"
          value={COP.format(totalCajaHoy)}
          hint={productosPorCobrar > 0 ? `+ ${COP.format(productosPorCobrar)} en productos por cobrar` : 'Toca para ver el desglose'}
          icon={Wallet}
          onClick={() => setViendoCajaDesglose(true)}
        />
        {/* Misma cola que sugiere /recepcion al recibir un vehículo (regla de negocio 9). */}
        <StatCard
          label="Próximo en cola"
          value={proximoEnRotacion ? proximoEnRotacion.nombre : 'Nadie libre'}
          hint={!proximoEnRotacion && siguienteAunOcupado ? `Sigue: ${siguienteAunOcupado.nombre}` : 'Rotación por llegada'}
          icon={Repeat}
        />
        <StatCard
          label="Lavadores"
          value={`${lavadoresDisponibles} libre${lavadoresDisponibles === 1 ? '' : 's'}`}
          hint={`${ocupadosIds.size} ocupado${ocupadosIds.size === 1 ? '' : 's'} · ${descansosHoy.length} descansa${descansosHoy.length === 1 ? '' : 'n'}${lavadoresSinLlegada > 0 ? ` · ${lavadoresSinLlegada} sin llegar` : ''}`}
          icon={Users}
        />
      </div>

      {anuladasHoyLista.length > 0 ? (
        <div className="flex items-start gap-3 rounded-2xl border border-danger-600/25 bg-danger-50 px-4 py-3">
          <Ban size={18} className="mt-0.5 shrink-0 text-danger-600" />
          <div className="min-w-0 text-sm">
            <p className="font-semibold text-danger-700">
              {anuladasHoyLista.length} orden{anuladasHoyLista.length === 1 ? '' : 'es'} anulada{anuladasHoyLista.length === 1 ? '' : 's'} hoy
            </p>
            <ul className="mt-1 flex flex-col gap-0.5 text-xs text-danger-700/80">
              {anuladasHoyLista.map((o) => (
                <li key={o.id}>
                  <span className="font-mono font-semibold">{o.placa}</span> · #{o.consecutivo} — {o.motivoAnulacion ?? '—'} · anuló{' '}
                  {o.anuladaPor ?? '—'}
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-neutral-200/60 p-1 sm:w-fit">
          {(
            [
              { key: 'seguimiento' as const, label: 'En el patio', icon: SprayCan, count: enProcesoLista.length + listoLista.length },
              { key: 'entregados' as const, label: 'Entregados hoy', icon: ClipboardCheck, count: entregadasHoy.length },
            ] as const
          ).map(({ key, label, icon: Icon, count }) => (
            <button
              key={key}
              type="button"
              onClick={() => setVista(key)}
              className={`flex items-center justify-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${
                vista === key ? 'bg-white text-primary-700 shadow-sm' : 'text-neutral-500 hover:text-neutral-900'
              }`}
            >
              <Icon size={15} />
              <span className="truncate">{label}</span>
              <span
                className={`rounded-full px-1.5 text-[11px] font-semibold tabular-nums ${
                  vista === key ? 'bg-primary-100 text-primary-700' : 'bg-neutral-100 text-neutral-500'
                }`}
              >
                {count}
              </span>
            </button>
          ))}
        </div>

        <BarraFiltros
          activos={[busquedaPlaca, lavadorFiltro !== 'todos' ? lavadorFiltro : ''].filter(Boolean).length}
          onLimpiar={() => {
            setBusquedaPlaca('')
            setLavadorFiltro('todos')
          }}
          resultado={
            busquedaPlaca || lavadorFiltro !== 'todos'
              ? vista === 'seguimiento'
                ? `${enProcesoFiltrada.length + listoFiltrada.length} resultado${enProcesoFiltrada.length + listoFiltrada.length === 1 ? '' : 's'}`
                : `${entregadasFiltradas.length} resultado${entregadasFiltradas.length === 1 ? '' : 's'}`
              : undefined
          }
        >
          <FiltroBusqueda value={busquedaPlaca} onChange={setBusquedaPlaca} placeholder="Buscar placa" mayusculas ancho="sm:w-48" />
          <FiltroMenu
            label="Lavador"
            value={lavadorFiltro === 'todos' ? '' : lavadorFiltro}
            onChange={(v) => setLavadorFiltro(v || 'todos')}
            options={[{ value: 'sin_asignar', label: 'Sin asignar' }, ...lavadores.filter((l) => l.activo).map((l) => ({ value: l.id, label: l.nombre }))]}
          />
        </BarraFiltros>
      </div>

      {vista === 'seguimiento' ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div>
            <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-neutral-900">
              <SprayCan size={15} className="text-warning-600" />
              En proceso ({enProcesoFiltrada.length})
            </h2>
            <div className="flex flex-col gap-3">
              {enProcesoFiltrada.map((orden) => (
                <OrdenCard
                  key={orden.id}
                  orden={orden}
                  comboNombre={comboNombre(orden.comboId)}
                  lavadorNombre={lavadorNombre(orden.lavadorId)}
                  lavadorNombre2={orden.lavadorId2 ? lavadorNombre(orden.lavadorId2) : undefined}
                  tipoVehiculoNombre={tipoVehiculo(orden.tipoVehiculoId)?.nombre ?? '—'}
                  esMoto={tipoVehiculo(orden.tipoVehiculoId)?.categoria === 'moto'}
                  tiempoTexto={tiempoTranscurrido(orden.creadoEn, ahora)}
                  {...progresoLavado(orden)}
                  productosPendientes={ventasPendientesPorOrden.get(orden.id) ?? []}
                  productoNombre={productoNombre}
                  deOtroDia={deOtroDia(orden)}
                  onAgregarProducto={() => setAgregandoProductoA(orden)}
                  onQuitarProducto={setQuitandoProducto}
                  onFinalizar={() => setFinalizando(orden)}
                  onCobrarDirecto={() => setCobrando({ orden, finalizarPrimero: true })}
                  onReasignar={() => setReasignando(orden)}
                  onContactar={() => setContactando(orden)}
                  onEditarCliente={() => setEditandoCliente(orden)}
                  onVerTiquete={() => abrirTiquete(orden)}
                  onVerDetalle={() => setViendoDetalle(orden)}
                />
              ))}
              {enProcesoFiltrada.length === 0 ? (
                <Card className="py-8 text-center text-sm text-neutral-400">
                  {placaBuscada ? 'Ninguna en proceso coincide con la búsqueda.' : 'Nada en proceso ahora mismo.'}
                </Card>
              ) : null}
            </div>
          </div>

          <div>
            <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-neutral-900">
              <CheckCircle2 size={15} className="text-primary-600" />
              Listos para cobrar ({listoFiltrada.length})
            </h2>
            <div className="flex flex-col gap-3">
              {listoFiltrada.map((orden) => (
                <OrdenCard
                  key={orden.id}
                  orden={orden}
                  comboNombre={comboNombre(orden.comboId)}
                  lavadorNombre={lavadorNombre(orden.lavadorId)}
                  lavadorNombre2={orden.lavadorId2 ? lavadorNombre(orden.lavadorId2) : undefined}
                  tipoVehiculoNombre={tipoVehiculo(orden.tipoVehiculoId)?.nombre ?? '—'}
                  esMoto={tipoVehiculo(orden.tipoVehiculoId)?.categoria === 'moto'}
                  tiempoTexto={tiempoTranscurrido(orden.listaEn ?? orden.creadoEn, ahora)}
                  productosPendientes={ventasPendientesPorOrden.get(orden.id) ?? []}
                  productoNombre={productoNombre}
                  deOtroDia={deOtroDia(orden)}
                  onAgregarProducto={() => setAgregandoProductoA(orden)}
                  onQuitarProducto={setQuitandoProducto}
                  onCobrar={() => setCobrando({ orden, finalizarPrimero: false })}
                  onToggleNotificado={() => handleToggleNotificado(orden)}
                  onVolverAProceso={() => setVolviendoAProceso(orden)}
                  onReasignar={() => setReasignando(orden)}
                  onContactar={() => setContactando(orden)}
                  onEditarCliente={() => setEditandoCliente(orden)}
                  onVerTiquete={() => abrirTiquete(orden)}
                  onVerDetalle={() => setViendoDetalle(orden)}
                />
              ))}
              {listoFiltrada.length === 0 ? (
                <Card className="py-8 text-center text-sm text-neutral-400">
                  {placaBuscada ? 'Ninguna lista para cobrar coincide con la búsqueda.' : 'Nada listo para cobrar todavía.'}
                </Card>
              ) : null}
            </div>
          </div>
        </div>
      ) : (
        <EntregadosHoyTable
          entregadasHoy={entregadasFiltradas}
          comboNombre={comboNombre}
          lavadorNombre={lavadorNombre}
          tipoNombre={(id) => tipoVehiculo(id)?.nombre ?? '—'}
          onVerTiquete={abrirTiquete}
          onCorregirPago={setCorrigiendoPago}
        />
      )}

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
                        <span className="min-w-0 truncate text-neutral-600">{p.nombre}</span>
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
                        <span className="min-w-0 truncate text-neutral-600">{p.nombre}</span>
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


      {cobrando ? (
        <CobroModal
          orden={cobrando.orden}
          comboNombre={comboNombre(cobrando.orden.comboId)}
          finalizarPrimero={cobrando.finalizarPrimero}
          productosPendientes={ventasPendientesPorOrden.get(cobrando.orden.id) ?? []}
          productoNombre={productoNombre}
          onClose={() => setCobrando(null)}
          onCobrado={(pagos, descuento) => handleCobrado(cobrando.orden, pagos, descuento)}
        />
      ) : null}

      {corrigiendoPago ? (
        <CorregirPagoModal
          target={{ ordenId: corrigiendoPago.id }}
          referencia={`Orden #${corrigiendoPago.consecutivo} · ${corrigiendoPago.placa}`}
          onClose={() => setCorrigiendoPago(null)}
          onCorregido={async () => {
            setCorrigiendoPago(null)
            await refresh()
          }}
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
          tiposVehiculo={tiposVehiculo}
          onClose={() => setEditandoCliente(null)}
          onGuardado={async () => {
            setEditandoCliente(null)
            await refresh()
          }}
        />
      ) : null}

      {recibo ? (
        <ReciboModal
          recibo={recibo}
          variant={recibo.entregada || recibo.metodoPago ? 'pago' : 'ingreso'}
          autoPrint={reciboAutoPrint}
          onClose={() => setRecibo(null)}
        />
      ) : null}

      {viendoDetalle ? (
        <DetalleOrdenModal
          orden={viendoDetalle}
          comboNombre={comboNombre(viendoDetalle.comboId)}
          lavadorNombre={lavadorNombre(viendoDetalle.lavadorId)}
          lavadorNombre2={viendoDetalle.lavadorId2 ? lavadorNombre(viendoDetalle.lavadorId2) : undefined}
          tipoVehiculoNombre={tipoVehiculo(viendoDetalle.tipoVehiculoId)?.nombre ?? '—'}
          onClose={() => setViendoDetalle(null)}
          onVerTiquete={() => {
            abrirTiquete(viendoDetalle)
            setViendoDetalle(null)
          }}
        />
      ) : null}

      {contactando ? (
        <ContactoModal
          nombre={contactando.clienteNombre}
          placa={contactando.placa}
          telefono={contactando.clienteTelefono}
          correo={contactando.clienteCorreo}
          mensajeWhatsapp={construirMensajeWhatsapp(
            contactando,
            tipoVehiculo(contactando.tipoVehiculoId)?.categoria === 'moto',
          )}
          onClose={() => setContactando(null)}
        />
      ) : null}

      {finalizando ? (
        <ConfirmModal
          title={`¿Finalizar el lavado de ${finalizando.placa}?`}
          message="Pasará a la columna de Listos para cobrar."
          confirmLabel="Finalizar lavado"
          variant="primary"
          successMessage="Lavado finalizado"
          onConfirm={async () => {
            await handleMarcarListo(finalizando)
            setFinalizando(null)
          }}
          onCancel={() => setFinalizando(null)}
        />
      ) : null}

      {volviendoAProceso ? (
        <ConfirmModal
          title={`¿Volver ${volviendoAProceso.placa} a "En proceso"?`}
          message="Para cuando se marcó Listo por equivocación — vuelve a la columna En proceso y se puede finalizar de nuevo cuando corresponda."
          confirmLabel="Volver a proceso"
          variant="primary"
          successMessage="Orden devuelta a proceso"
          onConfirm={async () => {
            await handleVolverAProceso(volviendoAProceso)
            setVolviendoAProceso(null)
          }}
          onCancel={() => setVolviendoAProceso(null)}
        />
      ) : null}

      {agregandoProductoA ? (
        <AgregarProductoModal
          titulo="Agregar productos"
          subtitulo={`${agregandoProductoA.placa} · #${agregandoProductoA.consecutivo} — se cobran al entregar`}
          productos={productosVendibles}
          stockPorProducto={stockPorProducto}
          onClose={() => setAgregandoProductoA(null)}
          onAgregar={(productoId, cantidad) => handleAgregarProducto(agregandoProductoA, productoId, cantidad)}
        />
      ) : null}

      {quitandoProducto ? (
        <QuitarProductoModal
          venta={quitandoProducto}
          productoNombre={productoNombre(quitandoProducto.productoId)}
          onClose={() => setQuitandoProducto(null)}
          onQuitar={handleQuitarProducto}
        />
      ) : null}

      {viendoCajaDesglose ? (
        <CajaDesgloseModal
          total={totalCajaHoy}
          hayPagos={pagosVigentesHoy.length > 0}
          porMetodo={cajaPorMetodo}
          lavados={cajaLavados}
          productos={cajaProductos}
          productosPorCobrar={productosPorCobrar}
          onClose={() => setViendoCajaDesglose(false)}
        />
      ) : null}
    </div>
  )
}

// Antes vivía como tarjeta a ancho completo siempre visible — se movió a modal para que el
// dashboard no tenga que cargar con el desglose completo de memoria; el StatCard de arriba ya
// da el total glanceable, esto es para cuando de verdad hace falta el detalle.
function CajaDesgloseModal({
  total,
  hayPagos,
  porMetodo,
  lavados,
  productos,
  productosPorCobrar,
  onClose,
}: {
  total: number
  hayPagos: boolean
  porMetodo: { efectivo: number; transferencia: number; datafono: number }
  lavados: number
  productos: number
  productosPorCobrar: number
  onClose: () => void
}) {
  return (
    <Modal
      title="Caja del día"
      subtitle="Cobros de hoy, sin anulados"
      icon={Wallet}
      tone="success"
      size="sm"
      onClose={onClose}
      footer={
        <Button variant="ghost" onClick={onClose}>
          Cerrar
        </Button>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="flex flex-col">
          <span className="text-[11px] font-semibold tracking-wide text-neutral-500 uppercase">Cobrado hoy</span>
          <span className="text-3xl font-bold tracking-tight text-neutral-900">{COP.format(total)}</span>
          {productosPorCobrar > 0 ? (
            <span className="mt-1 flex items-center gap-1.5 text-xs text-warning-700">
              <CupSoda size={13} className="shrink-0" />
              {COP.format(productosPorCobrar)} en productos cargados sin cobrar · {COP.format(total + productosPorCobrar)} con eso
            </span>
          ) : null}
        </div>

        {!hayPagos ? (
          <p className="rounded-xl bg-neutral-50 py-6 text-center text-sm text-neutral-400">Todavía no hay cobros hoy.</p>
        ) : (
          <>
            <section className="flex flex-col gap-2">
              <h4 className="text-[11px] font-semibold tracking-wide text-neutral-500 uppercase">Por método</h4>
              <div className="grid grid-cols-3 gap-2">
                <CajaFila icon={Banknote} label="Efectivo" valor={porMetodo.efectivo} />
                <CajaFila icon={Landmark} label="Transferencia" valor={porMetodo.transferencia} />
                <CajaFila icon={CreditCard} label="Datáfono" valor={porMetodo.datafono} />
              </div>
            </section>
            <section className="flex flex-col gap-2">
              <h4 className="text-[11px] font-semibold tracking-wide text-neutral-500 uppercase">Por línea</h4>
              <div className="grid grid-cols-2 gap-2">
                <CajaFila icon={Droplets} label="Lavados" valor={lavados} />
                <CajaFila icon={CupSoda} label="Productos" valor={productos} />
              </div>
            </section>
          </>
        )}
      </div>
    </Modal>
  )
}

function CajaFila({ icon: Icon, label, valor }: { icon: typeof Banknote; label: string; valor: number }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-xl border border-neutral-100 px-3 py-2.5">
      <span className="flex min-w-0 items-center gap-1.5 text-xs text-neutral-500">
        <Icon size={13} className="shrink-0 text-neutral-400" />
        <span className="truncate">{label}</span>
      </span>
      <span className={`truncate text-sm font-bold ${valor > 0 ? 'text-neutral-900' : 'text-neutral-300'}`}>{COP.format(valor)}</span>
    </div>
  )
}

// Tarjeta del tablero de seguimiento (M3). Jerarquía de arriba abajo: estado + tiempo → placa →
// "cliente · vehículo · combo" → lavador; luego el detalle a cobrar si hay productos, y un pie con
// el monto a la izquierda y UNA acción principal a la derecha (finalizar / cobrar / asignar).
// Las acciones de apoyo son botones con ícono en una barra baja (en celular, los de menos uso
// quedan solo con el ícono). La barra delgada de arriba es el estado:
// en proceso se llena con el tiempo contra el promedio del combo hoy, listo es verde sólida.
function OrdenCard({
  orden,
  comboNombre,
  lavadorNombre,
  lavadorNombre2,
  tipoVehiculoNombre,
  esMoto,
  tiempoTexto,
  progreso,
  promedioTexto,
  productosPendientes,
  productoNombre,
  deOtroDia = false,
  onAgregarProducto,
  onQuitarProducto,
  onFinalizar,
  onCobrar,
  onCobrarDirecto,
  onToggleNotificado,
  onVolverAProceso,
  onReasignar,
  onContactar,
  onEditarCliente,
  onVerTiquete,
  onVerDetalle,
}: {
  orden: Orden
  comboNombre: string
  lavadorNombre: string
  /** Segundo lavador — solo cuando la orden se lava entre 2. */
  lavadorNombre2?: string
  tipoVehiculoNombre: string
  esMoto: boolean
  tiempoTexto: string
  /** En proceso: tiempo transcurrido / promedio del combo hoy (puede pasar de 1). Sin promedio, undefined. */
  progreso?: number
  /** "prom. 35 min" — se muestra junto al tiempo cuando hay promedio del combo. */
  promedioTexto?: string
  /** Productos de nevera cargados a esta orden y aún sin cobrar. */
  productosPendientes: Venta[]
  productoNombre: (id: string) => string
  /** Registrada un día anterior y todavía sin cobrar — se resalta para que no se olvide. */
  deOtroDia?: boolean
  onAgregarProducto?: () => void
  onQuitarProducto?: (venta: Venta) => void
  onFinalizar?: () => void
  onCobrar?: () => void
  /** Solo en tarjetas "en proceso" — cliente esperando en sala, no hace falta pasar primero por
   * "Listo para cobrar": marca el lavado terminado y abre el cobro en el mismo paso. */
  onCobrarDirecto?: () => void
  /** Solo en tarjetas "listo" — check manual para saber si ya se le avisó al cliente. */
  onToggleNotificado?: () => void
  /** Solo en tarjetas "listo" — corrige un "Finalizar lavado" hecho por equivocación. */
  onVolverAProceso?: () => void
  onReasignar?: () => void
  onContactar?: () => void
  onEditarCliente?: () => void
  onVerTiquete?: () => void
  onVerDetalle?: () => void
}) {
  const enProceso = orden.estado === 'en_proceso'
  // Registrada sin lavador (todos ocupados al recibirla, cliente hace cola) — necesita
  // asignación antes de poder finalizar/cobrar, así que se marca distinto del resto de "en
  // proceso" y no se ofrecen esas acciones todavía.
  const sinAsignar = enProceso && !orden.lavadorId
  const totalProductos = productosPendientes.reduce((suma, v) => suma + v.total, 0)
  const atrasado = progreso !== undefined && progreso > 1

  const estado = sinAsignar
    ? { label: 'En cola · sin lavador', chip: 'bg-danger-50 text-danger-700', punto: 'bg-danger-600' }
    : enProceso
      ? { label: 'Lavando', chip: 'bg-warning-50 text-warning-700', punto: 'bg-warning-600' }
      : { label: 'Listo', chip: 'bg-success-50 text-success-700', punto: 'bg-success-600' }

  const botonBarra =
    'flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-medium text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-900'

  return (
    <Card
      className={`group p-0 transition-shadow duration-300 hover:shadow-card-hover ${
        sinAsignar ? 'border-danger-600/30' : ''
      }`}
    >
      {/* Barra de estado: tiempo vs. promedio en proceso, verde sólida en listo */}
      <div className="h-1 overflow-hidden rounded-t-2xl bg-neutral-100">
        {sinAsignar ? (
          <div className="h-full w-full bg-danger-600/60" />
        ) : enProceso ? (
          progreso !== undefined ? (
            <div
              className={`h-full transition-[width] duration-700 ${atrasado ? 'bg-danger-600' : 'bg-warning-600'}`}
              style={{ width: `${Math.min(100, Math.max(4, progreso * 100))}%` }}
            />
          ) : null
        ) : (
          <div className="h-full w-full bg-success-600" />
        )}
      </div>

      <div className="flex items-start gap-3 p-4 pb-3">
        <div
          role={onVerDetalle ? 'button' : undefined}
          tabIndex={onVerDetalle ? 0 : undefined}
          onClick={onVerDetalle}
          onKeyDown={(e) => {
            if (onVerDetalle && (e.key === 'Enter' || e.key === ' ')) onVerDetalle()
          }}
          className={`flex min-w-0 flex-1 flex-col gap-2 ${onVerDetalle ? 'cursor-pointer' : ''}`}
        >
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${estado.chip}`}>
              <span className={`size-1.5 rounded-full ${estado.punto}`} />
              {estado.label}
            </span>
            <span className={`flex items-center gap-1 text-xs ${atrasado ? 'font-semibold text-danger-700' : 'text-neutral-500'}`}>
              <Clock size={12} className="shrink-0" />
              {enProceso ? tiempoTexto : `hace ${tiempoTexto}`}
              {enProceso && promedioTexto ? <span className="font-normal text-neutral-400">· {promedioTexto}</span> : null}
            </span>
            {deOtroDia ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-danger-600/10 px-2 py-0.5 text-[11px] font-semibold text-danger-700">
                <AlertTriangle size={11} />
                Sin cobrar desde el{' '}
                {new Date(orden.creadoEn).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })}
              </span>
            ) : null}
          </div>

          <div className="flex items-baseline gap-2">
            <span className="font-mono text-2xl font-bold tracking-tight text-neutral-900">{orden.placa}</span>
            <span className="text-xs text-neutral-400">#{orden.consecutivo}</span>
          </div>

          <p className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-sm text-neutral-600">
            <span className="truncate font-semibold text-neutral-800">{orden.clienteNombre}</span>
            <span className="text-neutral-300">·</span>
            <span className="flex items-center gap-1">
              {esMoto ? <Motorbike size={14} className="text-neutral-400" /> : <Car size={14} className="text-neutral-400" />}
              {tipoVehiculoNombre}
            </span>
            <span className="text-neutral-300">·</span>
            <span>{comboNombre}</span>
          </p>
        </div>

        {/* Derecha: la animación mientras se lava; en listo, el aviso al cliente */}
        {enProceso && !sinAsignar ? (
          <LavadoAnimation tipo={esMoto ? 'moto' : 'auto'} className="h-20 w-28 shrink-0 sm:h-24 sm:w-32" />
        ) : onToggleNotificado ? (
          <button
            type="button"
            onClick={onToggleNotificado}
            title={orden.notificadoListo ? 'Ya se le avisó al cliente — tocar para desmarcar' : 'Marcar que ya se le avisó al cliente'}
            className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-2 text-xs font-semibold transition-colors ${
              orden.notificadoListo
                ? 'bg-success-50 text-success-700 hover:bg-success-600/10'
                : 'border border-success-600/40 text-success-700 hover:bg-success-50'
            }`}
          >
            {orden.notificadoListo ? <BellRing size={14} /> : <Bell size={14} />}
            {orden.notificadoListo ? 'Avisado' : 'Avisar'}
          </button>
        ) : null}
      </div>

      {/* Lavador: dato + su acción pegada (cambiar) */}
      {!sinAsignar ? (
        <div className="flex items-center gap-1 px-4 pb-3">
          <span className="inline-flex min-w-0 items-center gap-2 rounded-full bg-neutral-100 py-1 pr-3 pl-1 text-xs font-semibold text-neutral-700">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary-600 text-[11px] font-bold text-white">
              {lavadorNombre.trim().charAt(0).toUpperCase() || '?'}
            </span>
            <span className="truncate">
              {lavadorNombre}
              {lavadorNombre2 ? ` + ${lavadorNombre2}` : ''}
            </span>
          </span>
          {onReasignar ? (
            <button
              type="button"
              onClick={onReasignar}
              title="Cambiar lavador"
              aria-label="Cambiar lavador"
              className="flex size-8 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-primary-50 hover:text-primary-700"
            >
              <Repeat size={14} />
            </button>
          ) : null}
        </div>
      ) : null}

      {/* Detalle a cobrar: mini-cuenta (lavado + productos), el total va en el pie */}
      {productosPendientes.length > 0 ? (
        <ul className="mx-4 mb-3 flex flex-col divide-y divide-neutral-100 rounded-xl border border-neutral-100 text-sm">
          <li className="flex items-center justify-between gap-3 px-3 py-2">
            <span className="flex min-w-0 items-center gap-2 text-neutral-700">
              <Droplets size={14} className="shrink-0 text-primary-500" />
              <span className="truncate">Lavado · {comboNombre}</span>
            </span>
            <span className="shrink-0 font-semibold text-neutral-900">{COP.format(orden.precio)}</span>
          </li>
          {productosPendientes.map((v) => (
            <li key={v.id} className="group/prod flex items-center justify-between gap-3 py-1 pr-1 pl-3">
              <span className="flex min-w-0 items-center gap-2 text-neutral-700">
                <CupSoda size={14} className="shrink-0 text-neutral-400" />
                <span className="truncate">{productoNombre(v.productoId)}</span>
                <span className="shrink-0 rounded-md bg-neutral-100 px-1.5 py-0.5 text-[11px] font-semibold text-neutral-500">
                  ×{v.cantidad}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-1">
                <span className="font-semibold text-neutral-900">{COP.format(v.total)}</span>
                {onQuitarProducto ? (
                  <button
                    type="button"
                    onClick={() => onQuitarProducto(v)}
                    title="Quitar producto"
                    aria-label={`Quitar ${productoNombre(v.productoId)}`}
                    className="flex size-8 items-center justify-center rounded-lg text-neutral-300 transition-colors group-hover/prod:text-neutral-400 hover:bg-danger-50 hover:text-danger-600"
                  >
                    <Trash2 size={14} />
                  </button>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {/* Pie de cobro: monto + una acción principal */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-neutral-100 px-4 py-3">
        <div className="flex flex-col">
          <span className="text-[11px] font-semibold tracking-wide text-neutral-500 uppercase">A cobrar</span>
          <span className="text-xl font-bold tracking-tight text-neutral-900">{COP.format(orden.precio + totalProductos)}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {sinAsignar && onReasignar ? (
            <button
              type="button"
              onClick={onReasignar}
              className="flex h-11 items-center gap-1.5 rounded-xl bg-danger-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-danger-700"
            >
              <Users size={16} />
              Asignar lavador
            </button>
          ) : null}
          {onCobrarDirecto && !sinAsignar ? (
            <button
              type="button"
              onClick={onCobrarDirecto}
              title="El cliente espera en sala — finaliza el lavado y cobra en un solo paso"
              className="flex h-11 items-center gap-1.5 rounded-xl border border-neutral-200 bg-white px-3.5 text-sm font-semibold text-neutral-700 transition-colors hover:border-success-600/40 hover:bg-success-50 hover:text-success-700"
            >
              <Banknote size={16} />
              Finalizar y cobrar
            </button>
          ) : null}
          {onFinalizar && !sinAsignar ? (
            <button
              type="button"
              onClick={onFinalizar}
              className="flex h-11 items-center gap-1.5 rounded-xl bg-primary-600 px-4 text-sm font-semibold text-white shadow-nav-active transition-colors hover:bg-primary-700"
            >
              <SprayCan size={16} />
              Finalizar lavado
            </button>
          ) : null}
          {onCobrar ? (
            <button
              type="button"
              onClick={onCobrar}
              className="flex h-11 items-center gap-1.5 rounded-xl bg-success-600 px-4 text-sm font-semibold text-white shadow-card transition-colors hover:bg-success-700"
            >
              <Banknote size={16} />
              Cobrar y entregar
            </button>
          ) : null}
        </div>
      </div>

      {/* Barra de apoyo: lo frecuente a la vista, el resto en "Más" */}
      <div className="flex items-center gap-0.5 border-t border-neutral-100 px-2 py-1.5">
        {onAgregarProducto ? (
          <button type="button" onClick={onAgregarProducto} className={botonBarra}>
            <Plus size={14} /> Producto
          </button>
        ) : null}
        {onContactar ? (
          <button type="button" onClick={onContactar} className={botonBarra}>
            <MessageCircle size={14} /> WhatsApp
          </button>
        ) : null}
        {onVerTiquete ? (
          <button type="button" onClick={onVerTiquete} className={botonBarra}>
            <Receipt size={14} /> Tiquete
          </button>
        ) : null}
        <span className="flex-1" />
        {onVolverAProceso ? (
          <button
            type="button"
            onClick={onVolverAProceso}
            title="Se marcó Listo por equivocación — vuelve a En proceso"
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-medium text-neutral-500 transition-colors hover:bg-warning-50 hover:text-warning-700"
          >
            <Undo2 size={14} />
            <span className="hidden sm:inline">Volver a proceso</span>
          </button>
        ) : null}
        {onEditarCliente ? (
          <button type="button" onClick={onEditarCliente} title="Editar placa, cliente o tipo de vehículo" className={botonBarra}>
            <Pencil size={14} />
            <span className="hidden sm:inline">Editar</span>
          </button>
        ) : null}
        {/* Corregir = lo que no se puede arreglar editando (el combo, o el precio de una orden ya
            cobrada): abre recepción con los datos precargados y, al guardar, encadena la orden
            nueva con la anulación de esta (ver 0046_corregir_orden.sql). */}
        <Link
          to="/recepcion"
          search={{ corrige: orden.id }}
          title="El combo o el precio están mal — reemplaza esta orden por una nueva"
          className="flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-medium text-neutral-500 transition-colors hover:bg-warning-50 hover:text-warning-700"
        >
          <FileWarning size={14} />
          <span className="hidden sm:inline">Corregir</span>
        </Link>
      </div>
    </Card>
  )
}

// Tabla de servicios entregados hoy (M3) — mismo criterio visual que /admin/órdenes, para
// poder reabrir/reimprimir el tiquete de cualquier orden ya terminada sin salir del dashboard.
function EntregadosHoyTable({
  entregadasHoy,
  comboNombre,
  lavadorNombre,
  tipoNombre,
  onVerTiquete,
  onCorregirPago,
}: {
  entregadasHoy: Orden[]
  comboNombre: (id: string | undefined) => string
  lavadorNombre: (id: string | undefined) => string
  tipoNombre: (id: string) => string
  onVerTiquete: (orden: Orden) => void
  onCorregirPago: (orden: Orden) => void
}) {
  const ordenadas = [...entregadasHoy].sort((a, b) => b.consecutivo - a.consecutivo)
  return (
    <Card className="overflow-hidden p-0">
      <div className="custom-scroll overflow-x-auto">
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
              <td className="px-5 py-3 text-neutral-700">
                {lavadorNombre(orden.lavadorId)}
                {orden.lavadorId2 ? ` + ${lavadorNombre(orden.lavadorId2)}` : ''}
              </td>
              <td className="px-5 py-3 font-medium text-neutral-900">
                {orden.descuento > 0 ? (
                  <span className="flex flex-col">
                    <span>{COP.format(orden.precio - orden.descuento)}</span>
                    <span className="text-xs font-normal text-warning-600" title={orden.descuentoMotivo ?? undefined}>
                      desc. −{COP.format(orden.descuento)}
                    </span>
                  </span>
                ) : (
                  COP.format(orden.precio)
                )}
              </td>
              <td className="px-5 py-3 text-neutral-700">
                {orden.metodoPago ? METODO_PAGO_LABEL[orden.metodoPago] : orden.estado === 'entregado' ? 'Cortesía' : '—'}
              </td>
              <td className="px-5 py-3">
                <div className="flex justify-end gap-1">
                  <button
                    type="button"
                    onClick={() => onCorregirPago(orden)}
                    className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-neutral-600 transition-colors hover:bg-primary-100 hover:text-primary-700"
                  >
                    <Wallet size={14} />
                    Corregir pago
                  </button>
                  <button
                    type="button"
                    onClick={() => onVerTiquete(orden)}
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
              <td className="px-5 py-8 text-center text-neutral-400" colSpan={9}>
                Todavía no se ha entregado nada hoy.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
      </div>
    </Card>
  )
}

const ESTADO_DETALLE: Record<Orden['estado'], { label: string; chip: string; punto: string }> = {
  en_proceso: { label: 'Lavando', chip: 'bg-warning-50 text-warning-700', punto: 'bg-warning-600' },
  listo: { label: 'Listo para cobrar', chip: 'bg-success-50 text-success-700', punto: 'bg-success-600' },
  entregado: { label: 'Entregado', chip: 'bg-neutral-100 text-neutral-600', punto: 'bg-neutral-400' },
  anulada: { label: 'Anulada', chip: 'bg-danger-50 text-danger-700', punto: 'bg-danger-600' },
}

// Encabezado común de los modales de una orden: placa grande + consecutivo y, debajo, un dato
// de contexto. Va como `title` del Modal para que todos se lean igual.
function TituloOrden({ orden }: { orden: Orden }) {
  return (
    <span className="flex items-baseline gap-2">
      <span className="font-mono text-lg font-bold tracking-tight">{orden.placa}</span>
      <span className="text-xs font-normal text-neutral-400">#{orden.consecutivo}</span>
    </span>
  )
}

function DetalleOrdenModal({
  orden,
  comboNombre,
  lavadorNombre,
  lavadorNombre2,
  tipoVehiculoNombre,
  onClose,
  onVerTiquete,
}: {
  orden: Orden
  comboNombre: string
  lavadorNombre: string
  lavadorNombre2?: string
  tipoVehiculoNombre: string
  onClose: () => void
  onVerTiquete: () => void
}) {
  const estado = ESTADO_DETALLE[orden.estado]
  return (
    <Modal
      title={<TituloOrden orden={orden} />}
      subtitle={
        <span className={`mt-1 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${estado.chip}`}>
          <span className={`size-1.5 rounded-full ${estado.punto}`} />
          {estado.label}
        </span>
      }
      icon={ClipboardCheck}
      size="sm"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cerrar
          </Button>
          <Button variant="primary" icon={Receipt} onClick={onVerTiquete}>
            Ver tiquete
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5 text-sm">
        <DetalleSeccion titulo="Cliente">
          <DetalleFila label="Nombre" valor={orden.clienteNombre} />
          <DetalleFila label="Teléfono" valor={orden.clienteTelefono ?? 'Sin registrar'} vacio={!orden.clienteTelefono} />
          <DetalleFila label="Correo" valor={orden.clienteCorreo ?? 'Sin registrar'} vacio={!orden.clienteCorreo} />
        </DetalleSeccion>

        <DetalleSeccion titulo="Servicio">
          <DetalleFila label="Vehículo" valor={tipoVehiculoNombre} />
          <DetalleFila label="Combo" valor={comboNombre} />
          {orden.serviciosAdicionales.length > 0 ? (
            <DetalleFila label="Adicionales" valor={orden.serviciosAdicionales.map((s) => s.nombre).join(', ')} />
          ) : null}
          <DetalleFila
            label={lavadorNombre2 ? 'Lavadores' : 'Lavador'}
            valor={lavadorNombre2 ? `${lavadorNombre} + ${lavadorNombre2}` : lavadorNombre}
          />
          <DetalleFila label="Precio" valor={COP.format(orden.precio)} fuerte />
        </DetalleSeccion>

        {orden.observaciones ? (
          <DetalleSeccion titulo="Observaciones">
            <p className="rounded-xl bg-warning-50 px-3 py-2.5 text-warning-700">{orden.observaciones}</p>
          </DetalleSeccion>
        ) : null}
      </div>
    </Modal>
  )
}

function DetalleSeccion({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h4 className="text-[11px] font-semibold tracking-wide text-neutral-500 uppercase">{titulo}</h4>
      <div className="flex flex-col divide-y divide-neutral-100 rounded-xl border border-neutral-100">{children}</div>
    </section>
  )
}

function DetalleFila({ label, valor, vacio = false, fuerte = false }: { label: string; valor: string; vacio?: boolean; fuerte?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2.5">
      <span className="shrink-0 text-neutral-500">{label}</span>
      <span
        className={`min-w-0 truncate text-right ${
          vacio ? 'text-neutral-400 italic' : fuerte ? 'font-bold text-neutral-900' : 'font-medium text-neutral-900'
        }`}
      >
        {valor}
      </span>
    </div>
  )
}

const SIN_ASIGNAR = '__sin_asignar__'

// Rejilla de lavadores para elegir con un toque (en vez de un desplegable): son pocos y el jefe
// de patio lo hace desde el celular. `extra` agrega opciones especiales al inicio (sin asignar).
function ElegirLavador({
  value,
  onChange,
  lavadores,
  extra = [],
  deshabilitado,
}: {
  value: string
  onChange: (id: string) => void
  lavadores: { id: string; nombre: string }[]
  extra?: { id: string; nombre: string }[]
  deshabilitado?: string
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {[...extra, ...lavadores].map((l) => {
        const marcado = value === l.id
        const especial = extra.some((e) => e.id === l.id)
        return (
          <button
            key={l.id}
            type="button"
            disabled={l.id === deshabilitado}
            onClick={() => onChange(l.id)}
            aria-pressed={marcado}
            className={`flex min-h-11 items-center gap-2.5 rounded-xl border px-3 py-2 text-left text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
              marcado
                ? 'border-primary-500 bg-primary-50 text-primary-700 ring-1 ring-primary-500'
                : 'border-neutral-200 text-neutral-700 hover:border-neutral-300 hover:bg-neutral-50'
            }`}
          >
            <span
              className={`flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                especial ? 'bg-neutral-100 text-neutral-400' : marcado ? 'bg-primary-600 text-white' : 'bg-neutral-100 text-neutral-600'
              }`}
            >
              {especial ? '—' : l.nombre.trim().charAt(0).toUpperCase()}
            </span>
            <span className="min-w-0 truncate">{l.nombre}</span>
          </button>
        )
      })}
    </div>
  )
}

// Maneja el lavador principal y, si aplica, el segundo ("lavar entre 2") en un solo modal —
// mismo lugar donde ya se asignaba/reasignaba el principal. Permite agregar un segundo lavador a
// una orden que no lo tenía, cambiarlo, o quitarlo (dejarla con uno solo otra vez).
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
  // Sin lavador previo (orden registrada sin asignar, todos ocupados al recibirla): este mismo
  // modal sirve para asignar por primera vez, no solo para reasignar. `SIN_ASIGNAR` es un
  // sentinel propio (no ''), para distinguir "elegí explícitamente quitar la asignación" de
  // "todavía no elegí nada" — eso último sigue dejando el submit deshabilitado.
  const esAsignacion = !orden.lavadorId
  const [lavadorId, setLavadorId] = useState(orden.lavadorId ?? '')
  const [entreDos, setEntreDos] = useState(Boolean(orden.lavadorId2))
  const [lavadorId2, setLavadorId2] = useState(orden.lavadorId2 ?? '')
  const [saving, setSaving] = useState(false)
  const enVueloRef = useRef(false)

  async function handleConfirmar() {
    if (enVueloRef.current) return
    const nuevoPrincipal = lavadorId === SIN_ASIGNAR ? null : lavadorId
    const nuevoSegundo = entreDos && lavadorId2 && lavadorId2 !== lavadorId ? lavadorId2 : null
    const cambioPrincipal = lavadorId && nuevoPrincipal !== (orden.lavadorId ?? null)
    const cambioSegundo = nuevoSegundo !== (orden.lavadorId2 ?? null)
    if (!lavadorId || (!cambioPrincipal && !cambioSegundo)) {
      onClose()
      return
    }
    enVueloRef.current = true
    setSaving(true)
    try {
      if (cambioPrincipal) await reasignarLavador(orden.id, nuevoPrincipal, 1)
      if (cambioSegundo) await reasignarLavador(orden.id, nuevoSegundo, 2)
      await onReasignado()
      toast.exito(esAsignacion ? 'Lavador asignado' : 'Lavador reasignado')
    } catch (err) {
      toast.desdeError(err, 'No se pudo reasignar el lavador')
    } finally {
      enVueloRef.current = false
      setSaving(false)
    }
  }

  return (
    <Modal
      title={esAsignacion ? 'Asignar lavador' : 'Cambiar lavador'}
      subtitle={`${orden.placa} · #${orden.consecutivo}`}
      icon={Users}
      size="sm"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" loading={saving} disabled={!lavadorId || (entreDos && !lavadorId2)} onClick={handleConfirmar}>
            {esAsignacion ? 'Asignar' : 'Guardar'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-neutral-700">¿Quién lo lava?</span>
          <ElegirLavador
            value={lavadorId}
            onChange={(id) => {
              setLavadorId(id)
              if (id === lavadorId2) setLavadorId2('')
            }}
            lavadores={lavadores}
            extra={esAsignacion ? [] : [{ id: SIN_ASIGNAR, nombre: 'Sin asignar' }]}
          />
        </div>

        {lavadorId && lavadorId !== SIN_ASIGNAR ? (
          <div className="flex flex-col gap-3 rounded-xl border border-neutral-100 p-3">
            <label className="flex items-center justify-between gap-3 text-sm">
              <span className="flex flex-col">
                <span className="font-medium text-neutral-700">Lavar entre 2</span>
                <span className="text-xs text-neutral-500">La comisión se reparte mitad y mitad.</span>
              </span>
              <input
                type="checkbox"
                checked={entreDos}
                onChange={(e) => {
                  setEntreDos(e.target.checked)
                  if (!e.target.checked) setLavadorId2('')
                }}
                className="size-5 accent-primary-600"
              />
            </label>
            {entreDos ? (
              <ElegirLavador value={lavadorId2} onChange={setLavadorId2} lavadores={lavadores} deshabilitado={lavadorId} />
            ) : null}
          </div>
        ) : null}
      </div>
    </Modal>
  )
}

const INPUT_MODAL =
  'w-full rounded-lg border border-neutral-300 px-3 py-2.5 text-sm outline-none transition-colors focus:border-primary-500 focus:ring-1 focus:ring-primary-500'

function EditarClienteModal({
  orden,
  tiposVehiculo,
  onClose,
  onGuardado,
}: {
  orden: Orden
  tiposVehiculo: TipoVehiculo[]
  onClose: () => void
  onGuardado: () => Promise<void>
}) {
  const [placa, setPlaca] = useState(orden.placa)
  const [clienteNombre, setClienteNombre] = useState(orden.clienteNombre)
  const [clienteTelefono, setClienteTelefono] = useState(orden.clienteTelefono ?? '')
  const [clienteCorreo, setClienteCorreo] = useState(orden.clienteCorreo ?? '')
  const [tipoId, setTipoId] = useState(orden.tipoVehiculoId)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const enVueloRef = useRef(false)

  // Solo tipos de la misma categoría que el actual — cambiar de categoría rompería el combo
  // (auto ↔ camioneta ↔ camioneta de platón, no auto → moto).
  const categoriaActual = tiposVehiculo.find((t) => t.id === orden.tipoVehiculoId)?.categoria
  const opcionesTipo = tiposVehiculo.filter(
    (t) => t.activo && (categoriaActual ? t.categoria === categoriaActual : true),
  )
  const tipoCambio = tipoId !== orden.tipoVehiculoId

  async function handleSubmit(event?: FormEvent) {
    event?.preventDefault()
    if (enVueloRef.current) return
    const parsed = clienteInfoInputSchema.safeParse({
      placa,
      clienteNombre,
      clienteTelefono: clienteTelefono || undefined,
      clienteCorreo: clienteCorreo || undefined,
    })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Datos inválidos')
      return
    }
    setError(null)
    enVueloRef.current = true
    setSaving(true)
    try {
      await editarInfoCliente(orden.id, parsed.data)
      // El tipo va aparte: recalcula precio + comisiones (regla 1), por eso es su propia RPC.
      if (tipoCambio) {
        await cambiarTipoOrden(orden.id, tipoId)
      }
      await onGuardado()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el cambio')
      toast.desdeError(err, 'No se pudo guardar el cambio')
    } finally {
      enVueloRef.current = false
      setSaving(false)
    }
  }

  return (
    <Modal
      title="Editar datos"
      subtitle={`${orden.placa} · #${orden.consecutivo}`}
      icon={Pencil}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" loading={saving} onClick={() => void handleSubmit()}>
            Guardar cambios
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <section className="flex flex-col gap-3">
          <h4 className="text-[11px] font-semibold tracking-wide text-neutral-500 uppercase">Vehículo</h4>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-neutral-700">Placa</span>
              <input
                value={placa}
                onChange={(event) => setPlaca(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
                maxLength={6}
                className={`${INPUT_MODAL} font-mono tracking-wider`}
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-neutral-700">Tipo de vehículo</span>
              <CustomSelect
                size="sm"
                value={tipoId}
                onChange={setTipoId}
                placeholder="Selecciona…"
                options={opcionesTipo.map((t) => ({ value: t.id, label: t.nombre }))}
              />
            </label>
          </div>
          {tipoCambio ? (
            <p className="flex items-center gap-1.5 rounded-lg bg-warning-50 px-3 py-2 text-xs font-medium text-warning-700">
              <AlertTriangle size={13} className="shrink-0" />
              Al guardar se recalculan el precio del lavado y las comisiones.
            </p>
          ) : null}
        </section>

        <section className="flex flex-col gap-3">
          <h4 className="text-[11px] font-semibold tracking-wide text-neutral-500 uppercase">Cliente</h4>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-neutral-700">Nombre</span>
            <input value={clienteNombre} onChange={(event) => setClienteNombre(event.target.value)} className={INPUT_MODAL} />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-neutral-700">Teléfono</span>
              <input
                inputMode="tel"
                value={clienteTelefono}
                onChange={(event) => setClienteTelefono(event.target.value)}
                className={INPUT_MODAL}
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-neutral-700">Correo</span>
              <input type="email" value={clienteCorreo} onChange={(event) => setClienteCorreo(event.target.value)} className={INPUT_MODAL} />
            </label>
          </div>
        </section>

        {error ? <p className="rounded-lg bg-danger-50 px-3 py-2.5 text-sm text-danger-700">{error}</p> : null}
        {/* Enter en cualquier campo guarda */}
        <button type="submit" className="hidden" aria-hidden="true" tabIndex={-1} />
      </form>
    </Modal>
  )
}

interface DescuentoResumen {
  monto: number
  motivo: string
}

// Cobro de una orden: arriba el total grande y su desglose (lavado, descuento, productos), luego
// cómo paga y, si es solo efectivo, cuánto entrega y el cambio. El botón del pie dice el monto
// exacto que se cobra. El descuento va cerrado por defecto (regla antifraude).
function CobroModal({
  orden,
  comboNombre,
  finalizarPrimero,
  productosPendientes,
  productoNombre,
  onClose,
  onCobrado,
}: {
  orden: Orden
  comboNombre: string
  /** Orden todavía en_proceso (cliente esperando en sala) — marca el lavado terminado antes de
   * cobrar, en el mismo submit, para no obligar a pasar primero por "Listo para cobrar". */
  finalizarPrimero?: boolean
  /** Productos de nevera cargados a la orden — se cobran en la misma factura. */
  productosPendientes: Venta[]
  productoNombre: (id: string) => string
  onClose: () => void
  onCobrado: (pagos: PagoLineaInput[], descuento?: DescuentoResumen) => void
}) {
  const totalProductos = productosPendientes.reduce((suma, v) => suma + v.total, 0)

  // Descuento sobre el lavado, absorbido por el negocio — no toca comisiones. Cerrado por
  // defecto (regla antifraude: descuentos deshabilitados salvo que se presione).
  const [descAbierto, setDescAbierto] = useState(false)
  const [descModo, setDescModo] = useState<'monto' | 'pct'>('monto')
  const [descValor, setDescValor] = useState('')
  const [descMotivo, setDescMotivo] = useState('')
  const [descAutoriza, setDescAutoriza] = useState('')

  const descBruto =
    !descAbierto || !descValor
      ? 0
      : descModo === 'pct'
        ? Math.round((orden.precio * Math.min(Number(descValor), 100)) / 100)
        : Number(descValor)
  const descuentoMonto = Math.max(0, Math.min(descBruto, orden.precio))
  const subtotalLavado = orden.precio - descuentoMonto
  const totalCobro = subtotalLavado + totalProductos
  const esCortesia = totalCobro === 0

  // Arranca con una sola línea de efectivo por el total — el caso más común es un pago simple.
  const [lineas, setLineas] = useState<PagoLineaBorrador[]>([nuevaLineaBorrador(orden.precio + totalProductos)])
  // Con una sola línea, el monto se deriva del total (única forma de que cuadre) — así el
  // descuento lo reajusta solo, sin `useEffect`.
  const lineasEfectivas: PagoLineaBorrador[] =
    lineas.length === 1 ? [{ ...lineas[0], monto: totalCobro > 0 ? String(totalCobro) : '' }] : lineas

  const [montoRecibido, setMontoRecibido] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const enVueloRef = useRef(false)

  const descIncompleto = descuentoMonto > 0 && (!descMotivo.trim() || !descAutoriza.trim())
  const cuadra = !descIncompleto && (esCortesia || pagoLineasCuadra(lineasEfectivas, totalCobro))
  const soloEfectivo = lineasEfectivas.length === 1 && lineasEfectivas[0].metodo === 'efectivo'
  const cambio = soloEfectivo && montoRecibido ? Number(montoRecibido) - totalCobro : undefined

  function quitarDescuento() {
    setDescAbierto(false)
    setDescValor('')
    setDescMotivo('')
    setDescAutoriza('')
  }

  async function handleSubmit() {
    if (enVueloRef.current) return
    if (descIncompleto) {
      setError('El descuento exige un motivo y quién lo autoriza')
      return
    }
    if (!esCortesia && !pagoLineasCuadra(lineasEfectivas, totalCobro)) {
      setError(`Las líneas de pago deben sumar exactamente ${COP.format(totalCobro)}`)
      return
    }
    setError(null)
    enVueloRef.current = true
    setSaving(true)
    try {
      if (finalizarPrimero) {
        await marcarListo(orden.id)
      }
      const pagos = esCortesia ? [] : borradorAPagos(lineasEfectivas)
      const descuento =
        descuentoMonto > 0
          ? {
              monto: descuentoMonto,
              pct: descModo === 'pct' && descValor ? Math.min(Number(descValor), 100) : undefined,
              motivo: descMotivo.trim(),
              autorizadoPor: descAutoriza.trim(),
            }
          : undefined
      await cobrarYEntregarOrden(orden.id, pagos, descuento)
      onCobrado(pagos, descuento ? { monto: descuento.monto, motivo: descuento.motivo } : undefined)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar el cobro')
      toast.desdeError(err, 'No se pudo registrar el cobro')
      enVueloRef.current = false
      setSaving(false)
    }
  }

  return (
    <Modal
      title="Cobrar y entregar"
      subtitle={`${orden.placa} · #${orden.consecutivo} · ${orden.clienteNombre}`}
      icon={Banknote}
      tone="success"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={saving || !cuadra}
            className="flex h-11 items-center justify-center gap-2 rounded-xl bg-success-600 px-5 text-sm font-semibold text-white shadow-card transition-colors hover:bg-success-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <CheckCircle2 size={16} />
            {saving ? 'Registrando…' : esCortesia ? 'Entregar (cortesía)' : `Cobrar ${COP.format(totalCobro)}`}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        {finalizarPrimero ? (
          <p className="flex items-center gap-2 rounded-xl bg-primary-50 px-3 py-2.5 text-xs font-medium text-primary-700">
            <SprayCan size={14} className="shrink-0" />
            También marca el lavado como terminado — el cliente espera en sala.
          </p>
        ) : null}

        {/* Total y desglose */}
        <section className="flex flex-col gap-3">
          <div className="flex items-end justify-between gap-3">
            <div className="flex flex-col">
              <span className="text-[11px] font-semibold tracking-wide text-neutral-500 uppercase">Total a cobrar</span>
              <span className="text-3xl font-bold tracking-tight text-neutral-900">{COP.format(totalCobro)}</span>
            </div>
            {!descAbierto ? (
              <button
                type="button"
                onClick={() => setDescAbierto(true)}
                className="flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-medium text-neutral-500 transition-colors hover:bg-warning-50 hover:text-warning-700"
              >
                <Percent size={13} /> Descuento
              </button>
            ) : null}
          </div>
          <ul className="flex flex-col divide-y divide-neutral-100 rounded-xl border border-neutral-100 text-sm">
            <li className="flex items-center justify-between gap-3 px-3 py-2.5">
              <span className="flex min-w-0 items-center gap-2 text-neutral-700">
                <Droplets size={14} className="shrink-0 text-primary-500" />
                <span className="truncate">Lavado · {comboNombre}</span>
              </span>
              <span className="shrink-0 font-medium text-neutral-900">{COP.format(orden.precio)}</span>
            </li>
            {descuentoMonto > 0 ? (
              <li className="flex items-center justify-between gap-3 px-3 py-2.5 text-warning-700">
                <span className="flex items-center gap-2">
                  <Percent size={14} className="shrink-0" />
                  Descuento{descModo === 'pct' && descValor ? ` ${Math.min(Number(descValor), 100)}%` : ''}
                </span>
                <span className="shrink-0 font-medium">−{COP.format(descuentoMonto)}</span>
              </li>
            ) : null}
            {productosPendientes.map((v) => (
              <li key={v.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                <span className="flex min-w-0 items-center gap-2 text-neutral-700">
                  <CupSoda size={14} className="shrink-0 text-neutral-400" />
                  <span className="truncate">{productoNombre(v.productoId)}</span>
                  <span className="shrink-0 rounded-md bg-neutral-100 px-1.5 py-0.5 text-[11px] font-semibold text-neutral-500">×{v.cantidad}</span>
                </span>
                <span className="shrink-0 font-medium text-neutral-900">{COP.format(v.total)}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* Descuento — cerrado por defecto; el negocio lo absorbe, no toca comisiones */}
        {descAbierto ? (
          <section className="flex flex-col gap-3 rounded-xl border border-warning-600/25 bg-warning-50/50 p-3">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-warning-700">
                <Percent size={13} /> Descuento — lo absorbe el negocio
              </span>
              <button type="button" onClick={quitarDescuento} className="text-xs font-medium text-neutral-500 hover:text-danger-600">
                Quitar
              </button>
            </div>
            <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-2">
              <div className="grid grid-cols-2 gap-1 rounded-lg bg-white p-1">
                {(['monto', 'pct'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setDescModo(m)}
                    aria-pressed={descModo === m}
                    className={`rounded-md px-3 py-2 text-xs font-semibold transition-colors ${
                      descModo === m ? 'bg-warning-600 text-white' : 'text-neutral-500 hover:text-neutral-700'
                    }`}
                  >
                    {m === 'monto' ? '$' : '%'}
                  </button>
                ))}
              </div>
              {descModo === 'monto' ? (
                <CurrencyInput size="sm" value={descValor} onChange={setDescValor} placeholder="0" />
              ) : (
                <div className="flex items-center gap-2 rounded-lg border border-neutral-300 bg-white px-3 py-2.5 focus-within:border-primary-500 focus-within:ring-1 focus-within:ring-primary-500">
                  <input
                    inputMode="numeric"
                    value={descValor}
                    onChange={(e) => setDescValor(e.target.value.replace(/\D/g, '').slice(0, 3))}
                    placeholder="0"
                    className="w-full min-w-0 bg-transparent text-sm outline-none"
                  />
                  <span className="shrink-0 text-neutral-400">%</span>
                </div>
              )}
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <input
                value={descMotivo}
                onChange={(e) => setDescMotivo(e.target.value)}
                placeholder="Motivo (amigo, cortesía…)"
                className={`${INPUT_MODAL} bg-white`}
              />
              <input
                value={descAutoriza}
                onChange={(e) => setDescAutoriza(e.target.value)}
                placeholder="Quién lo autoriza"
                className={`${INPUT_MODAL} bg-white`}
              />
            </div>
          </section>
        ) : null}

        {/* Cómo paga */}
        {esCortesia ? (
          <p className="rounded-xl bg-success-50 px-3 py-3 text-center text-sm font-medium text-success-700">
            Cortesía total — no se cobra nada. La comisión del lavador se paga igual (la cubre el negocio).
          </p>
        ) : (
          <section className="flex flex-col gap-2">
            <h4 className="text-[11px] font-semibold tracking-wide text-neutral-500 uppercase">Cómo paga</h4>
            <PagoLineas lineas={lineasEfectivas} onChange={setLineas} total={totalCobro} size="sm" />
          </section>
        )}

        {!esCortesia && soloEfectivo ? (
          <section className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-neutral-700">
                Con cuánto paga <span className="font-normal text-neutral-400">(opcional)</span>
              </span>
              <CurrencyInput size="sm" value={montoRecibido} onChange={setMontoRecibido} placeholder="0" />
            </label>
            {cambio !== undefined ? (
              <div
                className={`flex flex-col rounded-xl px-3 py-2 ${cambio < 0 ? 'bg-danger-50 text-danger-700' : 'bg-success-50 text-success-700'}`}
              >
                <span className="text-[11px] font-semibold tracking-wide uppercase">{cambio < 0 ? 'Falta' : 'Devolver'}</span>
                <span className="text-xl font-bold">{COP.format(Math.abs(cambio))}</span>
              </div>
            ) : null}
          </section>
        ) : null}

        {error ? <p className="rounded-lg bg-danger-50 px-3 py-2.5 text-sm text-danger-700">{error}</p> : null}
      </div>
    </Modal>
  )
}
