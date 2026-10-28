import { ShoppingBag } from 'lucide-react'
import { createPortal } from 'react-dom'
import type { MetodoPago, MetodoPagoBase } from '../../schemas/orden'
import { METODO_PAGO_LABEL } from '../../lib/metodoPago'
import { EncabezadoTiquete, PieTiquete } from './EncabezadoTiquete'
import { ComprobanteDesglose, ComprobanteModal, type DatoComprobante } from './ComprobanteModal'

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

// Comprobante de venta de producto (agua, cerveza, etc.) — vista con ComprobanteModal; lo que se
// imprime es VentaTicketPrint (térmica de 58mm), sin auto-imprimir: el jefe de patio imprime con
// el botón.
export function VentaReciboModal({ venta, onClose }: { venta: VentaReciboData; onClose: () => void }) {
  const partido = Boolean(venta.pagos && venta.pagos.length > 1)
  const conItems = Boolean(venta.items && venta.items.length > 0)

  const datos: DatoComprobante[] = []
  if (venta.titular) datos.push({ label: 'Cuenta', valor: venta.titular })
  if (!conItems) {
    datos.push(
      { label: 'Producto', valor: venta.productoNombre },
      { label: 'Cantidad', valor: `${venta.cantidad} × ${COP.format(venta.precioUnitario)}` },
    )
  }
  if (!partido) {
    datos.push({ label: 'Método de pago', valor: metodoLabel(venta.metodoPago) })
    if (venta.referenciaPago) datos.push({ label: 'Referencia', valor: venta.referenciaPago })
  }
  datos.push({ label: 'Vendido por', valor: venta.vendidoPor }, { label: 'Fecha', valor: FECHA_HORA.format(new Date(venta.fecha)) })

  return (
    <ComprobanteModal
      titulo="Comprobante de venta"
      referencia={refTexto(venta)}
      icon={ShoppingBag}
      tono="success"
      total={{ label: 'Total pagado', valor: COP.format(venta.total) }}
      datos={datos}
      imprimirLabel="Imprimir tiquete"
      cerrarLabel="Listo"
      onClose={onClose}
      impresion={<VentaTicketPrint venta={venta} />}
    >
      {conItems ? (
        <ComprobanteDesglose
          titulo="Productos"
          lineas={(venta.items ?? []).map((it) => ({ label: `${it.nombre} ×${it.cantidad}`, valor: COP.format(it.total) }))}
        />
      ) : null}
      {partido ? (
        <ComprobanteDesglose
          titulo="Pago partido"
          lineas={(venta.pagos ?? []).map((p) => ({
            label: p.referencia ? `${METODO_PAGO_LABEL[p.metodo]} · ${p.referencia}` : METODO_PAGO_LABEL[p.metodo],
            valor: COP.format(p.monto),
          }))}
        />
      ) : null}
    </ComprobanteModal>
  )
}

// Marcado plano fuera de Tailwind, mismo criterio que TiquetePrint.tsx/ColillaLiquidacionModal
// (portal a document.body para que @media print pueda ocultar #root entero sin dejar espacio en blanco).
function VentaTicketPrint({ venta }: { venta: VentaReciboData }) {
  const fecha = new Date(venta.fecha)
  return createPortal(
    <div className="tiquete-58">
      <EncabezadoTiquete titulo="Comprobante de venta" />

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

      <PieTiquete />
    </div>,
    document.body,
  )
}
