import { useMemo, useRef, useState } from 'react'
import { Boxes, PackageCheck, RotateCcw } from 'lucide-react'
import {
  abrirConteoInventario,
  cerrarConteoInventario,
  previewConteo,
} from '../../data/conteosInventario'
import type { MomentoConteo, PreviewLineaConteo } from '../../schemas/conteoInventario'
import type { Producto } from '../../schemas/producto'
import type { TurnoCaja } from '../../schemas/turnoCaja'
import { Card } from './Card'

interface ConteoInventarioProps {
  turno: TurnoCaja
  momento: MomentoConteo
  /** Productos vendibles (nevera/vitrina) — se filtran acá a `activo` con precio de venta. */
  productos: Producto[]
  onConfirmado: () => void | Promise<void>
}

// Conteo de inventario ciego → revelar → justificar, en paralelo al arqueo de caja. En la
// apertura reconcilia contra el cierre de la noche anterior; en el cierre exige contar antes de
// cerrar el turno (0048). El faltante queda registrado contra el responsable del turno, sin
// cobrarse en el momento.
export function ConteoInventario({ turno, momento, productos, onConfirmado }: ConteoInventarioProps) {
  const vendibles = useMemo(
    () => productos.filter((p) => p.activo && p.precioVenta != null).sort((a, b) => a.nombre.localeCompare(b.nombre)),
    [productos],
  )

  const [paso, setPaso] = useState<'ciego' | 'revelado'>('ciego')
  const [conteos, setConteos] = useState<Record<string, string>>({})
  const [preview, setPreview] = useState<PreviewLineaConteo[] | null>(null)
  const [motivos, setMotivos] = useState<Record<string, string>>({})
  const [justificacion, setJustificacion] = useState('')
  const [revisado, setRevisado] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const enVueloRef = useRef(false)

  const esApertura = momento === 'apertura'
  const titulo = esApertura ? 'Conteo de inventario — apertura' : 'Conteo de inventario — cierre'

  const filas = useMemo(() => {
    if (!preview) return []
    return preview.map((p) => {
      const contado = Math.round(Number(conteos[p.productoId] ?? 0))
      return { ...p, contado, diferencia: contado - p.esperado }
    })
  }, [preview, conteos])

  const hayDiferencia = filas.some((f) => f.diferencia !== 0)
  const totalFaltante = filas.filter((f) => f.diferencia < 0).reduce((s, f) => s + Math.abs(f.diferencia), 0)

  function setConteo(id: string, valor: string) {
    setConteos((prev) => ({ ...prev, [id]: valor.replace(/\D/g, '') }))
  }

  async function handleRevelar() {
    setError(null)
    const faltan = vendibles.filter((p) => (conteos[p.id] ?? '') === '')
    if (faltan.length > 0) {
      setError(`Falta contar: ${faltan.map((p) => p.nombre).join(', ')}`)
      return
    }
    setLoading(true)
    try {
      setPreview(await previewConteo(turno.id, momento))
      setRevisado(false)
      setPaso('revelado')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo calcular el esperado')
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
      await onConfirmado()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar el conteo')
    } finally {
      enVueloRef.current = false
      setLoading(false)
    }
  }

  const inputCls =
    'w-20 rounded-lg border border-neutral-300 px-2 py-2 text-center text-base outline-none transition-colors focus:border-primary-500 focus:ring-1 focus:ring-primary-500'

  return (
    <Card className="flex flex-col gap-4 border-l-4 border-l-primary-500 p-5">
      <div className="flex items-start gap-2.5">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-700">
          <Boxes size={18} />
        </span>
        <div>
          <h2 className="text-sm font-semibold text-neutral-900">{titulo}</h2>
          <p className="text-xs text-neutral-500">
            {esApertura
              ? 'Cuenta lo que hay en nevera y vitrina antes de arrancar. Debe cuadrar con el cierre de anoche.'
              : 'Cuenta lo que queda antes de cerrar la caja. Lo que está en cuentas abiertas no cuenta como faltante.'}
          </p>
        </div>
      </div>

      {paso === 'ciego' ? (
        <>
          <div className="flex flex-col divide-y divide-neutral-100">
            {vendibles.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-3 py-2.5">
                <span className="text-sm font-medium text-neutral-800">
                  {p.nombre}
                  <span className="ml-1 text-xs font-normal text-neutral-400">({p.unidadMedida})</span>
                </span>
                <input
                  inputMode="numeric"
                  value={conteos[p.id] ?? ''}
                  onChange={(e) => setConteo(p.id, e.target.value)}
                  placeholder="0"
                  className={inputCls}
                />
              </div>
            ))}
            {vendibles.length === 0 ? (
              <p className="py-4 text-center text-sm text-neutral-400">No hay productos de nevera/vitrina configurados.</p>
            ) : null}
          </div>

          {error ? <p className="text-xs text-danger-600">{error}</p> : null}

          <button
            type="button"
            onClick={handleRevelar}
            disabled={loading || vendibles.length === 0}
            className="flex items-center justify-center gap-2 rounded-lg bg-primary-600 py-3 text-sm font-semibold text-white shadow-nav-active transition-colors hover:bg-primary-700 disabled:opacity-60"
          >
            {loading ? 'Calculando…' : 'Revelar diferencias'}
          </button>
        </>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-medium text-neutral-500">
                  <th className="pb-2">Producto</th>
                  <th className="pb-2 text-right">Esperado</th>
                  <th className="pb-2 text-right">Contado</th>
                  <th className="pb-2 text-right">Dif.</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => (
                  <tr key={f.productoId} className="border-t border-neutral-50">
                    <td className="py-2 pr-2 font-medium text-neutral-800">
                      {f.nombre}
                      {f.enCuentasPendientes > 0 ? (
                        <span className="ml-1 text-xs font-normal text-neutral-400">
                          ({f.enCuentasPendientes} en cuentas)
                        </span>
                      ) : null}
                    </td>
                    <td className="py-2 text-right text-neutral-600">{f.esperado}</td>
                    <td className="py-2 text-right text-neutral-600">{f.contado}</td>
                    <td
                      className={`py-2 text-right font-semibold ${
                        f.diferencia < 0
                          ? 'text-danger-600'
                          : f.diferencia > 0
                            ? 'text-warning-700'
                            : 'text-success-700'
                      }`}
                    >
                      {f.diferencia > 0 ? `+${f.diferencia}` : f.diferencia}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {hayDiferencia ? (
            <div className="flex flex-col gap-3 rounded-lg border border-warning-600/25 bg-warning-50 p-3">
              <p className="text-xs font-medium text-warning-700">
                {totalFaltante > 0
                  ? `Faltan ${totalFaltante} unidad(es). Quedan registradas a nombre de ${turno.responsableActual} para revisar.`
                  : 'Hay sobrantes — revisa y justifica.'}
              </p>
              {filas
                .filter((f) => f.diferencia !== 0)
                .map((f) => (
                  <input
                    key={f.productoId}
                    value={motivos[f.productoId] ?? ''}
                    onChange={(e) => setMotivos((prev) => ({ ...prev, [f.productoId]: e.target.value }))}
                    placeholder={`Nota para ${f.nombre} (opcional)`}
                    className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
                  />
                ))}
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="font-medium text-neutral-700">Justificación (obligatoria)</span>
                <textarea
                  value={justificacion}
                  onChange={(e) => setJustificacion(e.target.value)}
                  rows={2}
                  placeholder="Qué pasó con el faltante / sobrante"
                  className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-base outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
                />
              </label>
              <label className="flex items-center gap-2 text-xs text-neutral-600">
                <input type="checkbox" checked={revisado} onChange={(e) => setRevisado(e.target.checked)} />
                Ya reconté y busqué el faltante antes de registrarlo
              </label>
            </div>
          ) : (
            <p className="rounded-lg bg-success-50 px-3 py-2.5 text-sm font-medium text-success-700">
              Todo cuadra.
            </p>
          )}

          {error ? <p className="text-xs text-danger-600">{error}</p> : null}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setPaso('ciego')
                setError(null)
              }}
              className="flex items-center justify-center gap-1.5 rounded-lg border border-neutral-300 px-3 py-3 text-sm font-medium text-neutral-600 transition-colors hover:bg-neutral-50"
            >
              <RotateCcw size={15} />
              Recontar
            </button>
            <button
              type="button"
              onClick={handleConfirmar}
              disabled={loading}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary-600 py-3 text-sm font-semibold text-white shadow-nav-active transition-colors hover:bg-primary-700 disabled:opacity-60"
            >
              <PackageCheck size={16} />
              {loading ? 'Registrando…' : esApertura ? 'Registrar apertura' : 'Registrar cierre'}
            </button>
          </div>
        </>
      )}
    </Card>
  )
}
