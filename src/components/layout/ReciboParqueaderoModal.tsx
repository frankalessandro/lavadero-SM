import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Printer } from 'lucide-react'
import logoMark from '../../assets/logo-mark.png'
import { METODO_PAGO_LABEL } from '../../lib/metodoPago'
import {
  CLASE_VEHICULO_LABEL,
  type EstanciaParqueadero,
  type ModalidadParqueadero,
} from '../../schemas/estanciaParqueadero'
import { EncabezadoTiquete } from './EncabezadoTiquete'
import { useAjustesNegocio } from '../../lib/useAjustesNegocio'

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

// Tiquete de ingreso y recibo de salida del parqueadero (Plan M4) — mismo diseño que el
// comprobante del lavadero (ReciboModal), numerado PAR-n con el consecutivo de 0075.
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
  const impresoRef = useRef(false)

  useEffect(() => {
    if (autoPrint && !impresoRef.current) {
      impresoRef.current = true
      window.print()
    }
    // Solo al montar: cada apertura es una instancia nueva.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const negocio = useAjustesNegocio()
  const cobro = estancia.cobro ?? 0
  const tarifa = cobro - estancia.multa

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-neutral-900/40 backdrop-blur-[2px] sm:items-center sm:p-4">
      <div className="custom-scroll flex max-h-[92vh] w-full max-w-sm flex-col overflow-y-auto rounded-t-3xl bg-white shadow-card-hover sm:max-h-[88vh] sm:rounded-2xl">
        <div className={`h-2 shrink-0 ${esSalida ? 'bg-success-600' : 'bg-primary-600'}`} />
        <div className="flex flex-col items-center gap-1.5 px-6 pt-6 pb-4 text-center">
          <img src={logoMark} alt={negocio.nombre} className="size-11 shrink-0 object-contain" />
          <p className="mt-1 text-sm font-semibold text-neutral-900">{negocio.nombre} · Parqueadero</p>
          <p className="text-xs text-neutral-400">{esSalida ? 'Recibo de salida' : 'Tiquete de ingreso'}</p>
        </div>

        <div className="flex flex-col items-center gap-0.5 border-y border-dashed border-neutral-200 bg-neutral-50 px-6 py-4">
          <span className="text-xs font-medium uppercase tracking-wide text-neutral-400">Placa</span>
          <span className="font-mono text-2xl font-bold tracking-wider text-neutral-900">{estancia.placa}</span>
          <span className="font-mono text-xs text-primary-700">PAR-{estancia.consecutivo}</span>
        </div>

        <div className="flex flex-col gap-2.5 px-6 py-5 text-sm">
          <Fila label="Vehículo" valor={CLASE_VEHICULO_LABEL[estancia.claseVehiculo]} />
          <Fila label="Modalidad" valor={MODALIDAD_LABEL[estancia.modalidad]} />
          <Fila label="Ingreso" valor={FECHA_HORA.format(new Date(estancia.horaIngreso))} />
          {esSalida && estancia.horaSalida ? (
            <Fila label="Salida" valor={FECHA_HORA.format(new Date(estancia.horaSalida))} />
          ) : null}
          {esSalida && estancia.metodoPago ? <Fila label="Pago" valor={METODO_PAGO_LABEL[estancia.metodoPago]} /> : null}

          {esSalida && estancia.multa > 0 ? (
            <div className="mt-1 flex flex-col gap-1.5 rounded-lg bg-neutral-50 px-3 py-2.5">
              <Fila label="Tarifa" valor={COP.format(tarifa)} />
              <Fila label="Multa · salida fuera de ventana" valor={COP.format(estancia.multa)} />
            </div>
          ) : null}

          <div
            className={`mt-1 flex items-center justify-between rounded-lg px-3 py-3 ${esSalida ? 'bg-success-50' : 'bg-primary-50'}`}
          >
            <span className={`text-sm font-medium ${esSalida ? 'text-success-700' : 'text-primary-900'}`}>
              {esSalida ? (cobro > 0 ? 'Total pagado' : 'Sin cobro') : 'Tarifa'}
            </span>
            <span className={`text-xl font-bold ${esSalida ? 'text-success-700' : 'text-primary-700'}`}>
              {esSalida ? COP.format(cobro) : estancia.modalidad === 'noche' ? COP.format(tarifaNoche ?? 0) : 'Incluida'}
            </span>
          </div>
          <p className="text-center text-xs text-neutral-400">{aviso(estancia, esSalida)}</p>
        </div>

        <div className="border-t border-dashed border-neutral-200 px-6 pt-4 pb-6">
          <button
            type="button"
            onClick={() => window.print()}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-neutral-200 bg-white py-3 text-sm font-semibold text-neutral-700 transition-colors hover:bg-neutral-50"
          >
            <Printer size={16} /> Imprimir
          </button>
          <button
            type="button"
            onClick={onClose}
            className={`mt-2.5 w-full rounded-xl py-3.5 text-sm font-semibold text-white shadow-nav-active transition-colors ${
              esSalida ? 'bg-success-600 hover:bg-success-700' : 'bg-primary-600 hover:bg-primary-700'
            }`}
          >
            Listo
          </button>
        </div>
      </div>
      <TiqueteParqueaderoPrint estancia={estancia} esSalida={esSalida} tarifaNoche={tarifaNoche} />
    </div>
  )
}

function aviso(estancia: EstanciaParqueadero, esSalida: boolean): string {
  if (esSalida) return (estancia.cobro ?? 0) > 0 ? 'Vehículo retirado — pago confirmado.' : 'Vehículo retirado.'
  if (estancia.modalidad === 'fijo') return 'Fijo 24h: entradas y salidas sin cobro por movimiento.'
  return 'Se cobra al retirar el vehículo. Retiro entre 7:00 y 8:00 am.'
}

function Fila({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="min-w-0 text-neutral-500">{label}</span>
      <span className="min-w-0 truncate text-right font-medium text-neutral-900">{valor}</span>
    </div>
  )
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
