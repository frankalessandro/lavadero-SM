import { useRef, useState, type FormEvent } from 'react'
import { X, Plus, Trash2, Wallet, Landmark } from 'lucide-react'
import type { Producto } from '../../schemas/producto'
import { anularCompraInputSchema, type Compra, type CompraInput } from '../../schemas/compra'
import { CustomSelect } from './CustomSelect'
import { CurrencyInput } from './CurrencyInput'
import { toast } from '../../lib/toast'

const COP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })

function hoyISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

interface Linea {
  productoId: string
  cantidad: string
  costoUnitario: string
}

// Registrar una compra de inventario: proveedor + factura + fecha + origen del pago (caja del
// turno / gerencia) + un carrito de líneas (producto, cantidad, costo unitario tecleado por quien
// compró). Reemplaza el camino de antes de registrar una "entrada" suelta por producto —
// agrupa todo bajo UNA compra con su propio consecutivo, para que quede claro qué se compró junto
// y de dónde salió la plata. Compartido entre /admin/dinero/inventario (`size="sm"`) y
// /jefe-zona/inventario (`size="md"`, default) — mismo criterio que GastosDeTurno/PagoLineas.
export function CompraForm({
  productos,
  responsableSugerido,
  turnoAbiertoId,
  size = 'md',
  onClose,
  onGuardado,
}: {
  productos: Producto[]
  responsableSugerido: string
  /** Turno de jefe_zona abierto ahora mismo — si no hay ninguno, "Caja del turno" no se ofrece. */
  turnoAbiertoId: string | undefined
  size?: 'sm' | 'md'
  onClose: () => void
  onGuardado: (input: CompraInput) => Promise<void>
}) {
  const [proveedor, setProveedor] = useState('')
  const [numeroFactura, setNumeroFactura] = useState('')
  const [fecha, setFecha] = useState(hoyISO())
  const [origenPago, setOrigenPago] = useState<'caja' | 'gerencia'>(turnoAbiertoId ? 'caja' : 'gerencia')
  const [registradoPor, setRegistradoPor] = useState(responsableSugerido)
  const [lineas, setLineas] = useState<Linea[]>([{ productoId: '', cantidad: '', costoUnitario: '' }])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const enVueloRef = useRef(false)

  const inputCls =
    size === 'sm'
      ? 'rounded-lg border border-neutral-300 px-3 py-2.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500'
      : 'rounded-lg border border-neutral-300 px-3 py-3 text-base focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500'
  const labelCls = 'flex flex-col gap-1.5 text-sm'
  const spanCls = 'font-medium text-neutral-700'

  function setLinea(i: number, patch: Partial<Linea>) {
    setLineas((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)))
  }
  function agregarLinea() {
    setLineas((prev) => [...prev, { productoId: '', cantidad: '', costoUnitario: '' }])
  }
  function quitarLinea(i: number) {
    setLineas((prev) => (prev.length === 1 ? prev : prev.filter((_, idx) => idx !== i)))
  }

  const productoNombre = (id: string) => productos.find((p) => p.id === id)?.nombre ?? ''
  const lineasValidas = lineas.filter((l) => l.productoId && Number(l.cantidad) > 0)
  const total = lineasValidas.reduce((s, l) => s + Number(l.cantidad) * Number(l.costoUnitario || 0), 0)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (enVueloRef.current) return
    if (!proveedor.trim()) {
      setError('El proveedor es obligatorio')
      return
    }
    if (!registradoPor.trim()) {
      setError('Indica quién registra la compra')
      return
    }
    if (origenPago === 'caja' && !turnoAbiertoId) {
      setError('No hay turno abierto — abre caja o registra la compra a nombre de gerencia')
      return
    }
    if (lineasValidas.length === 0) {
      setError('Agrega al menos un producto con cantidad')
      return
    }
    setError(null)
    enVueloRef.current = true
    setSaving(true)
    try {
      await onGuardado({
        proveedor: proveedor.trim(),
        numeroFactura: numeroFactura.trim() || undefined,
        fecha,
        origenPago,
        turnoId: origenPago === 'caja' ? turnoAbiertoId : undefined,
        registradoPor: registradoPor.trim(),
        items: lineasValidas.map((l) => ({
          productoId: l.productoId,
          cantidad: Number(l.cantidad),
          costoUnitario: Number(l.costoUnitario || 0),
        })),
      })
      toast.exito('Compra registrada')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar la compra')
      toast.desdeError(err, 'No se pudo registrar la compra')
    } finally {
      enVueloRef.current = false
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center bg-neutral-900/40 backdrop-blur-[2px] sm:items-center sm:p-4">
      <div
        className={`custom-scroll flex max-h-[90vh] w-full flex-col overflow-y-auto rounded-t-2xl bg-white p-5 shadow-card-hover sm:rounded-2xl ${
          size === 'sm' ? 'max-w-xl sm:p-7' : 'max-w-md'
        }`}
      >
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-neutral-900">Registrar compra</h3>
            <p className="text-xs text-neutral-500">Proveedor, factura y los productos que llegaron.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex size-8 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-neutral-100"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className={labelCls}>
              <span className={spanCls}>Proveedor</span>
              <input
                value={proveedor}
                onChange={(e) => setProveedor(e.target.value)}
                placeholder="Ej. Licorera la 31"
                className={inputCls}
                autoFocus
              />
            </label>
            <label className={labelCls}>
              <span className={spanCls}>N.º de factura (opcional)</span>
              <input
                value={numeroFactura}
                onChange={(e) => setNumeroFactura(e.target.value)}
                placeholder="Ej. FE-1234"
                className={inputCls}
              />
            </label>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className={labelCls}>
              <span className={spanCls}>Fecha</span>
              <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={inputCls} />
            </label>
            <label className={labelCls}>
              <span className={spanCls}>Quién registra</span>
              <input
                value={registradoPor}
                onChange={(e) => setRegistradoPor(e.target.value)}
                placeholder="Nombre"
                className={inputCls}
              />
            </label>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className={`text-sm ${spanCls}`}>¿Con qué se pagó?</span>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={!turnoAbiertoId}
                onClick={() => setOrigenPago('caja')}
                className={`flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                  origenPago === 'caja'
                    ? 'border-primary-500 bg-primary-50 text-primary-700'
                    : 'border-neutral-300 text-neutral-600 hover:bg-neutral-50'
                }`}
              >
                <Wallet size={15} />
                Caja del turno
              </button>
              <button
                type="button"
                onClick={() => setOrigenPago('gerencia')}
                className={`flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors ${
                  origenPago === 'gerencia'
                    ? 'border-primary-500 bg-primary-50 text-primary-700'
                    : 'border-neutral-300 text-neutral-600 hover:bg-neutral-50'
                }`}
              >
                <Landmark size={15} />
                Gerencia
              </button>
            </div>
            <p className="text-xs text-neutral-500">
              {!turnoAbiertoId
                ? 'No hay turno abierto — solo se puede registrar a nombre de gerencia.'
                : origenPago === 'caja'
                  ? 'Se resta del efectivo esperado del arqueo de este turno.'
                  : 'No toca el arqueo de ninguna caja — solo registra el costo para inventario.'}
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <span className={`text-sm ${spanCls}`}>Productos</span>
            {lineas.map((linea, i) => (
              <div key={i} className="flex flex-col gap-2 rounded-lg border border-neutral-200 p-3 sm:flex-row sm:items-end">
                <div className="flex-1">
                  <CustomSelect
                    value={linea.productoId}
                    onChange={(v) => setLinea(i, { productoId: v })}
                    options={productos.map((p) => ({ value: p.id, label: p.nombre }))}
                    placeholder="Producto"
                    size={size}
                  />
                </div>
                <div className="flex gap-2">
                  <input
                    type="number"
                    min="1"
                    value={linea.cantidad}
                    onChange={(e) => setLinea(i, { cantidad: e.target.value })}
                    placeholder="Cant."
                    className={`w-20 ${inputCls}`}
                  />
                  <div className="w-32">
                    <CurrencyInput
                      size={size}
                      prefix="$"
                      value={linea.costoUnitario}
                      onChange={(v) => setLinea(i, { costoUnitario: v })}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => quitarLinea(i)}
                    disabled={lineas.length === 1}
                    className="flex size-9 shrink-0 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-danger-50 hover:text-danger-600 disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
            <button
              type="button"
              onClick={agregarLinea}
              className="flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-neutral-300 py-2 text-xs font-medium text-neutral-500 transition-colors hover:border-primary-300 hover:text-primary-600"
            >
              <Plus size={14} />
              Agregar otro producto
            </button>
          </div>

          {lineasValidas.length > 0 ? (
            <div className="flex items-center justify-between rounded-lg bg-neutral-50 px-4 py-3 text-sm">
              <span className="text-neutral-600">
                {lineasValidas.reduce((s, l) => s + Number(l.cantidad), 0)} unidades · {lineasValidas.length}{' '}
                {lineasValidas.length === 1 ? 'producto' : 'productos'}
                {productos.length > 0 && lineasValidas.length === 1 ? ` (${productoNombre(lineasValidas[0].productoId)})` : ''}
              </span>
              <span className="font-semibold text-neutral-900">{COP.format(total)}</span>
            </div>
          ) : null}

          {error ? <p className="text-xs text-danger-600">{error}</p> : null}

          <div className="flex justify-end gap-2 border-t border-neutral-100 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2.5 text-sm font-medium text-neutral-600 transition-colors hover:bg-neutral-100"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white shadow-nav-active transition-colors hover:bg-primary-700 disabled:opacity-60"
            >
              {saving ? 'Guardando…' : 'Registrar compra'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// Anular una compra (regla 13: motivo obligatorio, no se borra) — repone el stock con una salida
// sin costo. Compartido entre /admin/dinero/inventario y /jefe-zona/inventario, mismo patrón que
// AnularVentaModal.
export function AnularCompraModal({
  compra,
  onClose,
  onAnulada,
}: {
  compra: Compra
  onClose: () => void
  onAnulada: (input: { motivo: string; anuladaPor: string }) => Promise<void>
}) {
  const [motivo, setMotivo] = useState('')
  const [anuladaPor, setAnuladaPor] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const enVueloRef = useRef(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (enVueloRef.current) return
    const parsed = anularCompraInputSchema.safeParse({ motivo, anuladaPor })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Datos inválidos')
      return
    }
    setError(null)
    enVueloRef.current = true
    setSaving(true)
    try {
      await onAnulada(parsed.data)
      toast.exito('Compra anulada')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo anular la compra')
      toast.desdeError(err, 'No se pudo anular la compra')
    } finally {
      enVueloRef.current = false
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-neutral-900/40 p-4 backdrop-blur-[2px]">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-card-hover sm:p-7">
        <div className="mb-5 flex items-center justify-between">
          <h3 className="text-base font-semibold text-neutral-900">
            Anular compra #{compra.consecutivo} · {compra.proveedor}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="flex size-8 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-neutral-100"
          >
            <X size={18} />
          </button>
        </div>

        <p className="mb-5 text-xs text-neutral-500">
          Esta acción no se puede deshacer. El stock se repone automáticamente (sin costo, para no mover el
          promedio ponderado) y la compra queda visible en reportes con el motivo y quién la anuló.
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <label className="flex flex-col gap-1.5 text-left text-sm">
            <span className="font-medium text-neutral-700">Motivo de anulación</span>
            <textarea
              autoFocus
              value={motivo}
              onChange={(event) => setMotivo(event.target.value)}
              placeholder="p. ej. Compra duplicada por error de digitación"
              rows={3}
              className="resize-none rounded-lg border border-neutral-300 px-3 py-2.5 text-sm outline-none transition-colors focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
            />
          </label>

          <label className="flex flex-col gap-1.5 text-left text-sm">
            <span className="font-medium text-neutral-700">Quién anula</span>
            <input
              value={anuladaPor}
              onChange={(event) => setAnuladaPor(event.target.value)}
              placeholder="Nombre de quien anula"
              className="rounded-lg border border-neutral-300 px-3 py-2.5 text-sm outline-none transition-colors focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
            />
          </label>

          {error ? <p className="text-xs text-danger-600">{error}</p> : null}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2.5 text-sm font-medium text-neutral-600 transition-colors hover:bg-neutral-100"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-danger-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-danger-700 disabled:opacity-60"
            >
              {saving ? 'Anulando…' : 'Anular compra'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
