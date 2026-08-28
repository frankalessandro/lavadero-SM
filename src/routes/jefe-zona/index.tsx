import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
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
  Receipt,
  ClipboardCheck,
  Search,
  Bell,
  BellRing,
  Undo2,
  Plus,
  Minus,
  Trash2,
  CupSoda,
} from 'lucide-react'
import {
  fetchOrdenesHoy,
  fetchOrdenesEntregadasHoy,
  marcarListo,
  volverAProceso,
  cobrarYEntregarOrden,
  reasignarLavador,
  editarInfoCliente,
  marcarNotificado,
} from '../../data/ordenes'
import { fetchLavadores } from '../../data/lavadores'
import { fetchAsistenciasDelDia, fetchDiasDescanso, ensureDiasDescansoGenerados } from '../../data/asistenciaLavadores'
import { fetchCombos } from '../../data/combos'
import { fetchTiposVehiculo } from '../../data/tiposVehiculo'
import { fetchTurnoAbierto } from '../../data/turnos'
import { fetchProductosOperativo } from '../../data/productos'
import { fetchStockProductosOperativo } from '../../data/movimientosInventario'
import { createVenta, anularVenta, fetchVentasPendientes } from '../../data/ventas'
import { anularVentaInputSchema, type Venta } from '../../schemas/venta'
import type { Producto } from '../../schemas/producto'
import { clienteInfoInputSchema, cobroInputSchema, type MetodoPago, type Orden } from '../../schemas/orden'
import { StatCard } from '../../components/layout/StatCard'
import { Card } from '../../components/layout/Card'
import { CustomSelect } from '../../components/layout/CustomSelect'
import { ReciboModal, type ReciboData } from '../../components/layout/ReciboModal'
import { ConfirmModal } from '../../components/layout/ConfirmModal'
import { CurrencyInput } from '../../components/layout/CurrencyInput'
import { ContactoModal } from '../../components/layout/ContactoModal'
import { LavadoAnimation } from '../../components/layout/LavadoAnimation'
import { BarChart } from '../../components/layout/BarChart'
import { METODO_PAGO_LABEL } from '../../lib/metodoPago'

function hoyISO(): string {
  return new Date().toISOString().slice(0, 10)
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
  ])
  return {
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
  }
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
  const [productos] = useState<Producto[]>(data.productos)
  const [stock, setStock] = useState(data.stock)
  // Productos de nevera cargados a órdenes que todavía no se cobran (estado 'pendiente'). Se
  // agrupan por orden para el chip de cada tarjeta y para sumarlos al total del cobro.
  const [ventasPendientes, setVentasPendientes] = useState<Venta[]>(data.ventasPendientes)
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
  const [recibo, setRecibo] = useState<ReciboData | null>(null)
  // Solo se activa al cobrar (handleCobrado) — al reabrir un tiquete ya emitido (abrirTiquete)
  // no queremos disparar la impresión sola cada vez que alguien solo quiere verlo.
  const [reciboAutoPrint, setReciboAutoPrint] = useState(false)
  const [contactando, setContactando] = useState<Orden | null>(null)
  // Tablero de seguimiento (en proceso/listos) vs. tabla de entregados hoy — ambas vistas
  // permiten reabrir e imprimir el tiquete de cualquier orden, en cualquier estado.
  const [vista, setVista] = useState<'seguimiento' | 'entregados'>('seguimiento')
  const [viendoDetalle, setViendoDetalle] = useState<Orden | null>(null)

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
    const [nuevasOrdenes, nuevasEntregadas, nuevoTurno, nuevoStock, nuevasPendientes] = await Promise.all([
      fetchOrdenesHoy(),
      fetchOrdenesEntregadasHoy(),
      fetchTurnoAbierto('jefe_zona'),
      fetchStockProductosOperativo(),
      fetchVentasPendientes(),
    ])
    setOrdenesHoy(nuevasOrdenes)
    setEntregadasHoy(nuevasEntregadas)
    setTurno(nuevoTurno)
    setStock(nuevoStock)
    setVentasPendientes(nuevasPendientes)
    router.invalidate()
  }

  // Recepción/vigilante meten datos desde otros dispositivos (tablet, otro puesto) al mismo
  // tiempo — sin esto, el jefe de zona solo veía vehículos/movimientos nuevos si recargaba con
  // F5. Polling simple (no realtime): funciona igual contra Supabase que contra el sandbox local
  // de PostgREST, que no tiene servidor de realtime. `enVueloRef` evita apilar refrescos si uno
  // tarda más que el intervalo (ej. conexión lenta en el momento).
  const enVueloRef = useRef(false)
  useEffect(() => {
    const id = setInterval(async () => {
      if (enVueloRef.current) return
      enVueloRef.current = true
      try {
        await refresh()
      } finally {
        enVueloRef.current = false
      }
    }, 12_000)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleMarcarListo(orden: Orden) {
    await marcarListo(orden.id)
    await refresh()
  }

  async function handleToggleNotificado(orden: Orden) {
    await marcarNotificado(orden.id, !orden.notificadoListo)
    await refresh()
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

  async function handleQuitarProducto(venta: Venta, motivo: string) {
    await anularVenta(venta.id, {
      motivo,
      anuladaPor: turno?.responsableActual ?? 'jefe de zona',
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
  const stockPorProducto = useMemo(() => {
    const mapa = new Map<string, number>()
    for (const s of stock) mapa.set(s.productoId, s.stock)
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

  const enProcesoLista = ordenesHoy.filter((o) => o.estado === 'en_proceso')
  const listoLista = ordenesHoy.filter((o) => o.estado === 'listo')
  const anuladasHoyLista = ordenesHoy.filter((o) => o.estado === 'anulada')
  const lavadoresActivos = lavadores.filter((l) => l.activo).length

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
    // Se capturan ANTES del refresh: tras cobrar dejan de estar 'pendiente' y salen del mapa.
    const productos = (ventasPendientesPorOrden.get(orden.id) ?? []).map((v) => ({
      nombre: productoNombre(v.productoId),
      cantidad: v.cantidad,
      total: v.total,
    }))
    const totalProductos = productos.reduce((suma, p) => suma + p.total, 0)
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
      precioLavado: productos.length > 0 ? orden.precio : undefined,
      precio: orden.precio + totalProductos,
      fecha: new Date().toISOString(),
      metodoPago,
      referenciaPago,
    })
    setReciboAutoPrint(true)
    setCobrando(null)
    await refresh()
  }

  // Reabrir el tiquete de una orden ya existente, en cualquier estado (en proceso, listo o
  // entregado) — mismo componente/diseño que el comprobante que se muestra al registrar o
  // cobrar, para poder verlo/reimprimirlo en cualquier momento sin repetir esa acción.
  function abrirTiquete(orden: Orden) {
    setRecibo({
      consecutivo: orden.consecutivo,
      placa: orden.placa,
      clienteNombre: orden.clienteNombre,
      comboNombre: comboNombre(orden.comboId),
      serviciosAdicionales: orden.serviciosAdicionales.map((s) => s.nombre),
      tipoNombre: tipoVehiculo(orden.tipoVehiculoId)?.nombre ?? '—',
      lavadorNombre: lavadorNombre(orden.lavadorId),
      lavadorNombre2: orden.lavadorId2 ? lavadorNombre(orden.lavadorId2) : undefined,
      precio: orden.precio,
      fecha: orden.estado === 'entregado' ? (orden.entregadaEn ?? orden.creadoEn) : orden.creadoEn,
      metodoPago: orden.metodoPago,
      referenciaPago: orden.referenciaPago,
    })
    setReciboAutoPrint(false)
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
        <StatCard
          label="Lavados de hoy"
          value={String(ordenesHoy.filter((o) => o.estado !== 'anulada').length)}
          hint={anuladasHoyLista.length > 0 ? `${anuladasHoyLista.length} anulada${anuladasHoyLista.length === 1 ? '' : 's'} — no cuenta aquí` : undefined}
          icon={Droplets}
        />
        <StatCard label="En proceso / listos" value={String(enProcesoLista.length + listoLista.length)} icon={ClipboardList} />
        <StatCard label="Lavadores activos" value={String(lavadoresActivos)} icon={Users} />
        <StatCard
          label="Caja del día"
          value={COP.format(cajaDelDia)}
          hint="Solo lo cobrado — sin arqueo (M5)"
          icon={Wallet}
          info={{
            title: 'Qué es "Caja del día"',
            description:
              'Suma el precio de todas las órdenes de lavado entregadas HOY (cobradas), sin importar el método de pago (efectivo, transferencia o datáfono) — un vehículo registrado hoy pero que todavía no se entrega/cobra no cuenta acá.\n\nNo es el arqueo del turno: no resta gastos ni distingue el método de pago (eso solo importa para el conteo físico de caja, que se hace en /jefe-zona/caja al cerrar turno — ni transferencia ni datáfono son efectivo físico). Tampoco incluye parqueadero, que se cobra y se arquea aparte con el vigilante.',
          }}
        />
      </div>

      {anuladasHoyLista.length > 0 ? (
        <Card className="flex flex-col gap-2 border border-danger-100 bg-danger-50/40 text-left">
          <h3 className="text-sm font-semibold text-danger-700">
            {anuladasHoyLista.length} orden{anuladasHoyLista.length === 1 ? '' : 'es'} anulada{anuladasHoyLista.length === 1 ? '' : 's'} hoy
          </h3>
          <ul className="flex flex-col gap-1.5 text-xs text-neutral-600">
            {anuladasHoyLista.map((o) => (
              <li key={o.id}>
                <span className="font-mono font-semibold text-neutral-800">{o.placa}</span> · #{o.consecutivo} — Motivo:{' '}
                {o.motivoAnulacion ?? '—'} · Anuló: {o.anuladaPor ?? '—'}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

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

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <label className="relative flex items-center">
          <Search size={16} className="pointer-events-none absolute left-3 text-neutral-400" />
          <input
            value={busquedaPlaca}
            onChange={(e) => setBusquedaPlaca(e.target.value)}
            placeholder="Buscar por placa…"
            className="w-full rounded-lg border border-neutral-300 py-2.5 pl-9 pr-3 text-sm outline-none transition-colors focus:border-primary-500 focus:ring-1 focus:ring-primary-500 sm:max-w-xs"
          />
        </label>
        <div className="sm:max-w-56">
          <CustomSelect
            size="sm"
            value={lavadorFiltro}
            onChange={setLavadorFiltro}
            placeholder="Todos los lavadores"
            options={[
              { value: 'todos', label: 'Todos los lavadores' },
              { value: 'sin_asignar', label: 'Sin asignar' },
              ...lavadores.map((l) => ({ value: l.id, label: l.nombre })),
            ]}
          />
        </div>
      </div>

      {/* Seguimiento (M3) vs. entregados hoy — ambas vistas permiten reabrir/imprimir el
          tiquete de cualquier orden, sin importar el estado. */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setVista('seguimiento')}
          className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
            vista === 'seguimiento'
              ? 'border-primary-600 bg-primary-50 text-primary-700'
              : 'border-neutral-200 text-neutral-600 hover:bg-neutral-50'
          }`}
        >
          <SprayCan size={15} />
          Seguimiento
        </button>
        <button
          type="button"
          onClick={() => setVista('entregados')}
          className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
            vista === 'entregados'
              ? 'border-primary-600 bg-primary-50 text-primary-700'
              : 'border-neutral-200 text-neutral-600 hover:bg-neutral-50'
          }`}
        >
          <ClipboardCheck size={15} />
          Entregados hoy ({entregadasHoy.length})
        </button>
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
                  productosPendientes={ventasPendientesPorOrden.get(orden.id) ?? []}
                  productoNombre={productoNombre}
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
        />
      )}

      {cobrando ? (
        <CobroModal
          orden={cobrando.orden}
          finalizarPrimero={cobrando.finalizarPrimero}
          productosPendientes={ventasPendientesPorOrden.get(cobrando.orden.id) ?? []}
          productoNombre={productoNombre}
          onClose={() => setCobrando(null)}
          onCobrado={(metodoPago, referenciaPago) => handleCobrado(cobrando.orden, metodoPago, referenciaPago)}
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

      {recibo ? (
        <ReciboModal
          recibo={recibo}
          variant={recibo.metodoPago ? 'pago' : 'ingreso'}
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
          onConfirm={async () => {
            await handleVolverAProceso(volviendoAProceso)
            setVolviendoAProceso(null)
          }}
          onCancel={() => setVolviendoAProceso(null)}
        />
      ) : null}

      {agregandoProductoA ? (
        <AgregarProductoModal
          orden={agregandoProductoA}
          productos={productosVendibles}
          stockPorProducto={stockPorProducto}
          onClose={() => setAgregandoProductoA(null)}
          onAgregar={handleAgregarProducto}
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
    </div>
  )
}

function OrdenCard({
  orden,
  comboNombre,
  lavadorNombre,
  lavadorNombre2,
  tipoVehiculoNombre,
  esMoto,
  tiempoTexto,
  productosPendientes,
  productoNombre,
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
  /** Productos de nevera cargados a esta orden y aún sin cobrar. */
  productosPendientes: Venta[]
  productoNombre: (id: string) => string
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
  const VehiculoIcon = esMoto ? Motorbike : Car
  const totalProductos = productosPendientes.reduce((suma, v) => suma + v.total, 0)
  return (
    <Card
      className={`group border-l-4 p-0 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-card-hover ${
        sinAsignar
          ? 'border-l-danger-500 bg-danger-50/40'
          : enProceso
            ? 'border-l-warning-600 bg-warning-50/40'
            : 'border-l-primary-500 bg-primary-50/40 shadow-nav-active'
      }`}
    >
      <div
        role={onVerDetalle ? 'button' : undefined}
        tabIndex={onVerDetalle ? 0 : undefined}
        onClick={onVerDetalle}
        onKeyDown={(e) => {
          if (onVerDetalle && (e.key === 'Enter' || e.key === ' ')) onVerDetalle()
        }}
        className={`flex items-center justify-between gap-2 p-3 pb-2 ${onVerDetalle ? 'cursor-pointer' : ''}`}
      >
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
              {lavadorNombre2 ? ` + ${lavadorNombre2}` : ''}
            </span>
            <span className="flex items-center gap-1 font-medium text-neutral-600">
              <Clock size={13} /> {tiempoTexto}
            </span>
          </p>
        </div>

        {/* Protagonista pero a la medida del bloque de texto — no un banner aparte. Solo mientras
            está en proceso y ya tiene lavador; "listo para cobrar" usa ese mismo espacio para el
            check de "ya avisé", "sin asignar" para el aviso de que hace cola. */}
        {enProceso && !sinAsignar ? (
          <LavadoAnimation tipo={esMoto ? 'moto' : 'auto'} className="h-20 w-28 shrink-0 sm:h-24 sm:w-32" />
        ) : sinAsignar ? (
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-danger-50 px-2.5 py-1 text-xs font-semibold text-danger-700">
            <Clock size={12} /> En cola
          </span>
        ) : onToggleNotificado ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onToggleNotificado()
            }}
            title={orden.notificadoListo ? 'Ya se le avisó al cliente — tocar para desmarcar' : 'Marcar que ya se le avisó al cliente'}
            className={`flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-medium transition-colors ${
              orden.notificadoListo
                ? 'bg-success-50 text-success-700 hover:bg-success-100'
                : 'border border-neutral-200 text-neutral-500 hover:bg-neutral-50'
            }`}
          >
            {orden.notificadoListo ? <BellRing size={14} /> : <Bell size={14} />}
            {orden.notificadoListo ? 'Avisado' : 'Avisar'}
          </button>
        ) : null}
      </div>

      {productosPendientes.length > 0 ? (
        <div className="flex flex-col gap-1 border-t border-neutral-100 bg-primary-50/40 px-3 py-2">
          <span className="flex items-center gap-1.5 text-xs font-semibold text-primary-800">
            <CupSoda size={13} /> Productos por cobrar · {COP.format(totalProductos)}
          </span>
          <ul className="flex flex-col gap-0.5">
            {productosPendientes.map((v) => (
              <li key={v.id} className="flex items-center justify-between gap-2 text-xs text-neutral-600">
                <span className="truncate">
                  {productoNombre(v.productoId)} <span className="text-neutral-400">×{v.cantidad}</span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="font-medium text-neutral-700">{COP.format(v.total)}</span>
                  {onQuitarProducto ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        onQuitarProducto(v)
                      }}
                      title="Quitar producto"
                      className="text-danger-500 transition-colors hover:text-danger-700"
                    >
                      <Trash2 size={13} />
                    </button>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-neutral-100 bg-white/60 px-3 py-2">
        <div className="flex items-center gap-1">
          {onAgregarProducto ? (
            <button
              type="button"
              onClick={onAgregarProducto}
              className="group/btn flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-neutral-600 transition-colors hover:bg-primary-50 hover:text-primary-700"
            >
              <Plus size={14} className="transition-transform group-hover/btn:scale-110" />
              Producto
            </button>
          ) : null}
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
          {onReasignar && !sinAsignar ? (
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
          {onVolverAProceso ? (
            <button
              type="button"
              onClick={onVolverAProceso}
              title="Se marcó Listo por equivocación — vuelve a En proceso"
              className="group/btn flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-neutral-600 transition-colors hover:bg-warning-50 hover:text-warning-700"
            >
              <Undo2 size={14} />
              Volver a proceso
            </button>
          ) : null}
          {onVerTiquete ? (
            <button
              type="button"
              onClick={onVerTiquete}
              className="group/btn flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-neutral-600 transition-colors hover:bg-primary-50 hover:text-primary-700"
            >
              <Receipt size={14} />
              Ver tiquete
            </button>
          ) : null}
        </div>

        <div className="flex items-center gap-2.5">
          <span className="rounded-md bg-success-50 px-2 py-1 text-sm font-bold text-success-700">
            {COP.format(orden.precio)}
          </span>
          {sinAsignar && onReasignar ? (
            <button
              type="button"
              onClick={onReasignar}
              className="flex items-center gap-1.5 rounded-lg bg-danger-600 px-3 py-2 text-xs font-semibold text-white shadow-card transition-all hover:-translate-y-0.5 hover:bg-danger-700 hover:shadow-card-hover"
            >
              <Users size={14} />
              Asignar lavador
            </button>
          ) : null}
          {onFinalizar && !sinAsignar ? (
            <button
              type="button"
              onClick={onFinalizar}
              className="flex items-center gap-1.5 rounded-lg bg-warning-600 px-3 py-2 text-xs font-semibold text-white shadow-card transition-all hover:-translate-y-0.5 hover:bg-warning-700 hover:shadow-card-hover"
            >
              <SprayCan size={14} />
              Finalizar lavado
            </button>
          ) : null}
          {onCobrarDirecto && !sinAsignar ? (
            <button
              type="button"
              onClick={onCobrarDirecto}
              title="El cliente espera en sala — finaliza el lavado y cobra en un solo paso"
              className="flex items-center gap-1.5 rounded-lg bg-success-600 px-3 py-2 text-xs font-semibold text-white shadow-nav-active transition-all hover:-translate-y-0.5 hover:bg-success-700 hover:shadow-card-hover"
            >
              <Banknote size={14} />
              Finalizar y cobrar
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

// Tabla de servicios entregados hoy (M3) — mismo criterio visual que /admin/órdenes, para
// poder reabrir/reimprimir el tiquete de cualquier orden ya terminada sin salir del dashboard.
function EntregadosHoyTable({
  entregadasHoy,
  comboNombre,
  lavadorNombre,
  tipoNombre,
  onVerTiquete,
}: {
  entregadasHoy: Orden[]
  comboNombre: (id: string | undefined) => string
  lavadorNombre: (id: string | undefined) => string
  tipoNombre: (id: string) => string
  onVerTiquete: (orden: Orden) => void
}) {
  const ordenadas = [...entregadasHoy].sort((a, b) => b.consecutivo - a.consecutivo)
  return (
    <Card className="p-0">
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
              <td className="px-5 py-3 font-medium text-neutral-900">{COP.format(orden.precio)}</td>
              <td className="px-5 py-3 capitalize text-neutral-700">{orden.metodoPago ?? '—'}</td>
              <td className="px-5 py-3">
                <div className="flex justify-end">
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
    </Card>
  )
}

const ESTADO_DETALLE_LABEL: Record<Orden['estado'], string> = {
  en_proceso: 'En proceso',
  listo: 'Listo para cobrar',
  entregado: 'Entregado',
  anulada: 'Anulada',
}

// Vista completa de una orden al tocar su tarjeta en el tablero de seguimiento — incluye
// observaciones (no se mostraban en ningún lado antes) y todos los datos de contacto/servicio.
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
  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-neutral-900/40 p-4 backdrop-blur-[2px]">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-card-hover">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="flex items-center gap-2 text-base font-semibold text-neutral-900">
              <span className="font-mono">{orden.placa}</span>
              <span className="text-xs font-normal text-neutral-400">#{orden.consecutivo}</span>
            </h3>
            <span
              className={`mt-1 inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                orden.estado === 'en_proceso' ? 'bg-warning-50 text-warning-700' : 'bg-primary-50 text-primary-700'
              }`}
            >
              {ESTADO_DETALLE_LABEL[orden.estado]}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex size-8 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-neutral-100"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex flex-col gap-4 text-sm">
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-400">Cliente</p>
            <div className="flex flex-col gap-1 rounded-lg bg-neutral-50 p-3">
              <DetalleFila label="Nombre" valor={orden.clienteNombre} />
              <DetalleFila label="Teléfono" valor={orden.clienteTelefono ?? 'Sin registrar'} />
              <DetalleFila label="Correo" valor={orden.clienteCorreo ?? 'Sin registrar'} />
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-400">Servicio</p>
            <div className="flex flex-col gap-1 rounded-lg bg-neutral-50 p-3">
              <DetalleFila label="Tipo de vehículo" valor={tipoVehiculoNombre} />
              <DetalleFila label="Combo" valor={comboNombre} />
              {orden.serviciosAdicionales.length > 0 ? (
                <DetalleFila label="Adicionales" valor={orden.serviciosAdicionales.map((s) => s.nombre).join(', ')} />
              ) : null}
              <DetalleFila label={lavadorNombre2 ? 'Lavadores' : 'Lavador'} valor={lavadorNombre2 ? `${lavadorNombre} + ${lavadorNombre2}` : lavadorNombre} />
              <DetalleFila label="Precio" valor={COP.format(orden.precio)} />
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-400">Observaciones</p>
            <p
              className={`rounded-lg p-3 ${
                orden.observaciones ? 'bg-warning-50 text-warning-900' : 'bg-neutral-50 text-neutral-400 italic'
              }`}
            >
              {orden.observaciones ?? 'Sin observaciones.'}
            </p>
          </div>
        </div>

        <div className="mt-5 flex gap-2 border-t border-neutral-100 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg px-4 py-2.5 text-sm font-medium text-neutral-600 transition-colors hover:bg-neutral-100"
          >
            Cerrar
          </button>
          <button
            type="button"
            onClick={onVerTiquete}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white shadow-nav-active transition-colors hover:bg-primary-700"
          >
            <Receipt size={15} />
            Ver tiquete
          </button>
        </div>
      </div>
    </div>
  )
}

function DetalleFila({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="shrink-0 text-neutral-500">{label}</span>
      <span className="min-w-0 truncate text-right font-medium text-neutral-900">{valor}</span>
    </div>
  )
}

const SIN_ASIGNAR = '__sin_asignar__'

const SIN_SEGUNDO = '__sin_segundo__'

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
  const [lavadorId2, setLavadorId2] = useState(orden.lavadorId2 ?? SIN_SEGUNDO)
  const [saving, setSaving] = useState(false)

  async function handleConfirmar() {
    const nuevoPrincipal = lavadorId === SIN_ASIGNAR ? null : lavadorId
    const nuevoSegundo = lavadorId2 === SIN_SEGUNDO ? null : lavadorId2
    const cambioPrincipal = lavadorId && nuevoPrincipal !== (orden.lavadorId ?? null)
    const cambioSegundo = nuevoSegundo !== (orden.lavadorId2 ?? null)
    if (!lavadorId || (!cambioPrincipal && !cambioSegundo)) {
      onClose()
      return
    }
    setSaving(true)
    try {
      if (cambioPrincipal) await reasignarLavador(orden.id, nuevoPrincipal, 1)
      if (cambioSegundo) await reasignarLavador(orden.id, nuevoSegundo, 2)
      await onReasignado()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-neutral-900/40 p-4 backdrop-blur-[2px]">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-card-hover">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-neutral-900">
            {esAsignacion ? 'Asignar lavador' : 'Reasignar lavador'}
          </h3>
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
            <span className="font-medium text-neutral-700">Lavador</span>
            <CustomSelect
              size="sm"
              value={lavadorId}
              onChange={setLavadorId}
              placeholder="Selecciona…"
              options={[
                ...(esAsignacion ? [] : [{ value: SIN_ASIGNAR, label: 'Sin asignar' }]),
                ...lavadores.map((l) => ({ value: l.id, label: l.nombre })),
              ]}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-neutral-700">
              Segundo lavador <span className="font-normal text-neutral-400">(lavar entre 2, opcional)</span>
            </span>
            <CustomSelect
              size="sm"
              value={lavadorId2}
              onChange={setLavadorId2}
              placeholder="Ninguno…"
              options={[
                { value: SIN_SEGUNDO, label: 'Ninguno' },
                ...lavadores.filter((l) => l.id !== lavadorId).map((l) => ({ value: l.id, label: l.nombre })),
              ]}
            />
          </label>
        </div>
        <button
          type="button"
          onClick={handleConfirmar}
          disabled={saving || !lavadorId}
          className="mt-5 w-full rounded-lg bg-primary-600 py-2.5 text-sm font-semibold text-white shadow-nav-active transition-colors hover:bg-primary-700 disabled:opacity-60"
        >
          {saving ? 'Guardando…' : esAsignacion ? 'Confirmar asignación' : 'Guardar cambios'}
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
  const [placa, setPlaca] = useState(orden.placa)
  const [clienteNombre, setClienteNombre] = useState(orden.clienteNombre)
  const [clienteTelefono, setClienteTelefono] = useState(orden.clienteTelefono ?? '')
  const [clienteCorreo, setClienteCorreo] = useState(orden.clienteCorreo ?? '')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
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
            <span className="font-medium text-neutral-700">Placa</span>
            <input
              value={placa}
              onChange={(event) =>
                setPlaca(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))
              }
              maxLength={6}
              className="rounded-lg border border-neutral-300 px-3 py-2.5 font-mono text-sm outline-none transition-colors focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
            />
          </label>
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
  finalizarPrimero,
  productosPendientes,
  productoNombre,
  onClose,
  onCobrado,
}: {
  orden: Orden
  /** Orden todavía en_proceso (cliente esperando en sala) — marca el lavado terminado antes de
   * cobrar, en el mismo submit, para no obligar a pasar primero por "Listo para cobrar". */
  finalizarPrimero?: boolean
  /** Productos de nevera cargados a la orden — se cobran en la misma factura. */
  productosPendientes: Venta[]
  productoNombre: (id: string) => string
  onClose: () => void
  onCobrado: (metodoPago: MetodoPago, referenciaPago?: string) => void
}) {
  const [metodoPago, setMetodoPago] = useState<MetodoPago>('efectivo')
  const [referenciaPago, setReferenciaPago] = useState('')
  // Solo ayuda visual para el cajero (cuánto devolver) — no es parte de `cobroInputSchema`, no
  // se persiste en la orden.
  const [montoRecibido, setMontoRecibido] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const totalProductos = productosPendientes.reduce((suma, v) => suma + v.total, 0)
  const totalCobro = orden.precio + totalProductos
  const cambio = montoRecibido ? Number(montoRecibido) - totalCobro : undefined

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
      if (finalizarPrimero) {
        await marcarListo(orden.id)
      }
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
            {finalizarPrimero ? (
              <p className="mt-1 text-xs font-medium text-primary-700">
                También marca el lavado como terminado — cliente esperando en sala.
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex size-8 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-neutral-100"
          >
            <X size={18} />
          </button>
        </div>

        <div className="mb-4 flex flex-col gap-1 rounded-lg bg-primary-50 px-3 py-2.5 text-sm">
          {productosPendientes.length > 0 ? (
            <>
              <div className="flex items-center justify-between text-primary-900">
                <span>Lavado</span>
                <span>{COP.format(orden.precio)}</span>
              </div>
              {productosPendientes.map((v) => (
                <div key={v.id} className="flex items-center justify-between text-xs text-primary-800">
                  <span className="truncate">
                    {productoNombre(v.productoId)} ×{v.cantidad}
                  </span>
                  <span>{COP.format(v.total)}</span>
                </div>
              ))}
              <div className="mt-1 flex items-center justify-between border-t border-primary-200 pt-1.5 font-semibold text-primary-900">
                <span>Total a cobrar</span>
                <span>{COP.format(totalCobro)}</span>
              </div>
            </>
          ) : (
            <div className="flex items-center justify-between">
              <span className="font-medium text-primary-900">Total a cobrar</span>
              <span className="font-semibold text-primary-900">{COP.format(totalCobro)}</span>
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-neutral-700">Método de pago</span>
            <div className="grid grid-cols-3 gap-2">
              {(['efectivo', 'transferencia', 'datafono'] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setMetodoPago(value)}
                  className={`rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors ${
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

          {metodoPago === 'transferencia' || metodoPago === 'datafono' ? (
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

          {metodoPago === 'efectivo' ? (
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-neutral-700">Con cuánto paga</span>
              <CurrencyInput value={montoRecibido} onChange={setMontoRecibido} placeholder="0" />
              {cambio !== undefined ? (
                <span className={`text-xs font-medium ${cambio < 0 ? 'text-danger-600' : 'text-neutral-500'}`}>
                  {cambio < 0
                    ? `Falta ${COP.format(Math.abs(cambio))}`
                    : `Devolver ${COP.format(cambio)}`}
                </span>
              ) : null}
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

// Cargar productos de nevera a un vehículo en espera — se acumulan como 'pendiente' y se cobran
// junto con el lavado al entregar. Hoja anclada abajo en móvil (mismo patrón que CobroModal),
// grilla de productos como botones grandes + carrito con steppers.
function AgregarProductoModal({
  orden,
  productos,
  stockPorProducto,
  onClose,
  onAgregar,
}: {
  orden: Orden
  productos: Producto[]
  stockPorProducto: Map<string, number>
  onClose: () => void
  onAgregar: (orden: Orden, productoId: string, cantidad: number) => Promise<void>
}) {
  const [carrito, setCarrito] = useState<Map<string, number>>(new Map())
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  function setCantidad(productoId: string, cantidad: number) {
    setCarrito((prev) => {
      const siguiente = new Map(prev)
      if (cantidad <= 0) siguiente.delete(productoId)
      else siguiente.set(productoId, cantidad)
      return siguiente
    })
  }

  const lineas = [...carrito.entries()]
  const total = lineas.reduce((suma, [id, cant]) => {
    const p = productos.find((x) => x.id === id)
    return suma + (p?.precioVenta ?? 0) * cant
  }, 0)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (lineas.length === 0) return
    setError(null)
    setSaving(true)
    try {
      for (const [productoId, cantidad] of lineas) {
        await onAgregar(orden, productoId, cantidad)
      }
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo agregar el producto')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center bg-neutral-900/40 backdrop-blur-[2px] sm:items-center sm:p-4">
      <div className="flex max-h-[90vh] w-full max-w-sm flex-col rounded-t-2xl bg-white p-5 shadow-card-hover sm:rounded-2xl sm:p-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-neutral-900">Agregar productos</h3>
            <p className="text-xs text-neutral-500">
              {orden.placa} · #{orden.consecutivo} — se cobran al entregar
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

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-col gap-4">
          <div className="grid min-h-0 grid-cols-2 gap-2 overflow-y-auto">
            {productos.map((p) => {
              const stock = stockPorProducto.get(p.id) ?? 0
              const cant = carrito.get(p.id) ?? 0
              const agotado = stock <= 0
              return (
                <div
                  key={p.id}
                  className={`flex flex-col gap-1.5 rounded-lg border p-2.5 text-left transition-colors ${
                    cant > 0 ? 'border-primary-500 bg-primary-50' : 'border-neutral-200'
                  } ${agotado ? 'opacity-50' : ''}`}
                >
                  <button
                    type="button"
                    disabled={agotado}
                    onClick={() => setCantidad(p.id, cant + 1)}
                    className="text-left disabled:cursor-not-allowed"
                  >
                    <span className="block text-sm font-medium text-neutral-800">{p.nombre}</span>
                    <span className="block text-xs text-neutral-500">
                      {COP.format(p.precioVenta ?? 0)} · stock {stock}
                    </span>
                  </button>
                  {cant > 0 ? (
                    <div className="flex items-center justify-between rounded-md bg-white px-1 py-0.5">
                      <button
                        type="button"
                        onClick={() => setCantidad(p.id, cant - 1)}
                        className="flex size-6 items-center justify-center rounded text-neutral-600 hover:bg-neutral-100"
                      >
                        <Minus size={13} />
                      </button>
                      <span className="text-sm font-semibold text-neutral-900">{cant}</span>
                      <button
                        type="button"
                        onClick={() => setCantidad(p.id, cant + 1)}
                        className="flex size-6 items-center justify-center rounded text-neutral-600 hover:bg-neutral-100"
                      >
                        <Plus size={13} />
                      </button>
                    </div>
                  ) : null}
                </div>
              )
            })}
            {productos.length === 0 ? (
              <p className="col-span-2 py-6 text-center text-xs text-neutral-400">
                No hay productos con precio de venta configurado.
              </p>
            ) : null}
          </div>

          {error ? <p className="text-xs text-danger-600">{error}</p> : null}

          <button
            type="submit"
            disabled={saving || lineas.length === 0}
            className="flex items-center justify-center gap-2 rounded-lg bg-primary-600 py-3 text-sm font-semibold text-white shadow-nav-active transition-colors hover:bg-primary-700 disabled:opacity-60"
          >
            <Plus size={16} />
            {saving
              ? 'Agregando…'
              : lineas.length === 0
                ? 'Elige productos'
                : `Agregar ${lineas.reduce((s, [, c]) => s + c, 0)} · ${COP.format(total)}`}
          </button>
        </form>
      </div>
    </div>
  )
}

// Quitar un producto ya cargado a una orden antes de cobrar (regla de negocio 13: se anula con
// motivo, no se borra — queda visible en reportes). Como nunca descontó stock, no hay reverso.
function QuitarProductoModal({
  venta,
  productoNombre,
  onClose,
  onQuitar,
}: {
  venta: Venta
  productoNombre: string
  onClose: () => void
  onQuitar: (venta: Venta, motivo: string) => Promise<void>
}) {
  const [motivo, setMotivo] = useState('Quitado antes de cobrar')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const parsed = anularVentaInputSchema.pick({ motivo: true }).safeParse({ motivo })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Indica un motivo')
      return
    }
    setError(null)
    setSaving(true)
    try {
      await onQuitar(venta, parsed.data.motivo)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo quitar el producto')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-neutral-900/40 p-4 backdrop-blur-[2px]">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-card-hover">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-neutral-900">
            Quitar {productoNombre} ×{venta.cantidad}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="flex size-8 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-neutral-100"
          >
            <X size={18} />
          </button>
        </div>
        <p className="mb-4 text-xs text-neutral-500">
          Queda anulado con el motivo, visible en reportes (control antifraude). No afecta el stock.
        </p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-neutral-700">Motivo</span>
            <textarea
              autoFocus
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={2}
              className="resize-none rounded-lg border border-neutral-300 px-3 py-2.5 text-sm outline-none transition-colors focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
            />
          </label>
          {error ? <p className="text-xs text-danger-600">{error}</p> : null}
          <div className="flex justify-end gap-2 border-t border-neutral-100 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm font-medium text-neutral-600 transition-colors hover:bg-neutral-100"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-danger-600 px-4 py-2 text-sm font-medium text-white shadow-nav-active transition-colors hover:bg-danger-700 disabled:opacity-60"
            >
              {saving ? 'Quitando…' : 'Quitar producto'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
