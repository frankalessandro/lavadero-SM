import { Banknote } from 'lucide-react'
import { createPortal } from 'react-dom'
import { BloqueFirma, Fila } from './ComprobanteEgresoModal'
import { EncabezadoTiquete } from './EncabezadoTiquete'
import { ComprobanteModal, type DatoComprobante } from './ComprobanteModal'
import { useAjustesNegocio } from '../../lib/useAjustesNegocio'

const COP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })
const FECHA_HORA = new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short' })

export interface ComprobantePrestamoData {
  id: string
  monto: number
  creadoEn: string
  /** Quien recibe el dinero (lavador, jefe de patio o gerencia). */
  prestatarioNombre: string
  prestatarioRol: string
  /** Jefe de patio a cargo del turno que entrega el dinero. */
  jefePatioNombre: string
  motivo?: string
}

// Referencia corta y estable derivada del id — no hay consecutivo de préstamos en BD (mismo criterio
// que el comprobante de egreso).
const referencia = (id: string) => `PRE-${id.slice(0, 8).toUpperCase()}`

// Comprobante de préstamo en efectivo para firmar (respaldo legal): monto, quien entrega (jefe de
// patio del turno) y quien recibe. Vista con ComprobanteModal; lo que se imprime es
// ComprobantePrestamoPrint (térmica 58mm, con las dos firmas).
export function ComprobantePrestamoModal({ data, onClose }: { data: ComprobantePrestamoData; onClose: () => void }) {
  const datos: DatoComprobante[] = [
    { label: 'Fecha', valor: FECHA_HORA.format(new Date(data.creadoEn)) },
    { label: 'Recibe', valor: `${data.prestatarioNombre} · ${data.prestatarioRol}` },
    { label: 'Entrega (jefe de patio)', valor: data.jefePatioNombre, ancho: true },
  ]
  if (data.motivo) datos.push({ label: 'Motivo', valor: data.motivo, ancho: true })
  return (
    <ComprobanteModal
      titulo="Comprobante de préstamo"
      referencia={referencia(data.id)}
      icon={Banknote}
      tono="warning"
      total={{
        label: 'Valor prestado',
        valor: COP.format(data.monto),
        nota: 'Al imprimir quedan espacios para la firma del jefe de patio y de quien recibe el dinero.',
      }}
      datos={datos}
      imprimirLabel="Imprimir comprobante"
      onClose={onClose}
      impresion={<ComprobantePrestamoPrint data={data} />}
    />
  )
}

function ComprobantePrestamoPrint({ data }: { data: ComprobantePrestamoData }) {
  const negocio = useAjustesNegocio()
  return createPortal(
    <div className="tiquete-58">
      <EncabezadoTiquete titulo="Comprobante de préstamo" />

      <div className="tiquete-58__linea-solida" />

      <Fila label="No." valor={referencia(data.id)} />
      <Fila label="Fecha" valor={FECHA_HORA.format(new Date(data.creadoEn))} />
      {data.motivo ? (
        <>
          <p className="tiquete-58__fila-label">Motivo</p>
          <p className="tiquete-58__texto">{data.motivo}</p>
        </>
      ) : null}

      <div className="tiquete-58__linea-solida" />

      <div className="tiquete-58__total">
        <span>VALOR PRESTADO</span>
        <span>{COP.format(data.monto)}</span>
      </div>

      <div className="tiquete-58__linea" />

      <p className="tiquete-58__texto">
        Recibo de {negocio.nombre} la suma de {COP.format(data.monto)} en efectivo, como préstamo que me comprometo a pagar.
      </p>

      <BloqueFirma rol="Entrega (jefe de patio)" nombre={data.jefePatioNombre} />
      <BloqueFirma rol={`Recibe (${data.prestatarioRol})`} nombre={data.prestatarioNombre} />

      <p className="tiquete-58__pie-legal">Comprobante interno de préstamo</p>
    </div>,
    document.body,
  )
}
