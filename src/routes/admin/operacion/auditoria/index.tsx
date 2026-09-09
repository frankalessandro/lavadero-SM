import { useMemo, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { ScrollText, ShieldCheck, User, X } from 'lucide-react'
import { fetchBitacora, type FiltroBitacora } from '../../../../data/bitacora'
import { fetchPerfiles } from '../../../../data/perfiles'
import {
  ACCIONES_FILTRO,
  ACCION_LABEL,
  ENTIDAD_LABEL,
  type BitacoraEntrada,
} from '../../../../schemas/bitacora'
import type { Perfil } from '../../../../schemas/perfil'
import { Card } from '../../../../components/layout/Card'
import { StatCard } from '../../../../components/layout/StatCard'
import { CustomSelect } from '../../../../components/layout/CustomSelect'

type RangoKey = 'hoy' | '7dias' | '30dias'

const RANGOS: { key: RangoKey; label: string; dias: number }[] = [
  { key: 'hoy', label: 'Hoy', dias: 0 },
  { key: '7dias', label: 'Últimos 7 días', dias: 6 },
  { key: '30dias', label: 'Últimos 30 días', dias: 29 },
]

// Límites en medianoche local, mismo criterio que /admin/rentabilidad (src/lib/periodo.ts).
function rangoISO(dias: number): { desdeISO: string; hastaISO: string } {
  const ahora = new Date()
  const desde = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() - dias)
  const hasta = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() + 1)
  return { desdeISO: desde.toISOString(), hastaISO: hasta.toISOString() }
}

async function loadAuditoria() {
  const { desdeISO, hastaISO } = rangoISO(6)
  // El filtro incluye las cuentas inactivas a propósito: la bitácora es histórica y hay que poder
  // filtrar por alguien que ya no opera.
  const [entradas, personal] = await Promise.all([
    fetchBitacora({ desdeISO, hastaISO }),
    fetchPerfiles(),
  ])
  return { entradas, personal }
}

export const Route = createFileRoute('/admin/operacion/auditoria/')({
  loader: loadAuditoria,
  component: Auditoria,
})

const ACCION_TONO: Record<string, string> = {
  crear: 'bg-primary-50 text-primary-700',
  anular: 'bg-danger-50 text-danger-700',
  editar: 'bg-neutral-100 text-neutral-600',
  cambiar_precio: 'bg-warning-50 text-warning-700',
  ajustar_inventario: 'bg-warning-50 text-warning-700',
  cambiar_configuracion: 'bg-danger-50 text-danger-700',
}

function formatFecha(iso: string) {
  return new Date(iso).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'medium' })
}

function Auditoria() {
  const data = Route.useLoaderData()
  const [entradas, setEntradas] = useState<BitacoraEntrada[]>(data.entradas)
  const [rango, setRango] = useState<RangoKey>('7dias')
  const [accion, setAccion] = useState('')
  const [entidad, setEntidad] = useState('')
  const [personaId, setPersonaId] = useState('')
  const [cargando, setCargando] = useState(false)
  const [detalle, setDetalle] = useState<BitacoraEntrada | null>(null)

  async function recargar(next: Partial<{ rango: RangoKey; accion: string; entidad: string; personaId: string }>) {
    const r = next.rango ?? rango
    const a = next.accion ?? accion
    const e = next.entidad ?? entidad
    const p = next.personaId ?? personaId
    setRango(r)
    setAccion(a)
    setEntidad(e)
    setPersonaId(p)

    setCargando(true)
    try {
      const dias = RANGOS.find((x) => x.key === r)?.dias ?? 6
      const filtro: FiltroBitacora = { ...rangoISO(dias) }
      if (a) filtro.accion = a
      if (e) filtro.entidad = e
      if (p) filtro.personaId = p
      setEntradas(await fetchBitacora(filtro))
    } finally {
      setCargando(false)
    }
  }

  const resumen = useMemo(() => {
    const porAccion = new Map<string, number>()
    for (const entrada of entradas) porAccion.set(entrada.accion, (porAccion.get(entrada.accion) ?? 0) + 1)
    return {
      total: entradas.length,
      anulaciones: porAccion.get('anular') ?? 0,
      precios: porAccion.get('cambiar_precio') ?? 0,
      configuracion: porAccion.get('cambiar_configuracion') ?? 0,
    }
  }, [entradas])

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-lg font-semibold text-neutral-900">Auditoría</h1>
        <p className="max-w-3xl text-sm text-neutral-500">
          Registro append-only de creaciones, anulaciones, cambios de precio, movimientos de inventario y cambios de
          configuración. Lo escribe la base de datos por trigger, no la aplicación: queda igual venga de la interfaz o
          de una escritura directa, y nadie —tampoco un administrador— puede editarlo ni borrarlo.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Eventos en el rango" value={String(resumen.total)} icon={ScrollText} />
        <StatCard label="Anulaciones" value={String(resumen.anulaciones)} icon={X} />
        <StatCard label="Cambios de precio" value={String(resumen.precios)} icon={ShieldCheck} />
        <StatCard label="Cambios de configuración" value={String(resumen.configuracion)} icon={ShieldCheck} />
      </div>

      <Card className="flex flex-col gap-4 p-5">
        <div className="flex flex-wrap items-center gap-1 rounded-lg border border-neutral-200 p-1">
          {RANGOS.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={() => recargar({ rango: r.key })}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                rango === r.key ? 'bg-primary-600 text-white shadow-nav-active' : 'text-neutral-600 hover:bg-neutral-50'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-neutral-700">Acción</span>
            <CustomSelect
              size="sm"
              value={accion}
              onChange={(v) => recargar({ accion: v })}
              options={[
                { value: '', label: 'Todas' },
                ...ACCIONES_FILTRO.map((a) => ({ value: a, label: ACCION_LABEL[a] ?? a })),
              ]}
              placeholder="Todas"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-neutral-700">Entidad</span>
            <CustomSelect
              size="sm"
              value={entidad}
              onChange={(v) => recargar({ entidad: v })}
              options={[
                { value: '', label: 'Todas' },
                ...Object.entries(ENTIDAD_LABEL).map(([value, label]) => ({ value, label })),
              ]}
              placeholder="Todas"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-neutral-700">Persona</span>
            <CustomSelect
              size="sm"
              value={personaId}
              onChange={(v) => recargar({ personaId: v })}
              options={[
                { value: '', label: 'Todas' },
                ...data.personal.map((p: Perfil) => ({ value: p.id, label: p.nombre?.trim() || 'Sin nombre' })),
              ]}
              placeholder="Todas"
            />
          </label>
        </div>
      </Card>

      {cargando ? (
        <Card className="py-14 text-center text-sm text-neutral-400">Cargando…</Card>
      ) : entradas.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 py-14 text-center">
          <ScrollText size={28} className="text-neutral-300" />
          <p className="text-sm text-neutral-400">No hay eventos con estos filtros.</p>
        </Card>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[52rem] text-sm">
            <thead>
              <tr className="border-b border-neutral-100 text-left text-xs font-medium text-neutral-500">
                <th className="px-5 py-3">Cuándo</th>
                <th className="px-5 py-3">Acción</th>
                <th className="px-5 py-3">Sobre</th>
                <th className="px-5 py-3">Persona</th>
                <th className="px-5 py-3">Cuenta</th>
                <th className="px-5 py-3 text-right">Detalle</th>
              </tr>
            </thead>
            <tbody>
              {entradas.map((entrada) => (
                <tr key={entrada.id} className="border-b border-neutral-50 last:border-0 hover:bg-primary-50/40">
                  <td className="whitespace-nowrap px-5 py-3 font-mono text-xs text-neutral-600">
                    {formatFecha(entrada.ocurridoEn)}
                  </td>
                  <td className="px-5 py-3">
                    <span
                      className={`rounded-md px-2 py-1 text-xs font-medium ${
                        ACCION_TONO[entrada.accion] ?? 'bg-neutral-100 text-neutral-600'
                      }`}
                    >
                      {ACCION_LABEL[entrada.accion] ?? entrada.accion}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-neutral-700">{ENTIDAD_LABEL[entrada.entidad] ?? entrada.entidad}</td>
                  <td className="px-5 py-3 text-neutral-700">
                    {entrada.personaNombre ? (
                      <span className="flex items-center gap-1.5">
                        <User size={13} className="text-neutral-400" />
                        {entrada.personaNombre}
                      </span>
                    ) : (
                      <span className="text-neutral-400">—</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-xs text-neutral-500">
                    {entrada.usuarioNombre ?? entrada.usuarioRol ?? '—'}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => setDetalle(entrada)}
                      className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-primary-700 transition-colors hover:bg-primary-50"
                    >
                      Ver cambio
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {entradas.length === 500 ? (
        <p className="text-xs text-warning-700">
          Se muestran los 500 eventos más recientes del rango. Acota el rango o los filtros para ver el resto.
        </p>
      ) : null}

      {detalle ? <DetalleModal entrada={detalle} onClose={() => setDetalle(null)} /> : null}
    </div>
  )
}

function valorLegible(valor: unknown): string {
  if (valor === null || valor === undefined) return '—'
  if (typeof valor === 'object') return JSON.stringify(valor)
  return String(valor)
}

function DetalleModal({ entrada, onClose }: { entrada: BitacoraEntrada; onClose: () => void }) {
  // En una creación no hay "antes": se listan los campos de la fila nueva. En una edición solo
  // vienen las columnas que efectivamente cambiaron (el trigger descarta el resto).
  const campos = Object.keys(entrada.despues ?? {}).sort()

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/40 p-4" onClick={onClose}>
      <div
        className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-card-hover"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-neutral-100 p-6">
          <div>
            <h2 className="text-base font-semibold text-neutral-900">
              {ACCION_LABEL[entrada.accion] ?? entrada.accion} · {ENTIDAD_LABEL[entrada.entidad] ?? entrada.entidad}
            </h2>
            <p className="text-xs text-neutral-500">
              {formatFecha(entrada.ocurridoEn)}
              {entrada.personaNombre ? ` · ${entrada.personaNombre}` : ''}
              {entrada.usuarioRol ? ` · cuenta ${entrada.usuarioRol}` : ''}
            </p>
            {entrada.entidadId ? (
              <p className="mt-1 font-mono text-[11px] text-neutral-400">{entrada.entidadId}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex size-8 shrink-0 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-neutral-100"
          >
            <X size={18} />
          </button>
        </div>

        <div className="custom-scroll min-h-0 overflow-y-auto p-6">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-medium text-neutral-500">
                <th className="bg-white pb-2">Campo</th>
                {entrada.antes ? <th className="bg-white pb-2">Antes</th> : null}
                <th className="bg-white pb-2">{entrada.antes ? 'Después' : 'Valor'}</th>
              </tr>
            </thead>
            <tbody>
              {campos.map((campo) => (
                <tr key={campo} className="border-t border-neutral-50">
                  <td className="py-2 pr-3 font-mono text-xs text-neutral-500">{campo}</td>
                  {entrada.antes ? (
                    <td className="py-2 pr-3 text-neutral-500 line-through">
                      {valorLegible(entrada.antes[campo])}
                    </td>
                  ) : null}
                  <td className="py-2 font-medium text-neutral-800">{valorLegible(entrada.despues?.[campo])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
