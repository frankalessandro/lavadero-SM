import { createPortal } from 'react-dom'
import type { ReciboData } from './ReciboModal'
import { METODO_PAGO_LABEL } from '../../lib/metodoPago'

const COP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })
const FECHA = new Intl.DateTimeFormat('es-CO', { dateStyle: 'short' })
const HORA = new Intl.DateTimeFormat('es-CO', { timeStyle: 'short' })

// Marcado plano (sin Tailwind, ver src/styles/tiquete-print.css) para la impresora
// térmica de 58mm. Se porta directo a document.body (fuera de #root) para que en
// @media print baste con ocultar #root — nada de visibility:hidden en el resto del
// árbol, que dejaba reservado el alto de la app entera y sacaba páginas en blanco.
export function TiquetePrint({ recibo, variant }: { recibo: ReciboData; variant: 'ingreso' | 'pago' }) {
  const esPago = variant === 'pago'
  const fecha = new Date(recibo.fecha)

  return createPortal(
    <div className="tiquete-58">
      <p className="tiquete-58__marca">Carwash SM</p>
      <p className="tiquete-58__tagline">Lavadero · Parqueadero</p>
      <p className="tiquete-58__titulo">{esPago ? 'Comprobante de pago' : 'Comprobante de ingreso'}</p>

      <div className="tiquete-58__linea-solida" />

      <div className="tiquete-58__fila">
        <span className="tiquete-58__fila-label">No.</span>
        <span className="tiquete-58__fila-valor">LAV-{recibo.consecutivo}</span>
      </div>
      <div className="tiquete-58__fila">
        <span className="tiquete-58__fila-label">{esPago ? 'Entrega' : 'Ingreso'}</span>
        <span className="tiquete-58__fila-valor">
          {FECHA.format(fecha)} {HORA.format(fecha)}
        </span>
      </div>

      <div className="tiquete-58__linea" />

      <p className="tiquete-58__seccion">Cliente</p>
      <TiqueteFila label="Nombre" valor={recibo.clienteNombre} />
      <TiqueteFila label="Vehículo" valor={recibo.tipoNombre} />
      <div className="tiquete-58__placa">{recibo.placa}</div>

      <div className="tiquete-58__linea" />

      <p className="tiquete-58__seccion">Detalle del servicio</p>
      <TiqueteFila label="Combo" valor={recibo.comboNombre} />
      {recibo.serviciosAdicionales && recibo.serviciosAdicionales.length > 0 ? (
        <TiqueteFila label="Adicionales" valor={recibo.serviciosAdicionales.join(', ')} />
      ) : null}
      <TiqueteFila
        label={recibo.lavadorNombre2 ? 'Lavadores' : 'Lavador'}
        valor={recibo.lavadorNombre2 ? `${recibo.lavadorNombre} + ${recibo.lavadorNombre2}` : recibo.lavadorNombre}
      />
      {esPago && recibo.pagos && recibo.pagos.length > 1 ? (
        recibo.pagos.map((p, i) => (
          <TiqueteFila key={i} label={`Pago ${i + 1} · ${METODO_PAGO_LABEL[p.metodo]}`} valor={COP.format(p.monto)} />
        ))
      ) : esPago && recibo.metodoPago ? (
        <TiqueteFila label="Pago" valor={METODO_PAGO_LABEL[recibo.metodoPago]} />
      ) : null}
      {esPago && (!recibo.pagos || recibo.pagos.length <= 1) && recibo.referenciaPago ? (
        <TiqueteFila label="Referencia" valor={recibo.referenciaPago} />
      ) : null}

      <div className="tiquete-58__linea-solida" />

      <div className="tiquete-58__total">
        <span>{esPago ? 'TOTAL PAGADO' : 'PRECIO'}</span>
        <span>{COP.format(recibo.precio)}</span>
      </div>

      <div className="tiquete-58__linea" />

      <p className="tiquete-58__aviso">
        {esPago ? 'Vehículo entregado — pago confirmado.' : 'Se cobra al entregar el vehículo, no ahora.'}
      </p>
      <p className="tiquete-58__pie">Gracias por su visita</p>
      <p className="tiquete-58__pie-legal">Factura electrónica: solicítala a gerencia@carwashsm.com</p>
    </div>,
    document.body,
  )
}

function TiqueteFila({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="tiquete-58__fila">
      <span className="tiquete-58__fila-label">{label}</span>
      <span className="tiquete-58__fila-valor">{valor}</span>
    </div>
  )
}
