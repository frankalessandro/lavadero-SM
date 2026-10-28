import { useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { HandCoins } from 'lucide-react'
import { fetchSaldoDeuda, registrarAbono, type DeudaPersonal } from '../../data/deudasPersonal'
import {
  abonoInputSchema,
  BOLSA_DEUDA_LABEL,
  type BolsaDeuda,
  type Deudor,
  type MetodoAbono,
} from '../../schemas/deudaPersonal'
import { Modal } from '../layout/Modal'
import { Button } from '../layout/Button'
import { CustomSelect } from '../layout/CustomSelect'
import { CurrencyInput } from '../layout/CurrencyInput'
import { toast } from '../../lib/toast'
import { TarjetasBolsa } from './TarjetasBolsa'

const COP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })

const claveDeudor = (d: Deudor) => `${d.tipo === 'lavador' ? 'l' : 'p'}:${d.id}`
const deudorDeClave = (clave: string): Deudor | undefined =>
  clave ? { tipo: clave.startsWith('l:') ? 'lavador' : 'persona', id: clave.slice(2) } : undefined

// Recibir un abono a préstamos o a tienda (0089) — el mismo modal en la caja del jefe de patio, en
// la cuenta abierta de un trabajador (Ventas) y en Dinero › Deudas de gerencia.
//   · Efectivo a la caja: entra al cajón del turno abierto y suma al arqueo (el servidor exige turno).
//   · Directo a gerencia: no toca caja; se explica cómo se pagó.
// Abonar a tienda pasa primero a la deuda lo que tenga en su cuenta abierta (la cuenta sigue abierta).
export function AbonoDeudaModal({
  deudor: deudorFijo,
  nombre,
  opcionesDeudor,
  bolsaInicial = 'prestamo',
  soloBolsa,
  metodoInicial = 'efectivo',
  turnoAbierto,
  responsable,
  onClose,
  onRegistrado,
}: {
  /** Persona fija (cuenta de un trabajador, detalle de deudas). Sin ella se elige de `opcionesDeudor`. */
  deudor?: Deudor
  nombre?: string
  opcionesDeudor?: { value: string; label: string }[]
  bolsaInicial?: BolsaDeuda
  /** Abono fijo a una bolsa (desde la cuenta abierta de un trabajador solo se abona a tienda). */
  soloBolsa?: BolsaDeuda
  metodoInicial?: MetodoAbono
  /** false = no hay turno de caja abierto: el efectivo no se puede recibir. undefined = no se sabe aquí. */
  turnoAbierto?: boolean
  /** Quién recibe, solo para mostrarlo (el servidor lo fija). */
  responsable?: string
  onClose: () => void
  onRegistrado?: (movimiento: DeudaPersonal) => void
}) {
  const queryClient = useQueryClient()
  const [deudorClave, setDeudorClave] = useState(deudorFijo ? claveDeudor(deudorFijo) : '')
  const deudor = deudorFijo ?? deudorDeClave(deudorClave)
  const [bolsa, setBolsa] = useState<BolsaDeuda>(soloBolsa ?? bolsaInicial)
  const [metodo, setMetodo] = useState<MetodoAbono>(turnoAbierto === false ? 'fuera' : metodoInicial)
  const [monto, setMonto] = useState('')
  const [motivo, setMotivo] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const enVueloRef = useRef(false)

  const saldoQuery = useQuery({
    queryKey: ['deudas', 'saldo', deudorClave],
    queryFn: () => fetchSaldoDeuda(deudor as Deudor),
    enabled: Boolean(deudor),
  })
  const saldo = saldoQuery.data
  const debeEnBolsa = saldo ? Math.max(0, saldo[bolsa]) : 0
  const valor = Number(monto || 0)
  const nombreMostrado =
    nombre ?? opcionesDeudor?.find((o) => o.value === deudorClave)?.label.split(' · ')[0] ?? 'la persona'

  // Si la bolsa elegida quedó en $0 al cargar el saldo, pasa a la otra (salvo que sea fija).
  if (!soloBolsa && saldo && debeEnBolsa === 0) {
    const otra: BolsaDeuda = bolsa === 'prestamo' ? 'tienda' : 'prestamo'
    if (saldo[otra] > 0) setBolsa(otra)
  }

  async function confirmar() {
    if (enVueloRef.current) return
    if (!deudor) {
      setError('Selecciona quién abona')
      return
    }
    if (valor > debeEnBolsa) {
      setError(`En ${BOLSA_DEUDA_LABEL[bolsa].toLowerCase()} debe ${COP.format(debeEnBolsa)} — el abono no puede pasar de ahí`)
      return
    }
    const parsed = abonoInputSchema.safeParse({ deudor, monto: valor, metodo, bolsa, motivo: motivo.trim() || undefined })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Revisa el abono')
      return
    }
    setError(null)
    enVueloRef.current = true
    setSaving(true)
    try {
      const creado = await registrarAbono(parsed.data)
      await queryClient.invalidateQueries({ queryKey: ['deudas'] })
      toast.exito(`Abono de ${COP.format(valor)} a ${BOLSA_DEUDA_LABEL[bolsa].toLowerCase()} recibido`)
      onRegistrado?.(creado)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar el abono')
      toast.desdeError(err, 'No se pudo registrar el abono')
      enVueloRef.current = false
      setSaving(false)
    }
  }

  return (
    <Modal
      title={soloBolsa ? `Abono a ${BOLSA_DEUDA_LABEL[soloBolsa].toLowerCase()}` : 'Recibir abono'}
      subtitle={deudorFijo ? nombreMostrado : 'Préstamos o tienda'}
      icon={HandCoins}
      tone="success"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" loading={saving} disabled={!deudor || valor <= 0} onClick={confirmar}>
            Recibir {valor > 0 ? COP.format(valor) : 'abono'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        {deudorFijo ? null : (
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-neutral-700">¿Quién abona?</span>
            <CustomSelect
              size="sm"
              value={deudorClave}
              onChange={(v) => {
                setDeudorClave(v)
                setMonto('')
                setError(null)
              }}
              placeholder="Lavador, jefe de patio o gerencia"
              options={opcionesDeudor ?? []}
            />
          </label>
        )}

        {deudor ? (
          <>
            {soloBolsa ? (
              <div className="flex items-center justify-between gap-3 rounded-xl border border-neutral-200 px-4 py-3">
                <div className="flex min-w-0 flex-col">
                  <span className="text-xs font-medium text-neutral-500">Debe en {BOLSA_DEUDA_LABEL[soloBolsa].toLowerCase()}</span>
                  {soloBolsa === 'tienda' && saldo && saldo.enCuenta > 0 && saldo.enCuenta !== saldo.tienda ? (
                    <span className="text-[11px] text-neutral-400">
                      {COP.format(saldo.enCuenta)} en cuenta abierta + {COP.format(saldo.tienda - saldo.enCuenta)} de antes
                    </span>
                  ) : null}
                </div>
                <span className="font-mono text-xl font-bold text-neutral-900">{saldo ? COP.format(debeEnBolsa) : '…'}</span>
              </div>
            ) : (
              <div className="flex flex-col gap-1.5 text-sm">
                <span className="font-medium text-neutral-700">¿A qué abona?</span>
                <TarjetasBolsa
                  saldo={saldo}
                  seleccionada={bolsa}
                  onSeleccionar={(b) => {
                    setBolsa(b)
                    setMonto('')
                    setError(null)
                  }}
                />
                {saldo && saldo.total === 0 ? (
                  <span className="text-xs text-success-700">{nombreMostrado} está al día — no tiene nada que abonar.</span>
                ) : null}
              </div>
            )}

            <div className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-neutral-700">Monto</span>
              <CurrencyInput size="sm" value={monto} onChange={setMonto} />
              {debeEnBolsa > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => setMonto(String(debeEnBolsa))}
                    className="rounded-full border border-neutral-200 px-2.5 py-1 text-xs font-medium text-neutral-600 transition-colors hover:border-primary-300 hover:bg-primary-50 hover:text-primary-700"
                  >
                    Todo · {COP.format(debeEnBolsa)}
                  </button>
                  {debeEnBolsa >= 2000 ? (
                    <button
                      type="button"
                      onClick={() => setMonto(String(Math.round(debeEnBolsa / 2 / 100) * 100))}
                      className="rounded-full border border-neutral-200 px-2.5 py-1 text-xs font-medium text-neutral-600 transition-colors hover:border-primary-300 hover:bg-primary-50 hover:text-primary-700"
                    >
                      La mitad
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-neutral-700">¿Cómo paga?</span>
              <div className="grid grid-cols-2 gap-1 rounded-lg bg-neutral-100 p-1">
                {(
                  [
                    ['efectivo', 'Efectivo a la caja'],
                    ['fuera', 'Directo a gerencia'],
                  ] as const
                ).map(([valorMetodo, label]) => (
                  <button
                    key={valorMetodo}
                    type="button"
                    disabled={valorMetodo === 'efectivo' && turnoAbierto === false}
                    onClick={() => setMetodo(valorMetodo)}
                    className={`rounded-md px-3 py-2.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                      metodo === valorMetodo ? 'bg-white text-neutral-900 shadow-card' : 'text-neutral-500 hover:text-neutral-700'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <span className="text-xs text-neutral-500">
                {metodo === 'efectivo'
                  ? `Entra al cajón del turno${responsable ? ` de ${responsable}` : ''} y suma al arqueo.`
                  : turnoAbierto === false
                    ? 'No hay turno de caja abierto: solo se puede registrar como pagado por fuera.'
                    : 'Se le pagó a gerencia (efectivo, Nequi, transferencia) — no toca la caja.'}
              </span>
            </div>

            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-neutral-700">
                {metodo === 'fuera' ? 'Cómo se pagó' : 'Nota'}{' '}
                {metodo === 'fuera' ? (
                  <span className="text-danger-600">*</span>
                ) : (
                  <span className="font-normal text-neutral-400">(opcional)</span>
                )}
              </span>
              <input
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder={metodo === 'fuera' ? 'Ej. le pagó en efectivo a Alessandro' : 'Ej. abono semanal'}
                className="rounded-lg border border-neutral-300 px-3 py-2.5 text-sm outline-none transition-colors focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
              />
            </label>

            {saldo && valor > 0 && valor <= debeEnBolsa ? (
              <div className="flex flex-col gap-1 rounded-xl bg-neutral-50 px-4 py-3 text-sm">
                <span className="text-xs font-medium text-neutral-500">Después del abono queda debiendo</span>
                {soloBolsa === 'tienda' ? null : (
                  <div className="flex justify-between text-neutral-700">
                    <span>Préstamos</span>
                    <span className="font-mono">{COP.format(Math.max(0, saldo.prestamo - (bolsa === 'prestamo' ? valor : 0)))}</span>
                  </div>
                )}
                {soloBolsa === 'prestamo' ? null : (
                  <div className="flex justify-between text-neutral-700">
                    <span>Tienda</span>
                    <span className="font-mono">{COP.format(Math.max(0, saldo.tienda - (bolsa === 'tienda' ? valor : 0)))}</span>
                  </div>
                )}
                {bolsa === 'tienda' && saldo.enCuenta > 0 ? (
                  <span className="mt-1 text-xs text-neutral-500">
                    Lo cargado en su cuenta abierta pasa a la deuda; la cuenta sigue abierta para seguir cargando.
                  </span>
                ) : null}
              </div>
            ) : null}
          </>
        ) : null}

        {error ? <p className="rounded-lg bg-danger-50 px-3 py-2.5 text-sm text-danger-700">{error}</p> : null}
      </div>
    </Modal>
  )
}
