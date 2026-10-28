import { Wallet } from 'lucide-react'
import { createPortal } from 'react-dom'
import { MarcaTiquete } from './EncabezadoTiquete'
import { ComprobanteModal } from './ComprobanteModal'

export interface ColillaJefeZonaData {
  responsable: string
  periodoInicio: string
  periodoFin: string
  cantidadOrdenes: number
  monto: number
  generadaEn: string
}

const COP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })
const FECHA = new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium' })
const FECHA_HORA = new Intl.DateTimeFormat('es-CO', { dateStyle: 'short', timeStyle: 'short' })

function periodoLabel(inicio: string, fin: string): string {
  if (inicio === fin) return `Diaria del ${FECHA.format(new Date(`${inicio}T00:00:00`))}`
  return `Semanal · ${FECHA.format(new Date(`${inicio}T00:00:00`))} → ${FECHA.format(new Date(`${fin}T00:00:00`))}`
}

// Colilla de liquidación del jefe de patio — vista con ComprobanteModal, sin desglose por
// combo/categoría: la comisión de jefe de patio es un porcentaje plano del total de cada orden
// durante su turno, no depende de qué combo fue cada vehículo. Lo que se imprime es ColillaPrint.
export function ColillaJefeZonaModal({ colilla, onClose }: { colilla: ColillaJefeZonaData; onClose: () => void }) {
  return (
    <ComprobanteModal
      titulo="Colilla de liquidación"
      subtitulo={`${colilla.responsable} · jefe de patio`}
      icon={Wallet}
      total={{
        label: 'Total liquidado',
        valor: COP.format(colilla.monto),
        nota: `${colilla.cantidadOrdenes} orden${colilla.cantidadOrdenes === 1 ? '' : 'es'} con turno a cargo en el periodo.`,
      }}
      datos={[
        { label: 'Periodo', valor: periodoLabel(colilla.periodoInicio, colilla.periodoFin), ancho: true },
        { label: 'Órdenes', valor: String(colilla.cantidadOrdenes) },
        { label: 'Generada', valor: FECHA_HORA.format(new Date(colilla.generadaEn)) },
      ]}
      imprimirLabel="Imprimir colilla"
      onClose={onClose}
      impresion={<ColillaPrint colilla={colilla} />}
    />
  )
}

function ColillaPrint({ colilla }: { colilla: ColillaJefeZonaData }) {
  return createPortal(
    <div className="tiquete-58">
      <MarcaTiquete />
      <p className="tiquete-58__titulo">Colilla — jefe de patio</p>

      <div className="tiquete-58__linea-solida" />

      <div className="tiquete-58__fila">
        <span className="tiquete-58__fila-label">Responsable</span>
        <span className="tiquete-58__fila-valor">{colilla.responsable}</span>
      </div>
      <div className="tiquete-58__fila">
        <span className="tiquete-58__fila-label">Periodo</span>
        <span className="tiquete-58__fila-valor">{periodoLabel(colilla.periodoInicio, colilla.periodoFin)}</span>
      </div>
      <div className="tiquete-58__fila">
        <span className="tiquete-58__fila-label">Órdenes</span>
        <span className="tiquete-58__fila-valor">{colilla.cantidadOrdenes}</span>
      </div>
      <div className="tiquete-58__fila">
        <span className="tiquete-58__fila-label">Generada</span>
        <span className="tiquete-58__fila-valor">{FECHA_HORA.format(new Date(colilla.generadaEn))}</span>
      </div>

      <div className="tiquete-58__linea-solida" />

      <div className="tiquete-58__total">
        <span>TOTAL</span>
        <span>{COP.format(colilla.monto)}</span>
      </div>

      <div className="tiquete-58__linea" />

      <p className="tiquete-58__pie">Gracias por su trabajo</p>
    </div>,
    document.body,
  )
}
