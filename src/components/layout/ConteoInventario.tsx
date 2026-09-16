import { useMemo, useRef, useState } from 'react'
import { Minus, Plus, PackageCheck, RotateCcw, ChevronDown, CheckCircle2, Repeat, AlertTriangle, ClipboardCheck } from 'lucide-react'
import { abrirConteoInventario, cerrarConteoInventario, previewConteo } from '../../data/conteosInventario'
import type { ConteoLineaInput, MomentoConteo, PendienteCobro, PreviewLineaConteo } from '../../schemas/conteoInventario'
import { SECCION_PRODUCTO_LABEL, type Producto } from '../../schemas/producto'
import { agruparPorSeccion } from '../../lib/seccionProductos'
import type { TurnoCaja } from '../../schemas/turnoCaja'
import { PantallaTarea, BotonPrincipal } from './PantallaTarea'
import { toast } from '../../lib/toast'

interface ConteoInventarioProps {
  turno: TurnoCaja
  momento: MomentoConteo
  /** Hora del servidor en que se abrió el conteo (`marcaConteo`) — lo que se mueva después se reconta. */
  marcaInicial: string
  /** Productos vendibles (nevera/vitrina) — se filtran acá a `activo` con precio de venta. */
  productos: Producto[]
  /** Cuentas abiertas y órdenes con productos sin cobrar — en cierre y traspaso se confirman una
   *  por una antes de contar (0068). En apertura se ignora. */
  pendientes?: PendienteCobro[]
  /** Solo traspaso: a quién se le entrega el turno (texto) y cómo se registra (RPC `traspasar_turno`). */
  entregaA?: string
  onRegistrarTraspaso?: (conteo: {
    lineas: ConteoLineaInput[]
    justificacion: string | undefined
    desde: string
    confirmados: string[]
  }) => Promise<void>
  onVolver: () => void
  onConfirmado: () => void | Promise<void>
  /** Se llama justo antes de `onConfirmado`, con si el conteo quedó cuadrado — el checklist del
   *  turno lo usa para el resumen de cierre sin tener que releer nada. */
  onResultado?: (info: { cuadrado: boolean; totalFaltante: number }) => void
}

type Fase = 'confirmar' | 'contando' | 'reconteo' | 'resultado'

const COP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })

// Conteo de inventario en tres fases (0048, rehecho en 0068 tras la auditoría de falsos positivos):
//   1. Contar a ciegas todo.
//   2. Reconteo a ciegas SOLO de lo que no cuadró o se movió mientras se contaba — se dice qué
//      productos, nunca cuánto ni para qué lado. Si dos productos de la misma sección descuadran en
//      sentidos opuestos se avisa que pueden estar cruzados (el caso Club 269 / Club 330). El
//      faltante solo nace si el reconteo lo sostiene.
//   3. Resultado con el desglose del esperado (último conteo − vendido + entradas ± otros), para
//      que quien cuenta vea de dónde sale el número.
//
// Contar es tarea de dedo: contador grande −/+ por producto, número editable a mano. Vacío ≠ 0.
export function ConteoInventario({
  turno,
  momento,
  marcaInicial,
  productos,
  pendientes = [],
  entregaA,
  onRegistrarTraspaso,
  onVolver,
  onConfirmado,
  onResultado,
}: ConteoInventarioProps) {
  const esApertura = momento === 'apertura'
  const esTraspaso = momento === 'traspaso'
  // En apertura no se confirma nada: quien recibe no responde por lo que se cargó antes.
  const porConfirmar = esApertura ? [] : pendientes
  const vendibles = useMemo(
    () => productos.filter((p) => p.activo && p.precioVenta != null).sort((a, b) => a.nombre.localeCompare(b.nombre)),
    [productos],
  )
  const grupos = useMemo(() => agruparPorSeccion(vendibles), [vendibles])

  const seccionLabelDe = (productoId: string) => {
    const p = vendibles.find((v) => v.id === productoId)
    if (!p) return 'Sin sección'
    return p.seccion ? SECCION_PRODUCTO_LABEL[p.seccion] : 'Sin sección'
  }

  const [fase, setFase] = useState<Fase>(porConfirmar.length > 0 ? 'confirmar' : 'contando')
  const [confirmados, setConfirmados] = useState<Set<string>>(new Set())
  const [marca, setMarca] = useState(marcaInicial)
  const [conteos, setConteos] = useState<Record<string, number>>({})
  const [reconteos, setReconteos] = useState<Record<string, number>>({})
  const [aRecontar, setARecontar] = useState<string[]>([])
  const [cruces, setCruces] = useState<[string, string][]>([])
  const [avisoMovidos, setAvisoMovidos] = useState<string[]>([])
  const [preview, setPreview] = useState<PreviewLineaConteo[] | null>(null)
  const [motivos, setMotivos] = useState<Record<string, string>>({})
  const [justificacion, setJustificacion] = useState('')
  const [revisado, setRevisado] = useState(false)
  const [verCuadrados, setVerCuadrados] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const enVueloRef = useRef(false)

  const contados = vendibles.filter((p) => conteos[p.id] !== undefined).length
  const faltanPorContar = vendibles.length - contados
  const recontados = aRecontar.filter((id) => reconteos[id] !== undefined).length

  const nombreDe = (id: string) => vendibles.find((v) => v.id === id)?.nombre ?? 'Producto'
  const contadoFinal = (id: string) => reconteos[id] ?? conteos[id] ?? 0

  const filas = useMemo(() => {
    if (!preview) return []
    return preview.map((p) => {
      const contado = reconteos[p.productoId] ?? conteos[p.productoId] ?? 0
      const contadoInicial = reconteos[p.productoId] !== undefined ? conteos[p.productoId] : undefined
      return { ...p, contado, contadoInicial, diferencia: contado - p.esperado }
    })
  }, [preview, conteos, reconteos])

  const cuadrados = filas.filter((f) => f.diferencia === 0)
  const descuadrados = filas.filter((f) => f.diferencia !== 0)
  const hayDiferencia = descuadrados.length > 0
  const totalFaltante = descuadrados.filter((f) => f.diferencia < 0).reduce((s, f) => s + Math.abs(f.diferencia), 0)

  const gruposDescuadrados = (['Bebidas', 'Snacks', 'Sin sección'] as const)
    .map((label) => ({ label, filas: descuadrados.filter((f) => seccionLabelDe(f.productoId) === label) }))
    .filter((g) => g.filas.length > 0)

  function ajustar(setter: typeof setConteos, id: string, delta: number) {
    setter((prev) => {
      const actual = prev[id]
      const base = actual === undefined ? 0 : actual
      return { ...prev, [id]: Math.max(0, base + delta) }
    })
  }

  function escribir(setter: typeof setConteos, id: string, valor: string) {
    const limpio = valor.replace(/\D/g, '')
    setter((prev) => {
      if (limpio === '') {
        const siguiente = { ...prev }
        delete siguiente[id]
        return siguiente
      }
      return { ...prev, [id]: Number(limpio) }
    })
  }

  // Fase 1 → 2 (o directo a 3 si todo cuadra y nada se movió).
  async function handleRevelar() {
    setError(null)
    if (faltanPorContar > 0) {
      setError(`Falta contar ${faltanPorContar} producto${faltanPorContar === 1 ? '' : 's'}.`)
      return
    }
    setLoading(true)
    try {
      const datos = await previewConteo(turno.id, momento, marca)
      const movidos = datos.filter((d) => d.movido).map((d) => d.productoId)
      const distintos = datos.filter((d) => !d.movido && (conteos[d.productoId] ?? 0) !== d.esperado)

      if (movidos.length === 0 && distintos.length === 0) {
        setPreview(datos)
        setRevisado(false)
        setFase('resultado')
        return
      }

      // Posibles cruces: misma sección, uno sobra y otro falta. Solo nombres, sin cantidades.
      const pares: [string, string][] = []
      const sobran = distintos.filter((d) => (conteos[d.productoId] ?? 0) > d.esperado)
      const faltan = distintos.filter((d) => (conteos[d.productoId] ?? 0) < d.esperado)
      for (const s of sobran) {
        const par = faltan.find((f) => seccionLabelDe(f.productoId) === seccionLabelDe(s.productoId))
        if (par) pares.push([s.nombre, par.nombre])
      }

      setCruces(pares)
      setAvisoMovidos(movidos)
      setARecontar([...movidos, ...distintos.map((d) => d.productoId)])
      setReconteos({})
      setMarca(datos[0]?.marca ?? marca)
      setFase('reconteo')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo calcular el esperado')
      toast.desdeError(err, 'No se pudo calcular el esperado')
    } finally {
      setLoading(false)
    }
  }

  // Fase 2 → 3. Si algo se volvió a mover mientras se recontaba, se reconta solo eso.
  async function handleVerResultado() {
    setError(null)
    if (recontados < aRecontar.length) {
      const faltan = aRecontar.length - recontados
      setError(`Falta recontar ${faltan} producto${faltan === 1 ? '' : 's'}.`)
      return
    }
    setLoading(true)
    try {
      const datos = await previewConteo(turno.id, momento, marca)
      const movidos = datos.filter((d) => d.movido).map((d) => d.productoId)
      if (movidos.length > 0) {
        setAvisoMovidos(movidos)
        setCruces([])
        setARecontar(movidos)
        setReconteos((prev) => {
          const siguiente = { ...prev }
          for (const id of movidos) delete siguiente[id]
          return siguiente
        })
        setMarca(datos[0]?.marca ?? marca)
        return
      }
      setPreview(datos)
      setRevisado(false)
      setFase('resultado')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo calcular el esperado')
      toast.desdeError(err, 'No se pudo calcular el esperado')
    } finally {
      setLoading(false)
    }
  }

  function volverAContar() {
    setFase('contando')
    setReconteos({})
    setARecontar([])
    setCruces([])
    setAvisoMovidos([])
    setPreview(null)
    setError(null)
  }

  async function handleConfirmar() {
    if (enVueloRef.current) return
    setError(null)
    if (hayDiferencia && !justificacion.trim()) {
      setError('Hay diferencias — la justificación es obligatoria')
      return
    }
    if (hayDiferencia && !revisado) {
      setError('Marca que ya revisaste y buscaste antes de registrar la diferencia')
      return
    }

    const lineas = filas.map((f) => ({
      productoId: f.productoId,
      contado: f.contado,
      contadoInicial: f.contadoInicial,
      motivo: motivos[f.productoId]?.trim() || undefined,
    }))

    enVueloRef.current = true
    setLoading(true)
    try {
      const just = justificacion.trim() || undefined
      const idsConfirmados = porConfirmar.map((p) => p.id)
      if (esApertura) {
        await abrirConteoInventario(turno.id, lineas, just, marca)
      } else if (esTraspaso) {
        if (!onRegistrarTraspaso) throw new Error('Falta cómo registrar el traspaso')
        await onRegistrarTraspaso({ lineas, justificacion: just, desde: marca, confirmados: idsConfirmados })
      } else {
        await cerrarConteoInventario(turno.id, lineas, just, marca, idsConfirmados)
      }
      onResultado?.({ cuadrado: !hayDiferencia, totalFaltante })
      await onConfirmado()
      toast.exito(
        esApertura
          ? 'Conteo de apertura registrado'
          : esTraspaso
            ? 'Traspaso solicitado — pendiente hasta que la otra cuenta lo acepte'
            : 'Conteo de cierre registrado',
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar el conteo')
      toast.desdeError(err, 'No se pudo registrar el conteo')
    } finally {
      enVueloRef.current = false
      setLoading(false)
    }
  }

  const titulo = esApertura ? 'Conteo de apertura' : esTraspaso ? 'Conteo de traspaso' : 'Conteo de cierre'
  const subtituloContar = esApertura
    ? 'Cuenta lo que hay antes de arrancar'
    : esTraspaso
      ? `Cuenta lo que hay antes de entregarle el turno a ${entregaA ?? 'quien recibe'}`
      : 'Cuenta lo que queda antes de cerrar'

  // ── Fase 0: confirmar cuentas y órdenes con productos sin cobrar ─────────────────────────────
  if (fase === 'confirmar') {
    const todos = porConfirmar.every((p) => confirmados.has(p.id))
    return (
      <PantallaTarea
        titulo={titulo}
        subtitulo="Antes de contar: lo que salió de la nevera y no se ha pagado"
        onVolver={onVolver}
        pie={
          <>
            {error ? <p className="text-center text-xs text-danger-600">{error}</p> : null}
            <BotonPrincipal
              onClick={() => {
                if (!todos) {
                  setError('Confirma cada cuenta u orden — si alguna no es real, ciérrala o anúlala en Ventas primero')
                  return
                }
                setError(null)
                setFase('contando')
              }}
            >
              <ClipboardCheck size={16} />
              Continuar al conteo
            </BotonPrincipal>
          </>
        }
      >
        <div className="flex items-start gap-2.5 rounded-xl border border-primary-200 bg-primary-50 p-3 text-sm text-primary-800">
          <ClipboardCheck size={16} className="mt-0.5 shrink-0" />
          <p>
            Estos productos ya no están en la nevera y el sistema los descuenta del conteo. Confirma que cada uno es real:
            la persona o el vehículo sí los tiene y los debe. Si alguno ya pagó o no existe, ciérralo o anúlalo en Ventas
            antes de seguir.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          {porConfirmar.map((p) => {
            const hecho = confirmados.has(p.id)
            const dias = Math.floor((Date.parse(marca) - Date.parse(p.desde)) / 86_400_000)
            return (
              <label
                key={p.id}
                className={`flex cursor-pointer items-start gap-3 rounded-xl border bg-white px-4 py-3 transition-colors ${
                  hecho ? 'border-success-600/30 bg-success-50/40' : 'border-neutral-200 hover:bg-neutral-50'
                }`}
              >
                <input
                  type="checkbox"
                  checked={hecho}
                  onChange={(e) =>
                    setConfirmados((prev) => {
                      const siguiente = new Set(prev)
                      if (e.target.checked) siguiente.add(p.id)
                      else siguiente.delete(p.id)
                      return siguiente
                    })
                  }
                  className="mt-1 size-5 shrink-0 rounded border-neutral-300 text-primary-600 focus:ring-primary-500"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-semibold text-neutral-900">
                      {p.tipo === 'cuenta' ? `Cuenta · ${p.titulo}` : p.titulo}
                    </p>
                    <span className="shrink-0 text-sm font-semibold text-neutral-700">{COP.format(p.total)}</span>
                  </div>
                  <p className="text-xs text-neutral-500">{p.detalle}</p>
                  <p className={`text-xs ${dias >= 1 ? 'font-medium text-warning-700' : 'text-neutral-400'}`}>
                    {dias >= 1
                      ? `Abierta hace ${dias} día${dias === 1 ? '' : 's'}`
                      : `Desde las ${new Date(p.desde).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}`}
                  </p>
                </div>
              </label>
            )
          })}
        </div>
      </PantallaTarea>
    )
  }

  // ── Fase 1: contar (ciego) ──────────────────────────────────────────────────────────────────
  if (fase === 'contando') {
    return (
      <PantallaTarea
        titulo={titulo}
        subtitulo={subtituloContar}
        onVolver={onVolver}
        pie={
          <>
            {error ? <p className="text-center text-xs text-danger-600">{error}</p> : null}
            <BotonPrincipal onClick={handleRevelar} disabled={loading || vendibles.length === 0}>
              {loading ? 'Revisando…' : 'Terminé de contar'}
            </BotonPrincipal>
          </>
        }
      >
        <Progreso
          hechos={contados}
          total={vendibles.length}
          etiqueta="Contados"
          ayuda="Nevera y bodega. No verás el esperado hasta terminar — es a ciegas."
        />

        <div className="flex flex-col gap-4">
          {grupos.map((g) => (
            <div key={g.key} className="flex flex-col gap-2">
              <p className="px-1 text-xs font-semibold uppercase tracking-wide text-neutral-400">
                {g.label}
                <span className="ml-1.5 font-normal normal-case text-neutral-300">{g.productos.length}</span>
              </p>
              {g.productos.map((p) => (
                <FilaContador
                  key={p.id}
                  nombre={p.nombre}
                  detalle={p.unidadMedida}
                  valor={conteos[p.id]}
                  onAjustar={(delta) => ajustar(setConteos, p.id, delta)}
                  onEscribir={(v) => escribir(setConteos, p.id, v)}
                />
              ))}
            </div>
          ))}
          {vendibles.length === 0 ? (
            <p className="rounded-xl bg-white py-8 text-center text-sm text-neutral-400 shadow-card">
              No hay productos de nevera/vitrina configurados.
            </p>
          ) : null}
        </div>
      </PantallaTarea>
    )
  }

  // ── Fase 2: reconteo ciego de lo que no cuadró ──────────────────────────────────────────────
  if (fase === 'reconteo') {
    return (
      <PantallaTarea
        titulo={titulo}
        subtitulo={`Vuelve a contar ${aRecontar.length} producto${aRecontar.length === 1 ? '' : 's'}`}
        onVolver={onVolver}
        pie={
          <>
            {error ? <p className="text-center text-xs text-danger-600">{error}</p> : null}
            <BotonPrincipal onClick={handleVerResultado} disabled={loading}>
              {loading ? 'Revisando…' : 'Ver resultado'}
            </BotonPrincipal>
            <button
              type="button"
              onClick={volverAContar}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg py-2.5 text-sm font-medium text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
            >
              <RotateCcw size={15} />
              Empezar el conteo de nuevo
            </button>
          </>
        }
      >
        <div className="flex items-start gap-2.5 rounded-xl border border-primary-200 bg-primary-50 p-3 text-sm text-primary-800">
          <Repeat size={16} className="mt-0.5 shrink-0" />
          <p>
            Estos productos no coinciden con el sistema. Antes de registrar nada, cuéntalos otra vez con calma — nevera
            y bodega.
          </p>
        </div>

        {avisoMovidos.length > 0 ? (
          <div className="flex items-start gap-2.5 rounded-xl border border-warning-600/25 bg-warning-50 p-3 text-sm text-warning-700">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <p>
              Mientras contabas se registró una venta o carga de:{' '}
              <span className="font-medium">{avisoMovidos.map(nombreDe).join(', ')}</span>. Cuéntalos de nuevo.
            </p>
          </div>
        ) : null}

        {cruces.length > 0 ? (
          <div className="flex items-start gap-2.5 rounded-xl border border-warning-600/25 bg-warning-50 p-3 text-sm text-warning-700">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <div className="flex flex-col gap-1">
              <p>Revisa que no estés confundiendo productos parecidos:</p>
              {cruces.map(([a, b]) => (
                <p key={`${a}-${b}`} className="font-medium">
                  {a} ↔ {b}
                </p>
              ))}
            </div>
          </div>
        ) : null}

        <Progreso hechos={recontados} total={aRecontar.length} etiqueta="Recontados" />

        <div className="flex flex-col gap-2">
          {aRecontar.map((id) => (
            <FilaContador
              key={id}
              nombre={nombreDe(id)}
              detalle={seccionLabelDe(id)}
              valor={reconteos[id]}
              onAjustar={(delta) => ajustar(setReconteos, id, delta)}
              onEscribir={(v) => escribir(setReconteos, id, v)}
            />
          ))}
        </div>
      </PantallaTarea>
    )
  }

  // ── Fase 3: resultado (lo que cuadra se colapsa, lo que no pide acción) ─────────────────────
  return (
    <PantallaTarea
      titulo={titulo}
      subtitulo={hayDiferencia ? `${descuadrados.length} producto(s) con diferencia` : 'Todo cuadra'}
      onVolver={onVolver}
      pie={
        <>
          {error ? <p className="text-center text-xs text-danger-600">{error}</p> : null}
          <BotonPrincipal onClick={handleConfirmar} disabled={loading}>
            <PackageCheck size={16} />
            {loading ? 'Registrando…' : esTraspaso ? `Registrar y solicitar traspaso a ${entregaA ?? 'quien recibe'}` : 'Registrar conteo'}
          </BotonPrincipal>
          <button
            type="button"
            onClick={volverAContar}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg py-2.5 text-sm font-medium text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
          >
            <RotateCcw size={15} />
            Volver a contar
          </button>
        </>
      }
    >
      {!hayDiferencia ? (
        <div className="flex flex-col items-center gap-2 rounded-xl bg-success-50 px-4 py-8 text-center">
          <CheckCircle2 size={32} className="text-success-700" />
          <p className="text-base font-semibold text-success-700">Todo cuadra</p>
          <p className="text-xs text-success-700/80">Los {filas.length} productos coinciden con lo esperado.</p>
        </div>
      ) : null}

      {gruposDescuadrados.map((g) => (
        <div key={g.label} className="flex flex-col gap-2.5">
          {gruposDescuadrados.length > 1 ? (
            <p className="px-1 text-xs font-semibold uppercase tracking-wide text-neutral-400">{g.label}</p>
          ) : null}
          {g.filas.map((f) => {
            const falta = f.diferencia < 0
            return (
              <div
                key={f.productoId}
                className={`flex flex-col gap-2.5 rounded-xl border-l-4 bg-white p-4 shadow-card ${
                  falta ? 'border-l-danger-600' : 'border-l-warning-600'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-neutral-900">{f.nombre}</p>
                    <p className="text-xs text-neutral-500">
                      Esperado {f.esperado} · Contaste {f.contado}
                      {f.contadoInicial !== undefined && f.contadoInicial !== f.contado
                        ? ` (primer conteo ${f.contadoInicial})`
                        : ''}
                    </p>
                    <DesgloseEsperado fila={f} />
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${
                      falta ? 'bg-danger-50 text-danger-700' : 'bg-warning-50 text-warning-700'
                    }`}
                  >
                    {falta ? `Faltan ${Math.abs(f.diferencia)}` : `Sobran ${f.diferencia}`}
                  </span>
                </div>
                <input
                  value={motivos[f.productoId] ?? ''}
                  onChange={(e) => setMotivos((prev) => ({ ...prev, [f.productoId]: e.target.value }))}
                  placeholder="Nota para este producto (opcional)"
                  className="rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none transition-colors focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
                />
              </div>
            )
          })}
        </div>
      ))}

      {cuadrados.length > 0 ? (
        <div className="overflow-hidden rounded-xl bg-white shadow-card">
          <button
            type="button"
            onClick={() => setVerCuadrados((v) => !v)}
            className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-neutral-50"
          >
            <span className="flex items-center gap-2 text-sm font-medium text-success-700">
              <CheckCircle2 size={16} />
              {cuadrados.length} producto{cuadrados.length === 1 ? '' : 's'} cuadrado
              {cuadrados.length === 1 ? '' : 's'}
            </span>
            <ChevronDown
              size={16}
              className={`shrink-0 text-neutral-400 transition-transform ${verCuadrados ? 'rotate-180' : ''}`}
            />
          </button>
          {verCuadrados ? (
            <ul className="flex flex-col divide-y divide-neutral-100 border-t border-neutral-100">
              {cuadrados.map((f) => (
                <li key={f.productoId} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                  <span className="truncate text-neutral-700">{f.nombre}</span>
                  <span className="shrink-0 font-medium text-neutral-500">{contadoFinal(f.productoId)}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {hayDiferencia ? (
        <div className="flex flex-col gap-3 rounded-xl bg-white p-4 shadow-card">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-neutral-700">Justificación (obligatoria)</span>
            <textarea
              value={justificacion}
              onChange={(e) => setJustificacion(e.target.value)}
              rows={2}
              placeholder="Qué pasó con el faltante / sobrante"
              className="rounded-lg border border-neutral-300 px-3 py-2.5 text-base outline-none transition-colors focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
            />
          </label>
          <label className="flex items-start gap-2 text-xs text-neutral-600">
            <input
              type="checkbox"
              checked={revisado}
              onChange={(e) => setRevisado(e.target.checked)}
              className="mt-0.5 size-4 shrink-0 rounded border-neutral-300 text-primary-600 focus:ring-primary-500"
            />
            Ya reconté y busqué antes de registrar la diferencia
          </label>
          {totalFaltante > 0 ? (
            <p className="rounded-lg bg-neutral-50 px-3 py-2 text-xs text-neutral-500">
              {esApertura
                ? `Las ${totalFaltante} unidad(es) que faltan se perdieron entre turnos: quedan registradas sin responsable para que gerencia las revise.`
                : `Las ${totalFaltante} unidad(es) que faltan quedan registradas a nombre de ${turno.responsableActual}${
                    esTraspaso ? ' (quien entrega)' : ''
                  } para revisar. No se cobran ahora.`}
            </p>
          ) : null}
        </div>
      ) : null}
    </PantallaTarea>
  )
}

// ─────────────────────────────────────────────────────────────────────────────────────────────

function Progreso({ hechos, total, etiqueta, ayuda }: { hechos: number; total: number; etiqueta: string; ayuda?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-white px-4 py-3 shadow-card">
      <div>
        <p className="text-sm font-semibold text-neutral-900">
          {etiqueta} {hechos} de {total}
        </p>
        {ayuda ? <p className="text-xs text-neutral-500">{ayuda}</p> : null}
      </div>
      <div className="h-1.5 w-20 shrink-0 overflow-hidden rounded-full bg-neutral-100">
        <div
          className="h-full rounded-full bg-primary-600 transition-all"
          style={{ width: `${total === 0 ? 0 : (hechos / total) * 100}%` }}
        />
      </div>
    </div>
  )
}

function FilaContador({
  nombre,
  detalle,
  valor,
  onAjustar,
  onEscribir,
}: {
  nombre: string
  detalle: string
  valor: number | undefined
  onAjustar: (delta: number) => void
  onEscribir: (valor: string) => void
}) {
  const sinContar = valor === undefined
  return (
    <div
      className={`flex items-center justify-between gap-3 rounded-xl border bg-white px-4 py-3 transition-colors ${
        sinContar ? 'border-neutral-200' : 'border-primary-200 bg-primary-50/30'
      }`}
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-neutral-900">{nombre}</p>
        <p className="text-xs text-neutral-400">{detalle}</p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          onClick={() => onAjustar(-1)}
          aria-label={`Restar a ${nombre}`}
          className="flex size-10 items-center justify-center rounded-lg border border-neutral-200 text-neutral-600 transition-colors hover:bg-neutral-50 active:bg-neutral-100"
        >
          <Minus size={18} />
        </button>
        <input
          inputMode="numeric"
          value={valor ?? ''}
          onChange={(e) => onEscribir(e.target.value)}
          placeholder="—"
          aria-label={`Cantidad de ${nombre}`}
          className="w-14 rounded-lg border border-neutral-200 py-2 text-center text-lg font-semibold text-neutral-900 outline-none transition-colors placeholder:font-normal placeholder:text-neutral-300 focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
        />
        <button
          type="button"
          onClick={() => onAjustar(1)}
          aria-label={`Sumar a ${nombre}`}
          className="flex size-10 items-center justify-center rounded-lg border border-neutral-200 text-neutral-600 transition-colors hover:bg-neutral-50 active:bg-neutral-100"
        >
          <Plus size={18} />
        </button>
      </div>
    </div>
  )
}

// De dónde sale el esperado: último conteo − lo vendido/cargado + entradas ± ajustes manuales.
function DesgloseEsperado({ fila }: { fila: PreviewLineaConteo }) {
  if (fila.anterior === null) {
    return <p className="mt-0.5 text-xs text-neutral-400">Primer conteo de este producto — esperado según el sistema</p>
  }
  const cuando = fila.anteriorEn
    ? new Date(fila.anteriorEn).toLocaleString('es-CO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    : ''
  const partes = [`Último conteo ${fila.anterior}${cuando ? ` (${cuando})` : ''}`]
  if (fila.vendido !== 0) partes.push(`− ${fila.vendido} vendidos`)
  if (fila.entradas !== 0) partes.push(`+ ${fila.entradas} entradas`)
  if (fila.otros !== 0) partes.push(`${fila.otros > 0 ? '+' : '−'} ${Math.abs(fila.otros)} ajustes`)
  return (
    <p className="mt-0.5 text-xs text-neutral-400">
      {partes.join(' ')}
      {fila.enCuentasPendientes > 0 ? ` · ${fila.enCuentasPendientes} en cuentas/órdenes sin cobrar` : ''}
    </p>
  )
}
