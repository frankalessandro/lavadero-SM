import { useEffect, useRef, type ComponentType, type ReactNode } from 'react'
import { Printer } from 'lucide-react'
import { Modal } from './Modal'
import { Button } from './Button'

export interface DatoComprobante {
  label: string
  valor: ReactNode
  mono?: boolean
  /** Ocupa las dos columnas (textos largos: descripción, motivo, adicionales). */
  ancho?: boolean
}

type Tono = 'primary' | 'success' | 'warning'

const TONO_TOTAL: Record<Tono, string> = {
  primary: 'text-primary-700',
  success: 'text-success-700',
  warning: 'text-warning-700',
}

// Vista en pantalla de TODOS los tiquetes y comprobantes (lavado, venta, parqueadero, egreso,
// préstamo, colillas) — rediseño 2026-10-28: antes eran 7 modales con su propio armazón casi
// idéntico. Cada uno solo describe sus datos; la impresión térmica de 58mm sigue siendo un
// componente propio de cada comprobante (`impresion`, un portal a document.body con las clases
// `tiquete-58`), que es lo que sale en papel y no cambia con esto.
//
// Jerarquía: cifra principal grande arriba → datos en grilla de 2 columnas → desgloses (productos,
// pago partido, combos, deuda) → pie con Imprimir y la acción de cerrar.
export function ComprobanteModal({
  titulo,
  referencia,
  subtitulo,
  icon,
  tono = 'primary',
  total,
  aviso,
  datos = [],
  children,
  imprimirLabel = 'Imprimir',
  cerrarLabel = 'Cerrar',
  onClose,
  autoPrint = false,
  impresion,
}: {
  titulo: string
  /** Número del comprobante (LAV-12, VTA-30, PAR-4…) — va como etiqueta junto al título. */
  referencia?: string
  subtitulo?: ReactNode
  icon: ComponentType<{ size?: number; strokeWidth?: number }>
  tono?: Tono
  /** La cifra principal: total pagado, monto del egreso, valor prestado, total liquidado… */
  total: { label: string; valor: string; nota?: ReactNode }
  /** Franja de aviso arriba (ej. colilla informativa: "No es un pago"). */
  aviso?: ReactNode
  datos?: DatoComprobante[]
  /** Desgloses extra debajo de los datos (ComprobanteDesglose). */
  children?: ReactNode
  imprimirLabel?: string
  cerrarLabel?: string
  onClose: () => void
  /** Dispara `window.print()` al montar (ej. al confirmar un cobro). Con Chrome en
   * `--kiosk-printing` imprime directo a la impresora por defecto, sin diálogo. */
  autoPrint?: boolean
  /** El tiquete térmico que se imprime (portal propio de cada comprobante). */
  impresion: ReactNode
}) {
  // Guarda contra el doble-invoke de efectos de StrictMode en desarrollo (monta→limpia→monta):
  // sin esto `window.print()` se disparaba dos veces seguidas al abrir con autoPrint.
  const impresoRef = useRef(false)
  useEffect(() => {
    if (autoPrint && !impresoRef.current) {
      impresoRef.current = true
      window.print()
    }
    // Solo al montar: cada apertura es una instancia nueva.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <>
      <Modal
        title={
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate">{titulo}</span>
            {referencia ? (
              <span className="shrink-0 rounded-md bg-neutral-100 px-2 py-0.5 font-mono text-xs font-semibold text-neutral-600">
                {referencia}
              </span>
            ) : null}
          </span>
        }
        subtitle={subtitulo}
        icon={icon}
        tone={tono}
        onClose={onClose}
        footerInfo={<span className="text-xs text-neutral-400">Impresión para POS térmica de 58mm</span>}
        footer={
          <>
            <Button icon={Printer} onClick={() => window.print()}>
              {imprimirLabel}
            </Button>
            <Button variant="primary" onClick={onClose}>
              {cerrarLabel}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-5">
          {aviso ? <p className="rounded-xl bg-warning-50 px-3 py-2.5 text-xs font-medium text-warning-700">{aviso}</p> : null}

          <div className="flex flex-col gap-0.5">
            <span className="text-[11px] font-semibold tracking-wide text-neutral-500 uppercase">{total.label}</span>
            <span className={`text-3xl font-bold tracking-tight ${TONO_TOTAL[tono]}`}>{total.valor}</span>
            {total.nota ? <span className="mt-1 text-xs text-neutral-500">{total.nota}</span> : null}
          </div>

          {datos.length > 0 ? (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl border border-neutral-100 p-4">
              {datos.map((d) => (
                <div key={d.label} className={`flex min-w-0 flex-col gap-0.5 ${d.ancho ? 'col-span-2' : ''}`}>
                  <dt className="text-[11px] font-medium tracking-wide text-neutral-400 uppercase">{d.label}</dt>
                  <dd className={`min-w-0 text-sm font-medium break-words text-neutral-900 ${d.mono ? 'font-mono' : ''}`}>{d.valor}</dd>
                </div>
              ))}
            </dl>
          ) : null}

          {children}
        </div>
      </Modal>
      {impresion}
    </>
  )
}

// Desglose con título dentro de un comprobante: productos, pago partido, combos, deuda. Cada línea
// es `[label, valor]`; `total` agrega una línea final en negrita separada.
export function ComprobanteDesglose({
  titulo,
  lineas,
  total,
}: {
  titulo: ReactNode
  lineas: { label: ReactNode; valor: string; tenue?: boolean }[]
  total?: { label: ReactNode; valor: string }
}) {
  if (lineas.length === 0 && !total) return null
  return (
    <section className="flex flex-col gap-2">
      <h4 className="text-[11px] font-semibold tracking-wide text-neutral-500 uppercase">{titulo}</h4>
      <ul className="flex flex-col divide-y divide-neutral-100 rounded-xl border border-neutral-100 text-sm">
        {lineas.map((l, i) => (
          <li key={i} className="flex items-center justify-between gap-3 px-3 py-2">
            <span className={`min-w-0 ${l.tenue ? 'text-neutral-500' : 'text-neutral-700'}`}>{l.label}</span>
            <span className={`shrink-0 font-medium ${l.tenue ? 'text-neutral-500' : 'text-neutral-900'}`}>{l.valor}</span>
          </li>
        ))}
        {total ? (
          <li className="flex items-center justify-between gap-3 bg-neutral-50/70 px-3 py-2 font-semibold text-neutral-900">
            <span>{total.label}</span>
            <span>{total.valor}</span>
          </li>
        ) : null}
      </ul>
    </section>
  )
}
