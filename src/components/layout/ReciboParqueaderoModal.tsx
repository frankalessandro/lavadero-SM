import { createPortal } from 'react-dom'
import { Car } from 'lucide-react'
import { METODO_PAGO_LABEL } from '../../lib/metodoPago'
import {
  CLASE_VEHICULO_LABEL,
  type EstanciaParqueadero,
  type ModalidadParqueadero,
} from '../../schemas/estanciaParqueadero'
import { EncabezadoTiquete } from './EncabezadoTiquete'
import { ComprobanteDesglose, ComprobanteModal, type DatoComprobante } from './ComprobanteModal'

const COP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })
const FECHA_HORA = new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short' })
const FECHA = new Intl.DateTimeFormat('es-CO', { dateStyle: 'short' })
const HORA = new Intl.DateTimeFormat('es-CO', { timeStyle: 'short' })

const MODALIDAD_LABEL: Record<ModalidadParqueadero, string> = {
  noche: 'Noche',
  mensualidad: 'Mensualidad',
  fijo: 'Fijo 24h',
}

export type VarianteReciboParqueadero = 'ingreso' | 'salida'

// Tiquete de ingreso y recibo de salida del parqueadero (Plan M4), numerado PAR-n con el
// consecutivo de 0075 — vista con ComprobanteModal; lo que se imprime es TiqueteParqueaderoPrint.
export function ReciboParqueaderoModal({
  estancia,
  variant,
  tarifaNoche,
  onClose,
  autoPrint,
}: {
  estancia: EstanciaParqueadero
  variant: VarianteReciboParqueadero
  /** Solo para el ingreso en modalidad noche: cuánto se va a cobrar al retiro. */
  tarifaNoche?: number
  onClose: () => void
  autoPrint?: boolean
}) {
  const esSalida = variant === 'salida'
  const cobro = estancia.cobro ?? 0
  const tarifa = cobro - estancia.multa

  const datos: DatoComprobante[] = [
    { label: 'Placa', valor: estancia.placa, mono: true },
    { label: 'Vehículo', valor: CLASE_VEHICULO_LABEL[estancia.claseVehiculo] },
    { label: 'Modalidad', valor: MODALIDAD_LABEL[estancia.modalidad] },
    { label: 'Ingreso', valor: FECHA_HORA.format(new Date(estancia.horaIngreso)) },
  ]
  if (esSalida && estancia.horaSalida) datos.push({ label: 'Salida', valor: FECHA_HORA.format(new Date(estancia.horaSalida)) })
  if (esSalida && estancia.metodoPago) datos.push({ label: 'Pago', valor: METODO_PAGO_LABEL[estancia.metodoPago] })

  return (
    <ComprobanteModal
      titulo={esSalida ? 'Recibo de salida' : 'Tiquete de ingreso'}
      referencia={`PAR-${estancia.consecutivo}`}
      subtitulo="Parqueadero"
      icon={Car}
      tono={esSalida ? 'success' : 'primary'}
      total={{
        label: esSalida ? (cobro > 0 ? 'Total pagado' : 'Sin cobro') : 'Tarifa',
        valor: esSalida ? COP.format(cobro) : estancia.modalidad === 'noche' ? COP.format(tarifaNoche ?? 0) : 'Incluida',
        nota: aviso(estancia, esSalida),
      }}
      datos={datos}
      cerrarLabel="Listo"
      onClose={onClose}
      autoPrint={autoPrint}
      impresion={<TiqueteParqueaderoPrint estancia={estancia} esSalida={esSalida} tarifaNoche={tarifaNoche} />}
    >
      {esSalida && estancia.multa > 0 ? (
        <ComprobanteDesglose
          titulo="Detalle"
          lineas={[
            { label: 'Tarifa', valor: COP.format(tarifa) },
            { label: 'Multa · salida fuera de ventana', valor: COP.format(estancia.multa) },
          ]}
        />
      ) : null}
    </ComprobanteModal>
  )
}

function aviso(estancia: EstanciaParqueadero, esSalida: boolean): string {
  if (esSalida) return (estancia.cobro ?? 0) > 0 ? 'Vehículo retirado — pago confirmado.' : 'Vehículo retirado.'
  if (estancia.modalidad === 'fijo') return 'Fijo 24h: entradas y salidas sin cobro por movimiento.'
  return 'Se cobra al retirar el vehículo. Retiro entre 7:00 y 8:00 am.'
}

// Marcado plano para la térmica de 58mm (estilos en src/styles/tiquete-print.css), portado a
// document.body igual que TiquetePrint: en @media print solo se oculta #root.
function TiqueteParqueaderoPrint({
  estancia,
  esSalida,
  tarifaNoche,
}: {
  estancia: EstanciaParqueadero
  esSalida: boolean
  tarifaNoche?: number
}) {
  const fecha = new Date(esSalida && estancia.horaSalida ? estancia.horaSalida : estancia.horaIngreso)
  const cobro = estancia.cobro ?? 0
  return createPortal(
    <div className="tiquete-58">
      <EncabezadoTiquete titulo={esSalida ? 'Recibo de salida' : 'Tiquete de ingreso'} />
      <div className="tiquete-58__linea-solida" />
      <TiqueteFila label="No." valor={`PAR-${estancia.consecutivo}`} />
      <TiqueteFila label={esSalida ? 'Salida' : 'Ingreso'} valor={`${FECHA.format(fecha)} ${HORA.format(fecha)}`} />
      <div className="tiquete-58__linea" />
      <div className="tiquete-58__placa">{estancia.placa}</div>
      <TiqueteFila label="Vehículo" valor={CLASE_VEHICULO_LABEL[estancia.claseVehiculo]} />
      <TiqueteFila label="Modalidad" valor={MODALIDAD_LABEL[estancia.modalidad]} />
      {esSalida ? (
        <TiqueteFila
          label="Ingresó"
          valor={`${FECHA.format(new Date(estancia.horaIngreso))} ${HORA.format(new Date(estancia.horaIngreso))}`}
        />
      ) : null}
      {esSalida && estancia.multa > 0 ? (
        <>
          <TiqueteFila label="Tarifa" valor={COP.format(cobro - estancia.multa)} />
          <TiqueteFila label="Multa" valor={COP.format(estancia.multa)} />
        </>
      ) : null}
      {esSalida && estancia.metodoPago ? <TiqueteFila label="Pago" valor={METODO_PAGO_LABEL[estancia.metodoPago]} /> : null}
      <div className="tiquete-58__linea-solida" />
      <div className="tiquete-58__total">
        <span>{esSalida ? 'TOTAL PAGADO' : 'TARIFA'}</span>
        <span>{esSalida ? COP.format(cobro) : estancia.modalidad === 'noche' ? COP.format(tarifaNoche ?? 0) : 'Incluida'}</span>
      </div>
      <p className="tiquete-58__aviso">{aviso(estancia, esSalida)}</p>
      <p className="tiquete-58__pie">Conserve este tiquete</p>
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
