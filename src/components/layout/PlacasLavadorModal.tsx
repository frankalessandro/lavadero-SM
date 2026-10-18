import { useState } from 'react'
import { Car, CheckCircle2 } from 'lucide-react'
import type { PlacaLiquidacion } from '../../data/liquidaciones'
import { Modal } from './Modal'
import { FiltroBusqueda } from './Filtros'
import { Button } from './Button'
import { COP } from '../../lib/formato'
import { coincide } from '../../lib/tableFilters'

const FECHA_HORA = new Intl.DateTimeFormat('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

const ESTADO: Record<PlacaLiquidacion['estado'], { label: string; clase: string }> = {
  en_proceso: { label: 'En proceso', clase: 'bg-warning-50 text-warning-700' },
  listo: { label: 'Listo', clase: 'bg-primary-50 text-primary-700' },
  entregado: { label: 'Entregado y cobrado', clase: 'bg-success-50 text-success-700' },
}

// Qué placas hay detrás de una liquidación de lavador: para revisar vehículo por vehículo qué se
// está contando (o se contó), cuándo se registró, en qué va y cuánto le toca. Entra por fecha de
// REGISTRO de la orden, no por cuándo se lava o se cobra.
export function PlacasLavadorModal({
  titulo,
  subtitulo,
  filas,
  tipoNombre,
  comboNombre,
  onClose,
}: {
  titulo: string
  subtitulo: string
  filas: PlacaLiquidacion[]
  tipoNombre: (id: string) => string
  comboNombre: (id: string | undefined) => string
  onClose: () => void
}) {
  const [busqueda, setBusqueda] = useState('')
  const visibles = filas.filter((f) => coincide(f.placa, busqueda))
  const total = visibles.reduce((s, f) => s + f.comision, 0)
  const sinLiquidar = filas.filter((f) => !f.liquidacionId).length

  return (
    <Modal
      title={titulo}
      subtitle={subtitulo}
      icon={Car}
      size="lg"
      onClose={onClose}
      footer={
        <Button variant="secondary" onClick={onClose}>
          Cerrar
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <FiltroBusqueda value={busqueda} onChange={setBusqueda} placeholder="Buscar placa…" mayusculas ancho="sm:w-56" />
          <p className="text-xs text-neutral-500">
            {visibles.length} placa{visibles.length === 1 ? '' : 's'} · {sinLiquidar} sin liquidar ·{' '}
            <span className="font-semibold text-neutral-800">{COP.format(total)}</span>
          </p>
        </div>

        {visibles.length === 0 ? (
          <p className="py-8 text-center text-sm text-neutral-400">
            {filas.length === 0 ? 'No hay placas en este corte.' : 'Ninguna placa coincide con la búsqueda.'}
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-neutral-100 rounded-xl border border-neutral-100">
            {visibles.map((f) => (
              <li key={f.id} className="flex items-start justify-between gap-3 px-3 py-3">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="font-mono text-base font-bold text-neutral-900">{f.placa}</span>
                    <span className="text-[11px] text-neutral-400">#{f.consecutivo}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${ESTADO[f.estado].clase}`}>
                      {ESTADO[f.estado].label}
                    </span>
                    {f.liquidacionId ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-600">
                        <CheckCircle2 size={11} /> Ya liquidada
                      </span>
                    ) : (
                      <span className="rounded-full bg-warning-50 px-2 py-0.5 text-[11px] font-medium text-warning-700">
                        Sin liquidar
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 text-xs text-neutral-600">
                    {comboNombre(f.comboId)} · {tipoNombre(f.tipoVehiculoId)}
                    {f.conAcompanante ? ' · lavado entre 2' : ''}
                  </p>
                  <p className="text-xs text-neutral-400">
                    Registrada {FECHA_HORA.format(new Date(f.creadoEn))}
                    {f.entregadaEn ? ` · entregada ${FECHA_HORA.format(new Date(f.entregadaEn))}` : ''}
                  </p>
                </div>
                <span className="shrink-0 text-sm font-semibold tabular-nums text-neutral-900">{COP.format(f.comision)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  )
}
