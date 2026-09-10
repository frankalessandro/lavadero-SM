import { useMemo, useRef, useState } from 'react'
import { Minus, Plus, PackageCheck, RotateCcw, ChevronDown, CheckCircle2 } from 'lucide-react'
import { abrirConteoInventario, cerrarConteoInventario, previewConteo } from '../../data/conteosInventario'
import type { MomentoConteo, PreviewLineaConteo } from '../../schemas/conteoInventario'
import { SECCION_PRODUCTO_LABEL, type Producto } from '../../schemas/producto'
import { agruparPorSeccion } from '../../lib/seccionProductos'
import type { TurnoCaja } from '../../schemas/turnoCaja'
import { PantallaTarea, BotonPrincipal } from './PantallaTarea'
import { toast } from '../../lib/toast'

interface ConteoInventarioProps {
  turno: TurnoCaja
  momento: MomentoConteo
  /** Productos vendibles (nevera/vitrina) — se filtran acá a `activo` con precio de venta. */
  productos: Producto[]
  onVolver: () => void
  onConfirmado: () => void | Promise<void>
  /** Se llama justo antes de `onConfirmado`, con si el conteo quedó cuadrado — el checklist del
   *  turno lo usa para el resumen de cierre sin tener que releer nada. */
  onResultado?: (info: { cuadrado: boolean; totalFaltante: number }) => void
}

// Conteo de inventario ciego → revelar → justificar, en paralelo al arqueo de caja (0048). En la
// apertura reconcilia contra el cierre de la noche anterior; en el cierre el faltante queda
// registrado contra el responsable del turno, sin cobrarse en el momento.
//
// Dos decisiones de interfaz, después de que la primera versión (tabla con inputs, notas y
// justificación todo apilado en un modal) resultara ilegible:
//   · Contar es una tarea de dedo, no de teclado: contador grande −/+ por producto (mismo control
//     que el carrito de "Agregar producto"), con el número editable a mano para cantidades altas.
//     Vacío ≠ 0: hasta que no se toca, el producto cuenta como "sin contar" y el progreso lo dice.
//   · Al revelar, lo que cuadra no necesita espacio: se colapsa en una sola línea y solo se
//     muestran en detalle los productos con diferencia, que son los que piden acción.
export function ConteoInventario({
  turno,
  momento,
  productos,
  onVolver,
  onConfirmado,
  onResultado,
}: ConteoInventarioProps) {
  const vendibles = useMemo(
    () => productos.filter((p) => p.activo && p.precioVenta != null).sort((a, b) => a.nombre.localeCompare(b.nombre)),
    [productos],
  )

  // Se cuenta todo a diario; solo el agrupamiento cambia (0058).
  const grupos = useMemo(() => agruparPorSeccion(vendibles), [vendibles])

  const seccionLabelDe = (productoId: string) => {
    const p = vendibles.find((v) => v.id === productoId)
    if (!p) return 'Sin sección'
    return p.seccion ? SECCION_PRODUCTO_LABEL[p.seccion] : 'Sin sección'
  }

  const [fase, setFase] = useState<'contando' | 'resultado'>('contando')
  const [conteos, setConteos] = useState<Record<string, number>>({})
  const [preview, setPreview] = useState<PreviewLineaConteo[] | null>(null)
  const [motivos, setMotivos] = useState<Record<string, string>>({})
  const [justificacion, setJustificacion] = useState('')
  const [revisado, setRevisado] = useState(false)
  const [verCuadrados, setVerCuadrados] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const enVueloRef = useRef(false)

  const esApertura = momento === 'apertura'
  const contados = vendibles.filter((p) => conteos[p.id] !== undefined).length
  const faltanPorContar = vendibles.length - contados

  const filas = useMemo(() => {
    if (!preview) return []
    return preview.map((p) => {
      const contado = conteos[p.productoId] ?? 0
      return { ...p, contado, diferencia: contado - p.esperado }
    })
  }, [preview, conteos])

  const cuadrados = filas.filter((f) => f.diferencia === 0)
  const descuadrados = filas.filter((f) => f.diferencia !== 0)
  const hayDiferencia = descuadrados.length > 0
  const totalFaltante = descuadrados.filter((f) => f.diferencia < 0).reduce((s, f) => s + Math.abs(f.diferencia), 0)

  // Los descuadres, agrupados por sección (mismo orden que el conteo). El encabezado solo se
  // pinta si hay más de un grupo — con un solo grupo no aporta nada.
  const gruposDescuadrados = (['Bebidas', 'Snacks', 'Sin sección'] as const)
    .map((label) => ({ label, filas: descuadrados.filter((f) => seccionLabelDe(f.productoId) === label) }))
    .filter((g) => g.filas.length > 0)

  function ajustar(id: string, delta: number) {
    setConteos((prev) => {
      const actual = prev[id]
      const base = actual === undefined ? 0 : actual
      return { ...prev, [id]: Math.max(0, base + delta) }
    })
  }

  function escribir(id: string, valor: string) {
    const limpio = valor.replace(/\D/g, '')
    setConteos((prev) => {
      if (limpio === '') {
        const siguiente = { ...prev }
        delete siguiente[id]
        return siguiente
      }
      return { ...prev, [id]: Number(limpio) }
    })
  }

  async function handleRevelar() {
    setError(null)
    if (faltanPorContar > 0) {
      setError(`Falta contar ${faltanPorContar} producto${faltanPorContar === 1 ? '' : 's'}.`)
      return
    }
    setLoading(true)
    try {
      setPreview(await previewConteo(turno.id, momento))
      setRevisado(false)
      setFase('resultado')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo calcular el esperado')
      toast.desdeError(err, 'No se pudo calcular el esperado')
    } finally {
      setLoading(false)
    }
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
      motivo: motivos[f.productoId]?.trim() || undefined,
    }))

    enVueloRef.current = true
    setLoading(true)
    try {
      if (esApertura) {
        await abrirConteoInventario(turno.id, lineas, justificacion.trim() || undefined)
      } else {
        await cerrarConteoInventario(turno.id, lineas, justificacion.trim() || undefined)
      }
      onResultado?.({ cuadrado: !hayDiferencia, totalFaltante })
      await onConfirmado()
      toast.exito(esApertura ? 'Conteo de apertura registrado' : 'Conteo de cierre registrado')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar el conteo')
      toast.desdeError(err, 'No se pudo registrar el conteo')
    } finally {
      enVueloRef.current = false
      setLoading(false)
    }
  }

  const titulo = esApertura ? 'Conteo de apertura' : 'Conteo de cierre'

  // ── Fase 1: contar (ciego, sin ver el esperado) ──────────────────────────────────────────────
  if (fase === 'contando') {
    return (
      <PantallaTarea
        titulo={titulo}
        subtitulo={esApertura ? 'Cuenta lo que hay antes de arrancar' : 'Cuenta lo que queda antes de cerrar'}
        onVolver={onVolver}
        pie={
          <>
            {error ? <p className="text-center text-xs text-danger-600">{error}</p> : null}
            <BotonPrincipal onClick={handleRevelar} disabled={loading || vendibles.length === 0}>
              {loading ? 'Calculando…' : 'Ver diferencias'}
            </BotonPrincipal>
          </>
        }
      >
        <div className="flex items-center justify-between gap-3 rounded-xl bg-white px-4 py-3 shadow-card">
          <div>
            <p className="text-sm font-semibold text-neutral-900">
              Contados {contados} de {vendibles.length}
            </p>
            <p className="text-xs text-neutral-500">No verás el esperado hasta terminar — es a ciegas.</p>
          </div>
          <div className="h-1.5 w-20 shrink-0 overflow-hidden rounded-full bg-neutral-100">
            <div
              className="h-full rounded-full bg-primary-600 transition-all"
              style={{ width: `${vendibles.length === 0 ? 0 : (contados / vendibles.length) * 100}%` }}
            />
          </div>
        </div>

        <div className="flex flex-col gap-4">
          {grupos.map((g) => (
            <div key={g.key} className="flex flex-col gap-2">
              <p className="px-1 text-xs font-semibold uppercase tracking-wide text-neutral-400">
                {g.label}
                <span className="ml-1.5 font-normal normal-case text-neutral-300">{g.productos.length}</span>
              </p>
              {g.productos.map((p) => {
                const valor = conteos[p.id]
                const sinContar = valor === undefined
                return (
                  <div
                    key={p.id}
                    className={`flex items-center justify-between gap-3 rounded-xl border bg-white px-4 py-3 transition-colors ${
                      sinContar ? 'border-neutral-200' : 'border-primary-200 bg-primary-50/30'
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-neutral-900">{p.nombre}</p>
                      <p className="text-xs text-neutral-400">{p.unidadMedida}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => ajustar(p.id, -1)}
                        aria-label={`Restar a ${p.nombre}`}
                        className="flex size-10 items-center justify-center rounded-lg border border-neutral-200 text-neutral-600 transition-colors hover:bg-neutral-50 active:bg-neutral-100"
                      >
                        <Minus size={18} />
                      </button>
                      <input
                        inputMode="numeric"
                        value={valor ?? ''}
                        onChange={(e) => escribir(p.id, e.target.value)}
                        placeholder="—"
                        aria-label={`Cantidad de ${p.nombre}`}
                        className="w-14 rounded-lg border border-neutral-200 py-2 text-center text-lg font-semibold text-neutral-900 outline-none transition-colors placeholder:font-normal placeholder:text-neutral-300 focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
                      />
                      <button
                        type="button"
                        onClick={() => ajustar(p.id, 1)}
                        aria-label={`Sumar a ${p.nombre}`}
                        className="flex size-10 items-center justify-center rounded-lg border border-neutral-200 text-neutral-600 transition-colors hover:bg-neutral-50 active:bg-neutral-100"
                      >
                        <Plus size={18} />
                      </button>
                    </div>
                  </div>
                )
              })}
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

  // ── Fase 2: resultado (lo que cuadra se colapsa, lo que no pide acción) ──────────────────────
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
            {loading ? 'Registrando…' : 'Registrar conteo'}
          </BotonPrincipal>
          <button
            type="button"
            onClick={() => {
              setFase('contando')
              setError(null)
            }}
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
                  falta ? 'border-l-danger-500' : 'border-l-warning-600'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-neutral-900">{f.nombre}</p>
                    <p className="text-xs text-neutral-500">
                      Esperado {f.esperado} · Contaste {f.contado}
                    </p>
                    {f.enCuentasPendientes > 0 ? (
                      <p className="mt-0.5 text-xs text-neutral-400">
                        {f.enCuentasPendientes} en cuentas abiertas, ya descontadas del esperado
                      </p>
                    ) : null}
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
                  <span className="shrink-0 font-medium text-neutral-500">{f.contado}</span>
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
              Las {totalFaltante} unidad(es) que faltan quedan registradas a nombre de {turno.responsableActual} para
              revisar. No se cobran ahora.
            </p>
          ) : null}
        </div>
      ) : null}
    </PantallaTarea>
  )
}
