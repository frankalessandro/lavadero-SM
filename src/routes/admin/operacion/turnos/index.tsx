import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { ClipboardCheck, ClipboardList, Scale } from 'lucide-react'
import { fetchTurnos } from '../../../../data/turnos'
import type { RolCaja, TurnoCaja } from '../../../../schemas/turnoCaja'
import { Card } from '../../../../components/layout/Card'
import { StatCard } from '../../../../components/layout/StatCard'

type FiltroKey = 'todos' | 'jefe_zona' | 'vigilante'

const FILTROS: { key: FiltroKey; label: string }[] = [
  { key: 'todos', label: 'Todos' },
  { key: 'jefe_zona', label: 'Jefe de zona' },
  { key: 'vigilante', label: 'Vigilante' },
]

const ROL_LABEL: Record<RolCaja, string> = {
  jefe_zona: 'Jefe de zona',
  vigilante: 'Vigilante',
}

const ROL_CLASSNAME: Record<RolCaja, string> = {
  jefe_zona: 'bg-primary-50 text-primary-700',
  vigilante: 'bg-neutral-100 text-neutral-700',
}

const COP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })

function fetchByFiltro(filtro: FiltroKey): Promise<TurnoCaja[]> {
  if (filtro === 'todos') return fetchTurnos()
  return fetchTurnos(filtro)
}

export const Route = createFileRoute('/admin/operacion/turnos/')({
  loader: () => fetchByFiltro('todos'),
  component: TurnosPage,
})

function diferenciaClassName(diferencia: number | undefined): string {
  if (diferencia === undefined) return 'text-neutral-400'
  if (diferencia === 0) return 'text-success-700'
  if (diferencia < 0) return 'text-danger-700'
  return 'text-warning-700'
}

function formatDiferencia(diferencia: number | undefined): string {
  if (diferencia === undefined) return '—'
  const signo = diferencia > 0 ? '+' : ''
  return `${signo}${COP.format(diferencia)}`
}

function TurnosPage() {
  const initial = Route.useLoaderData()
  const [filtro, setFiltro] = useState<FiltroKey>('todos')
  const [turnos, setTurnos] = useState(initial)
  const [loading, setLoading] = useState(false)

  async function cambiarFiltro(key: FiltroKey) {
    setFiltro(key)
    setLoading(true)
    try {
      setTurnos(await fetchByFiltro(key))
    } finally {
      setLoading(false)
    }
  }

  const cerrados = turnos.filter((t) => t.cerrado)
  const conDiferencia = cerrados.filter((t) => (t.diferencia ?? 0) !== 0)
  const sumaDiferencias = cerrados.reduce((total, t) => total + (t.diferencia ?? 0), 0)

  return (
    <div className="flex flex-col gap-6 text-left">
      <div>
        <h2 className="text-base font-semibold text-neutral-900">Turnos y arqueos</h2>
        <p className="text-sm text-neutral-500">
          Histórico de turnos de caja (jefe de zona y vigilante), con diferencias de arqueo por responsable. Solo
          lectura — un turno cerrado es inmodificable.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Turnos mostrados" value={String(turnos.length)} icon={ClipboardList} />
        <StatCard
          label="Con diferencia"
          value={String(conDiferencia.length)}
          hint={`de ${cerrados.length} cerrados`}
          icon={ClipboardCheck}
        />
        <StatCard
          label="Suma de diferencias"
          value={formatDiferencia(sumaDiferencias)}
          hint="positivo = sobrante, negativo = faltante"
          icon={Scale}
        />
      </div>

      <div className="flex rounded-lg border border-neutral-300 p-1 w-fit">
        {FILTROS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => cambiarFiltro(f.key)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              filtro === f.key ? 'bg-primary-600 text-white shadow-nav-active' : 'text-neutral-600 hover:bg-neutral-50'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <Card className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-xs font-medium uppercase tracking-wide text-neutral-500">
                <th className="px-5 py-3">Rol</th>
                <th className="px-5 py-3">Responsable</th>
                <th className="px-5 py-3">Apertura</th>
                <th className="px-5 py-3">Cierre</th>
                <th className="px-5 py-3">Base inicial</th>
                <th className="px-5 py-3">Valor esperado</th>
                <th className="px-5 py-3">Conteo físico</th>
                <th className="px-5 py-3">Diferencia</th>
                <th className="px-5 py-3">Cerró</th>
                <th className="px-5 py-3">Recibió</th>
              </tr>
            </thead>
            <tbody>
              {turnos.map((turno) => (
                <tr key={turno.id} className="border-b border-neutral-100 transition-colors last:border-0 hover:bg-primary-50/40">
                  <td className="px-5 py-3">
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${ROL_CLASSNAME[turno.rol]}`}>
                      {ROL_LABEL[turno.rol]}
                    </span>
                  </td>
                  <td className="px-5 py-3 font-medium text-neutral-900">{turno.responsable}</td>
                  <td className="px-5 py-3 text-neutral-700">{new Date(turno.abiertoEn).toLocaleString('es-CO')}</td>
                  <td className="px-5 py-3 text-neutral-700">
                    {turno.cerrado ? (
                      turno.cerradoEn ? (
                        new Date(turno.cerradoEn).toLocaleString('es-CO')
                      ) : (
                        '—'
                      )
                    ) : (
                      <span className="inline-flex rounded-full bg-warning-50 px-2.5 py-1 text-xs font-medium text-warning-700">
                        Abierto
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-neutral-700">{COP.format(turno.baseInicial)}</td>
                  <td className="px-5 py-3 text-neutral-700">
                    {turno.cerrado && turno.valorEsperado !== undefined ? COP.format(turno.valorEsperado) : '—'}
                  </td>
                  <td className="px-5 py-3 text-neutral-700">
                    {turno.cerrado && turno.conteoFisico !== undefined ? COP.format(turno.conteoFisico) : '—'}
                  </td>
                  <td className="px-5 py-3">
                    {turno.cerrado ? (
                      <span
                        className={`font-medium ${diferenciaClassName(turno.diferencia)}`}
                        title={turno.justificacionDiferencia ? `Justificación: ${turno.justificacionDiferencia}` : undefined}
                      >
                        {formatDiferencia(turno.diferencia)}
                        {turno.justificacionDiferencia ? (
                          <span className="mt-0.5 block max-w-[16rem] truncate text-xs font-normal text-neutral-400">
                            {turno.justificacionDiferencia}
                          </span>
                        ) : null}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-5 py-3 text-neutral-700">{turno.cerrado ? (turno.cerradoPor ?? '—') : '—'}</td>
                  <td className="px-5 py-3 text-neutral-700">{turno.recibidoPor ?? '—'}</td>
                </tr>
              ))}
              {turnos.length === 0 ? (
                <tr>
                  <td className="px-5 py-6 text-center text-neutral-400" colSpan={10}>
                    {loading ? 'Cargando…' : 'No hay turnos registrados.'}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
