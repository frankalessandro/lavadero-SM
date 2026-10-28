import { FileText } from 'lucide-react'
import { createPortal } from 'react-dom'
import type { GastoConCategoria } from '../../data/gastos'
import { EncabezadoTiquete } from './EncabezadoTiquete'
import { ComprobanteModal } from './ComprobanteModal'

const COP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })
const FECHA = new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium' })
const FECHA_HORA = new Intl.DateTimeFormat('es-CO', { dateStyle: 'short', timeStyle: 'short' })

// Referencia corta y estable para el comprobante — no hay consecutivo de gastos en BD (a
// diferencia de LAV-/VTA-, ver CLAUDE.md), así que se deriva del id (uuid) en vez de inventar
// una numeración que no existe en el dato real.
function referencia(gasto: GastoConCategoria): string {
  return `EGR-${gasto.id.slice(0, 8).toUpperCase()}`
}

// Comprobante de egreso para un gasto ya registrado — vista con ComprobanteModal; lo que se
// imprime es ComprobanteEgresoPrint (térmica 58mm, con bloques de firma para quien emite y quien
// recibe).
export function ComprobanteEgresoModal({ gasto, onClose }: { gasto: GastoConCategoria; onClose: () => void }) {
  return (
    <ComprobanteModal
      titulo="Comprobante de egreso"
      referencia={referencia(gasto)}
      icon={FileText}
      total={{
        label: 'Monto del egreso',
        valor: COP.format(gasto.monto),
        nota: 'Al imprimir queda espacio para la firma de quien emite el egreso y de quien lo recibe.',
      }}
      datos={[
        { label: 'Fecha', valor: FECHA.format(new Date(`${gasto.fecha}T00:00:00`)) },
        { label: 'Categoría', valor: gasto.categoriaNombre },
        { label: 'Descripción', valor: gasto.descripcion, ancho: true },
        { label: 'Responsable', valor: gasto.responsable },
        { label: 'Origen', valor: gasto.origen === 'caja' ? 'Caja' : 'Otro' },
      ]}
      imprimirLabel="Imprimir comprobante"
      onClose={onClose}
      impresion={<ComprobanteEgresoPrint gasto={gasto} />}
    />
  )
}

// Marcado plano fuera de Tailwind para la térmica de 58mm (clases .tiquete-58__*, ver
// src/styles/tiquete-print.css) — se porta a document.body para que @media print oculte #root.
function ComprobanteEgresoPrint({ gasto }: { gasto: GastoConCategoria }) {
  return createPortal(
    <div className="tiquete-58">
      <EncabezadoTiquete titulo="Comprobante de egreso" />

      <div className="tiquete-58__linea-solida" />

      <Fila label="No." valor={referencia(gasto)} />
      <Fila label="Fecha" valor={FECHA.format(new Date(`${gasto.fecha}T00:00:00`))} />
      <Fila label="Registrado" valor={FECHA_HORA.format(new Date(gasto.creadoEn))} />

      <div className="tiquete-58__linea" />

      <p className="tiquete-58__seccion">Detalle</p>
      <Fila label="Categoría" valor={gasto.categoriaNombre} />
      <Fila label="Origen" valor={gasto.origen === 'caja' ? 'Caja' : 'Otro'} />
      <p className="tiquete-58__fila-label">Concepto</p>
      <p className="tiquete-58__texto">{gasto.descripcion}</p>

      <div className="tiquete-58__linea-solida" />

      <div className="tiquete-58__total">
        <span>TOTAL</span>
        <span>{COP.format(gasto.monto)}</span>
      </div>

      <div className="tiquete-58__linea" />

      <BloqueFirma rol="Emite" nombre={gasto.responsable} />
      <BloqueFirma rol="Recibe" />

      <p className="tiquete-58__pie-legal">Comprobante interno de egreso</p>
    </div>,
    document.body,
  )
}

// Emite: Nombre / C.C. ____ / Firma / raya completa. Sin nombre, el nombre también queda en raya.
export function BloqueFirma({ rol, nombre }: { rol: string; nombre?: string }) {
  return (
    <div className="tiquete-58__firma">
      <div className="tiquete-58__firma-campo">
        <span className="tiquete-58__firma-campo-label">{rol}:</span>
        {nombre ? (
          <span className="tiquete-58__firma-campo-valor">{nombre}</span>
        ) : (
          <span className="tiquete-58__raya" />
        )}
      </div>
      <div className="tiquete-58__firma-campo">
        <span className="tiquete-58__firma-campo-label">C.C.</span>
        <span className="tiquete-58__raya" />
      </div>
      <p className="tiquete-58__firma-label">Firma</p>
      <div className="tiquete-58__firma-espacio" />
    </div>
  )
}

export function Fila({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="tiquete-58__fila">
      <span className="tiquete-58__fila-label">{label}</span>
      <span className="tiquete-58__fila-valor">{valor}</span>
    </div>
  )
}
