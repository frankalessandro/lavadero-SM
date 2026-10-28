import { useRef, useState } from 'react'
import { Car, Wallet } from 'lucide-react'
import { CurrencyInput } from './CurrencyInput'
import { Modal } from './Modal'
import { Button } from './Button'
import { TarjetasBolsa } from '../deudas/TarjetasBolsa'
import { toast } from '../../lib/toast'
import type { BolsaDeuda, DescuentoDeuda, SaldoDeuda } from '../../schemas/deudaPersonal'

const COP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })

// Confirmación de "Generar liquidación" (lavador o jefe de patio). Si la persona debe algo, admin
// ELIGE cuánto descontar en este corte (decisión de Alessandro, 2026-09-15): nada, parcial o todo
// lo que alcance la comisión. Arranca en el máximo — visible y editable, nunca en silencio. Desde
// 0089 se elige por bolsa (préstamos y tienda); el máximo cubre préstamos primero.
export function GenerarLiquidacionModal({
  titulo,
  resumen,
  nombre,
  comisionBruta,
  deuda,
  onVerPlacas,
  cargandoPlacas = false,
  onConfirm,
  onCancel,
}: {
  titulo: string
  resumen: string
  nombre: string
  comisionBruta: number
  deuda: SaldoDeuda
  /** Abre el listado de placas que entran en este corte (solo lavadores). */
  onVerPlacas?: () => void
  cargandoPlacas?: boolean
  onConfirm: (deudaADescontar: DescuentoDeuda) => Promise<void>
  onCancel: () => void
}) {
  const debe = { prestamo: Math.max(0, deuda.prestamo), tienda: Math.max(0, deuda.tienda) }
  const deudaPendiente = debe.prestamo + debe.tienda
  const maximoPrestamo = Math.min(debe.prestamo, Math.max(0, comisionBruta))
  const maximoTienda = Math.min(debe.tienda, Math.max(0, comisionBruta - maximoPrestamo))
  const [descuento, setDescuento] = useState<Record<BolsaDeuda, string>>({
    prestamo: String(maximoPrestamo),
    tienda: String(maximoTienda),
  })
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const enVueloRef = useRef(false)

  const valor = { prestamo: Number(descuento.prestamo || 0), tienda: Number(descuento.tienda || 0) }
  const totalDescuento = valor.prestamo + valor.tienda
  const neto = comisionBruta - totalDescuento
  const excede = totalDescuento > comisionBruta || valor.prestamo > debe.prestamo || valor.tienda > debe.tienda

  async function confirmar() {
    if (enVueloRef.current) return
    for (const bolsa of ['prestamo', 'tienda'] as const) {
      if (valor[bolsa] < 0 || valor[bolsa] > debe[bolsa]) {
        setError(`El descuento de ${bolsa === 'prestamo' ? 'préstamos' : 'tienda'} debe estar entre ${COP.format(0)} y ${COP.format(debe[bolsa])}`)
        return
      }
    }
    if (totalDescuento > comisionBruta) {
      setError(`El descuento total no puede pasar la comisión del corte (${COP.format(comisionBruta)})`)
      return
    }
    setError(null)
    enVueloRef.current = true
    setSaving(true)
    try {
      await onConfirm({ prestamo: Math.round(valor.prestamo), tienda: Math.round(valor.tienda) })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo generar la liquidación')
      toast.desdeError(err, 'No se pudo generar la liquidación')
    } finally {
      enVueloRef.current = false
      setSaving(false)
    }
  }

  return (
    <Modal
      title={titulo}
      subtitle={nombre}
      icon={Wallet}
      onClose={onCancel}
      footer={
        <>
          <Button variant="ghost" onClick={onCancel}>
            Cancelar
          </Button>
          <Button variant="primary" loading={saving} disabled={excede} onClick={confirmar}>
            Generar · pagar {COP.format(Math.max(0, neto))}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <p className="text-sm text-neutral-600">{resumen}</p>
          {onVerPlacas ? (
            <button
              type="button"
              onClick={onVerPlacas}
              disabled={cargandoPlacas}
              className="inline-flex items-center gap-1.5 self-start text-sm font-medium text-primary-600 transition-colors hover:text-primary-800 disabled:opacity-50"
            >
              <Car size={15} />
              {cargandoPlacas ? 'Cargando placas…' : 'Ver las placas de este corte'}
            </button>
          ) : null}
        </div>

        {deudaPendiente > 0 ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-3">
              <h4 className="text-sm font-semibold text-neutral-900">Descontar deuda</h4>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => setDescuento({ prestamo: '0', tienda: '0' })}
                  className="rounded-full border border-neutral-200 px-2.5 py-1 text-xs font-medium text-neutral-600 transition-colors hover:bg-neutral-50"
                >
                  Nada
                </button>
                <button
                  type="button"
                  onClick={() => setDescuento({ prestamo: String(maximoPrestamo), tienda: String(maximoTienda) })}
                  className="rounded-full border border-neutral-200 px-2.5 py-1 text-xs font-medium text-neutral-600 transition-colors hover:border-primary-300 hover:bg-primary-50 hover:text-primary-700"
                >
                  Todo lo posible
                </button>
              </div>
            </div>
            <p className="text-xs text-neutral-500">
              Debe {COP.format(deudaPendiente)}. Elige cuánto sale de este corte en cada bolsa.
            </p>
            <TarjetasBolsa
              saldo={deuda}
              extra={(bolsa) => (
                <label className="flex flex-col gap-1 text-xs">
                  <span className="font-medium text-neutral-600">Descontar</span>
                  <CurrencyInput
                    size="sm"
                    value={descuento[bolsa]}
                    onChange={(v) => setDescuento((d) => ({ ...d, [bolsa]: v }))}
                  />
                  {valor[bolsa] > debe[bolsa] ? (
                    <span className="text-danger-600">Máximo {COP.format(debe[bolsa])}</span>
                  ) : null}
                </label>
              )}
            />
          </div>
        ) : null}

        <div className="flex flex-col gap-1 rounded-xl bg-neutral-50 px-4 py-3 text-sm">
          <div className="flex justify-between text-neutral-600">
            <span>Comisión del corte</span>
            <span className="font-mono">{COP.format(comisionBruta)}</span>
          </div>
          {valor.prestamo > 0 ? (
            <div className="flex justify-between text-neutral-600">
              <span>− Préstamos</span>
              <span className="font-mono">{COP.format(valor.prestamo)}</span>
            </div>
          ) : null}
          {valor.tienda > 0 ? (
            <div className="flex justify-between text-neutral-600">
              <span>− Tienda</span>
              <span className="font-mono">{COP.format(valor.tienda)}</span>
            </div>
          ) : null}
          <div className="mt-1 flex justify-between border-t border-neutral-200 pt-1.5 text-base font-semibold text-neutral-900">
            <span>Se le paga</span>
            <span className={`font-mono ${neto < 0 ? 'text-danger-600' : ''}`}>{COP.format(Math.max(0, neto))}</span>
          </div>
          {deudaPendiente > 0 ? (
            <p className="text-xs text-neutral-500">
              Queda debiendo: préstamos {COP.format(Math.max(0, debe.prestamo - valor.prestamo))} · tienda{' '}
              {COP.format(Math.max(0, debe.tienda - valor.tienda))}
            </p>
          ) : null}
          {totalDescuento > comisionBruta ? (
            <p className="text-xs text-danger-600">El descuento pasa la comisión del corte ({COP.format(comisionBruta)}).</p>
          ) : null}
        </div>

        {error ? <p className="rounded-lg bg-danger-50 px-3 py-2.5 text-sm text-danger-700">{error}</p> : null}
      </div>
    </Modal>
  )
}
