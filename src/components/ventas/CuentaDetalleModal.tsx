import { useQuery } from '@tanstack/react-query'
import { Ban, CheckCircle2, CupSoda, PackagePlus, UserRound, Wallet } from 'lucide-react'
import { fetchDetalleCuenta } from '../../data/historialVentas'
import type { Cuenta } from '../../schemas/cuenta'
import { Modal } from '../layout/Modal'
import { COP } from '../../lib/formato'
import { METODO_PAGO_LABEL } from '../../lib/metodoPago'

const FECHA_HORA = new Intl.DateTimeFormat('es-CO', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
})

const ESTADO_LABEL = { abierta: 'Abierta', cerrada: 'Cerrada', anulada: 'Anulada' } as const

// Expediente de una cuenta abierta a nombre de alguien (lavador, gerente, acompañante…): cuándo se
// abrió y quién, cuándo se agregó cada producto, y cómo terminó (cobrada, cargada a un trabajador
// o anulada). Los productos quitados siguen visibles — regla 13, nada se borra.
export function CuentaDetalleModal({
  cuenta,
  cargadaA,
  nombreProducto,
  esAdmin,
  onClose,
}: {
  cuenta: Cuenta
  cargadaA: string | null
  nombreProducto: (id: string) => string
  esAdmin: boolean
  onClose: () => void
}) {
  const query = useQuery({
    queryKey: ['cuentas', 'detalle', cuenta.id],
    queryFn: () => fetchDetalleCuenta(cuenta, cargadaA),
  })
  const detalle = query.data
  const vigentes = (detalle?.ventas ?? []).filter((v) => v.estado !== 'anulada')
  const total = vigentes.reduce((s, v) => s + v.total, 0)

  return (
    <Modal
      title={cuenta.titular}
      subtitle={`Cuenta ${ESTADO_LABEL[cuenta.estado].toLowerCase()}${cuenta.nota ? ` · ${cuenta.nota}` : ''}`}
      icon={UserRound}
      size="md"
      onClose={onClose}
    >
      <div className="flex flex-col gap-5 text-sm">
        <ol className="flex flex-col gap-3 border-l-2 border-neutral-100 pl-4">
          <Paso icono={PackagePlus} titulo="Cuenta abierta" detalle={`${cuenta.abiertaPor} · ${FECHA_HORA.format(new Date(cuenta.abiertaEn))}`} />
          {cuenta.aCosto && esAdmin ? (
            <Paso
              icono={Wallet}
              titulo="Retiro a costo de gerencia"
              detalle={`${cuenta.motivo ?? 'Sin motivo'}${cuenta.autorizadoPor ? ` · autorizó ${cuenta.autorizadoPor}` : ''}`}
            />
          ) : null}
          {cuenta.cerradaEn ? (
            <Paso
              icono={cargadaA ? UserRound : CheckCircle2}
              titulo={
                cuenta.estado === 'anulada'
                  ? 'Cuenta anulada'
                  : cargadaA
                    ? `Cargada a ${cargadaA} (deuda)`
                    : 'Cuenta cobrada y cerrada'
              }
              detalle={`${cuenta.cerradaPor ?? '—'} · ${FECHA_HORA.format(new Date(cuenta.cerradaEn))}`}
              tono={cuenta.estado === 'anulada' ? 'danger' : cargadaA ? 'warning' : 'success'}
            />
          ) : (
            <Paso icono={Wallet} titulo="Sigue abierta" detalle="Aún no se cobra ni se carga a nadie." />
          )}
        </ol>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">Productos</p>
          {query.isError ? (
            <p className="py-4 text-center text-danger-600">No se pudo cargar el detalle.</p>
          ) : !detalle ? (
            <p className="py-4 text-center text-neutral-400">Cargando…</p>
          ) : detalle.ventas.length === 0 ? (
            <p className="py-4 text-center text-neutral-400">La cuenta no tiene productos.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-neutral-100 rounded-xl border border-neutral-100">
              {detalle.ventas.map((v) => (
                <li key={v.id} className={`flex items-start justify-between gap-3 px-3 py-2.5 ${v.estado === 'anulada' ? 'opacity-60' : ''}`}>
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 font-medium text-neutral-800">
                      <CupSoda size={13} className="shrink-0 text-neutral-400" />
                      <span className="truncate">
                        {nombreProducto(v.productoId)} <span className="font-normal text-neutral-400">×{v.cantidad}</span>
                      </span>
                      {v.estado === 'anulada' ? <Ban size={13} className="shrink-0 text-danger-600" /> : null}
                    </p>
                    <p className="text-xs text-neutral-500">
                      Agregado {FECHA_HORA.format(new Date(v.creadoEn))} · {v.vendidoPor}
                    </p>
                    {v.estado === 'anulada' ? (
                      <p className="text-xs text-danger-600">
                        Quitado{v.anuladaEn ? ` ${FECHA_HORA.format(new Date(v.anuladaEn))}` : ''}
                        {v.anuladaPor ? ` · ${v.anuladaPor}` : ''}
                        {v.motivoAnulacion ? ` — ${v.motivoAnulacion}` : ''}
                      </p>
                    ) : null}
                  </div>
                  <span className={`shrink-0 font-semibold ${v.estado === 'anulada' ? 'text-neutral-400 line-through' : 'text-neutral-900'}`}>
                    {COP.format(v.total)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {detalle ? (
          <div className="flex flex-col gap-1.5 rounded-xl bg-neutral-50 px-3 py-3">
            <div className="flex items-center justify-between">
              <span className="text-neutral-600">Total de la cuenta</span>
              <span className="font-semibold text-neutral-900">{COP.format(total)}</span>
            </div>
            {detalle.pagos.map((p) => (
              <div key={p.id} className="flex items-center justify-between text-xs text-neutral-500">
                <span>
                  Pagó con {METODO_PAGO_LABEL[p.metodoPago].toLowerCase()}
                  {p.referenciaPago ? ` · ref. ${p.referenciaPago}` : ''}
                </span>
                <span>{COP.format(p.monto)}</span>
              </div>
            ))}
            {cargadaA ? (
              <p className="text-xs text-warning-700">
                No entró plata: el total quedó como deuda de {cargadaA} (Dinero › Deudas).
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </Modal>
  )
}

const TONO = {
  neutral: 'bg-neutral-100 text-neutral-500',
  success: 'bg-success-50 text-success-700',
  warning: 'bg-warning-50 text-warning-700',
  danger: 'bg-danger-50 text-danger-700',
} as const

function Paso({
  icono: Icono,
  titulo,
  detalle,
  tono = 'neutral',
}: {
  icono: typeof Wallet
  titulo: string
  detalle: string
  tono?: keyof typeof TONO
}) {
  return (
    <li className="relative flex items-start gap-3">
      <span className={`absolute -left-[2.15rem] flex size-7 items-center justify-center rounded-full ring-4 ring-white ${TONO[tono]}`}>
        <Icono size={14} />
      </span>
      <div className="min-w-0">
        <p className="font-medium text-neutral-800">{titulo}</p>
        <p className="text-xs text-neutral-500">{detalle}</p>
      </div>
    </li>
  )
}
