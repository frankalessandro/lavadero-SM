import { X } from 'lucide-react'
import { createPortal } from 'react-dom'
import type { MetodoPago, MetodoPagoBase } from '../../schemas/orden'
import { METODO_PAGO_LABEL } from '../../lib/metodoPago'
import logoIsotipo from '../../assets/logo-isotipo.png'

export interface VentaReciboItem {
  nombre: string
  cantidad: number
  precioUnitario: number
  total: number
}

export interface VentaReciboData {
  consecutivo: number
  // Rango de consecutivos cuando la venta tiene varias líneas (una fila `ventas` por producto).
  consecutivoFin?: number
  productoNombre: string
  cantidad: number
  precioUnitario: number
  total: number
  // Varias líneas en una sola factura (carrito). Si viene, se muestra el detalle por línea en
  // vez de los campos de producto único.
  items?: VentaReciboItem[]
  metodoPago: MetodoPago
  referenciaPago?: string
  // Reparto del cobro cuando fue pago partido (más de un método).
  pagos?: { metodo: MetodoPagoBase; monto: number; referencia?: string }[]
  vendidoPor: string
  fecha: string
  // Nombre de la cuenta abierta que se cerró para generar este comprobante (lavador, acompañante,
  // transeúnte sin vehículo) — ver 0041_cuentas_abiertas.sql. Ausente en ventas de mostrador.
  titular?: string
}

function refTexto(venta: VentaReciboData): string {
  return venta.consecutivoFin && venta.consecutivoFin !== venta.consecutivo
    ? `VTA-${venta.consecutivo} a VTA-${venta.consecutivoFin}`
    : `VTA-${venta.consecutivo}`
}

function metodoLabel(metodo: MetodoPago): string {
  return METODO_PAGO_LABEL[metodo]
}

const COP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })
const FECHA_HORA = new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short' })

// Comprobante de venta de producto (agua, cerveza, etc.) — mismo patrón pantalla + portal a
// document.body que ReciboModal/TiquetePrint (impresora térmica de 58mm), sin auto-imprimir:
// no hay impresora real configurada todavía, el admin/jefe de zona imprime con el botón.
export function VentaReciboModal({ venta, onClose }: { venta: VentaReciboData; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-neutral-900/50 p-0 backdrop-blur-sm sm:items-center sm:p-6">
      <div className="custom-scroll flex max-h-full w-full max-w-sm flex-col overflow-y-auto rounded-t-2xl bg-white shadow-card-hover sm:rounded-2xl">
        <div className="h-2 bg-success-600" />
        <div className="flex items-center justify-between px-6 pt-6">
          <p className="text-sm font-semibold text-neutral-900">Carwash SM</p>
          <button
            type="button"
            onClick={onClose}
            className="flex size-8 shrink-0 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-neutral-100"
          >
            <X size={18} />
          </button>
        </div>
        <p className="px-6 pb-4 text-xs text-neutral-400">Comprobante de venta</p>

        <div className="flex flex-col items-center gap-0.5 border-y border-dashed border-neutral-200 bg-neutral-50 px-6 py-4">
          <span className="text-xs font-medium uppercase tracking-wide text-neutral-400">Número de referencia</span>
          <span className="font-mono text-lg font-semibold text-primary-700">{refTexto(venta)}</span>
        </div>

        <div className="flex flex-col gap-2.5 px-6 py-5 text-sm">
          {venta.titular ? <VentaReciboRow label="Cuenta" value={venta.titular} /> : null}
          {venta.items && venta.items.length > 0 ? (
            <div className="flex flex-col gap-1.5 rounded-lg bg-neutral-50 px-3 py-2.5">
              {venta.items.map((it, i) => (
                <VentaReciboRow key={i} label={`${it.nombre} ×${it.cantidad}`} value={COP.format(it.total)} />
              ))}
            </div>
          ) : (
            <>
              <VentaReciboRow label="Producto" value={venta.productoNombre} />
              <VentaReciboRow label="Cantidad" value={String(venta.cantidad)} />
              <VentaReciboRow label="Precio unitario" value={COP.format(venta.precioUnitario)} />
            </>
          )}
          {venta.pagos && venta.pagos.length > 1 ? (
            <div className="flex flex-col gap-1.5 rounded-lg bg-neutral-50 px-3 py-2.5">
              <span className="text-xs font-medium uppercase tracking-wide text-neutral-400">Pago partido</span>
              {venta.pagos.map((p, i) => (
                <VentaReciboRow
                  key={i}
                  label={p.referencia ? `${METODO_PAGO_LABEL[p.metodo]} · ${p.referencia}` : METODO_PAGO_LABEL[p.metodo]}
                  value={COP.format(p.monto)}
                />
              ))}
            </div>
          ) : (
            <>
              <VentaReciboRow label="Método de pago" value={metodoLabel(venta.metodoPago)} />
              {venta.referenciaPago ? <VentaReciboRow label="Referencia" value={venta.referenciaPago} /> : null}
            </>
          )}
          <VentaReciboRow label="Vendido por" value={venta.vendidoPor} />
          <VentaReciboRow label="Fecha" value={FECHA_HORA.format(new Date(venta.fecha))} />

          <div className="mt-1 flex items-center justify-between rounded-lg bg-success-50 px-3 py-3">
            <span className="text-sm font-medium text-success-900">Total pagado</span>
            <span className="text-xl font-bold text-success-700">{COP.format(venta.total)}</span>
          </div>
        </div>

        <div className="relative border-t border-dashed border-neutral-200 px-6 pt-4 pb-6">
          <div className="pointer-events-none absolute inset-x-0 -top-1.5 flex justify-between px-4">
            {Array.from({ length: 12 }).map((_, i) => (
              <span key={i} className="size-3 rounded-full bg-neutral-50" />
            ))}
          </div>
          <button
            type="button"
            onClick={() => window.print()}
            className="w-full rounded-lg border border-neutral-200 py-3 text-sm font-semibold text-neutral-700 transition-colors hover:bg-neutral-50"
          >
            Imprimir tiquete
          </button>
          <button
            type="button"
            onClick={onClose}
            className="mt-2.5 w-full rounded-lg bg-success-600 py-3.5 text-sm font-semibold text-white shadow-nav-active transition-colors hover:bg-success-700"
          >
            Registrar otra venta
          </button>
          <p className="mt-2.5 text-center text-[11px] text-neutral-400">Impresión pensada para POS térmica de 58mm.</p>
        </div>
      </div>
      <VentaTicketPrint venta={venta} />
    </div>
  )
}

function VentaReciboRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="shrink-0 text-neutral-500">{label}</span>
      <span className="min-w-0 truncate text-right font-medium text-neutral-900">{value}</span>
    </div>
  )
}

// Marcado plano fuera de Tailwind, mismo criterio que TiquetePrint.tsx/ColillaLiquidacionModal
// (portal a document.body para que @media print pueda ocultar #root entero sin dejar espacio en blanco).
function VentaTicketPrint({ venta }: { venta: VentaReciboData }) {
  const fecha = new Date(venta.fecha)
  return createPortal(
    <div className="tiquete-58">
      <img src={logoIsotipo} alt="" className="tiquete-58__logo" />
      <p className="tiquete-58__tagline">Lavadero · Parqueadero</p>
      <p className="tiquete-58__nit-titulo">NIT 1113661734-4 · Comprobante de venta</p>

      <div className="tiquete-58__linea-solida" />

      <div className="tiquete-58__fila">
        <span className="tiquete-58__fila-label">No.</span>
        <span className="tiquete-58__fila-valor">{refTexto(venta)}</span>
      </div>
      <div className="tiquete-58__fila">
        <span className="tiquete-58__fila-label">Fecha</span>
        <span className="tiquete-58__fila-valor">{FECHA_HORA.format(fecha)}</span>
      </div>

      <div className="tiquete-58__linea" />

      {venta.titular ? (
        <div className="tiquete-58__fila">
          <span className="tiquete-58__fila-label">Cuenta</span>
          <span className="tiquete-58__fila-valor">{venta.titular}</span>
        </div>
      ) : null}
      {venta.items && venta.items.length > 0 ? (
        venta.items.map((it, i) => (
          <div className="tiquete-58__fila" key={i}>
            <span className="tiquete-58__fila-label">
              {it.nombre} x{it.cantidad}
            </span>
            <span className="tiquete-58__fila-valor">{COP.format(it.total)}</span>
          </div>
        ))
      ) : (
        <>
          <div className="tiquete-58__fila">
            <span className="tiquete-58__fila-label">Producto</span>
            <span className="tiquete-58__fila-valor">{venta.productoNombre}</span>
          </div>
          <div className="tiquete-58__fila">
            <span className="tiquete-58__fila-label">Cantidad</span>
            <span className="tiquete-58__fila-valor">{venta.cantidad}</span>
          </div>
          <div className="tiquete-58__fila">
            <span className="tiquete-58__fila-label">Precio unit.</span>
            <span className="tiquete-58__fila-valor">{COP.format(venta.precioUnitario)}</span>
          </div>
        </>
      )}
      {venta.pagos && venta.pagos.length > 1 ? (
        venta.pagos.map((p, i) => (
          <div className="tiquete-58__fila" key={i}>
            <span className="tiquete-58__fila-label">Pago {i + 1} · {METODO_PAGO_LABEL[p.metodo]}</span>
            <span className="tiquete-58__fila-valor">{COP.format(p.monto)}</span>
          </div>
        ))
      ) : (
        <>
          <div className="tiquete-58__fila">
            <span className="tiquete-58__fila-label">Pago</span>
            <span className="tiquete-58__fila-valor">{metodoLabel(venta.metodoPago)}</span>
          </div>
          {venta.referenciaPago ? (
            <div className="tiquete-58__fila">
              <span className="tiquete-58__fila-label">Referencia</span>
              <span className="tiquete-58__fila-valor">{venta.referenciaPago}</span>
            </div>
          ) : null}
        </>
      )}

      <div className="tiquete-58__linea-solida" />

      <div className="tiquete-58__total">
        <span>TOTAL PAGADO</span>
        <span>{COP.format(venta.total)}</span>
      </div>

      <div className="tiquete-58__linea" />

      <p className="tiquete-58__pie">Gracias por su visita</p>
      <p className="tiquete-58__pie-legal">Factura electrónica: solicítala a gerencia@carwashsm.com</p>
    </div>,
    document.body,
  )
}
