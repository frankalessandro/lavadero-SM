import { useMemo, useRef, useState } from 'react'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, HandCoins, Users, X } from 'lucide-react'
import { fetchLavadores } from '../../../../data/lavadores'
import {
  anularDeuda,
  cobrarFaltante,
  descartarFaltante,
  fetchDeudaPendientePorLavador,
  fetchDeudaPendientePorPersona,
  fetchMovimientosDeuda,
  fetchPersonasDeudoras,
  registrarAbono,
  type DeudaPersonal,
  type Deudor,
} from '../../../../data/deudasPersonal'
import { fetchFaltantesPendientes, type FaltantePendiente } from '../../../../data/conteosInventario'
import { abonoInputSchema, TIPO_DEUDA_LABEL, type MetodoAbono } from '../../../../schemas/deudaPersonal'
import { Card } from '../../../../components/layout/Card'
import { StatCard } from '../../../../components/layout/StatCard'
import { CustomSelect } from '../../../../components/layout/CustomSelect'
import { CurrencyInput } from '../../../../components/layout/CurrencyInput'
import { toast } from '../../../../lib/toast'

async function loadDeudas() {
  const [lavadores, personas, porLavador, porPersona, faltantes] = await Promise.all([
    fetchLavadores(),
    fetchPersonasDeudoras(),
    fetchDeudaPendientePorLavador(),
    fetchDeudaPendientePorPersona(),
    fetchFaltantesPendientes(),
  ])
  return { lavadores, personas, porLavador, porPersona, faltantes }
}

export const Route = createFileRoute('/admin/dinero/deudas/')({
  loader: loadDeudas,
  component: DeudasPage,
})

const COP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })
const FECHA_HORA = new Intl.DateTimeFormat('es-CO', { dateStyle: 'short', timeStyle: 'short' })

interface FilaDeudor {
  deudor: Deudor
  nombre: string
  rol: string
  saldo: number
}

// Deudas del personal (0070): lavadores, jefes de patio y gerencia. Préstamos y consumos se
// registran en la caja del turno; acá gerencia ve saldos, registra abonos (también por fuera de la
// caja), anula errores y decide los faltantes de inventario — cobrarlos a alguien o descartarlos.
function DeudasPage() {
  const data = Route.useLoaderData()
  const router = useRouter()
  const [detalle, setDetalle] = useState<FilaDeudor | null>(null)

  const filas = useMemo<FilaDeudor[]>(() => {
    const lista: FilaDeudor[] = [
      ...data.personas.map((p) => ({
        deudor: { tipo: 'persona' as const, id: p.id },
        nombre: p.nombre?.trim() || 'Sin nombre',
        rol: p.roles.includes('admin') ? 'Gerencia' : 'Jefe de patio',
        saldo: data.porPersona.get(p.id) ?? 0,
      })),
      ...data.lavadores
        .filter((l) => l.activo || (data.porLavador.get(l.id) ?? 0) !== 0)
        .map((l) => ({
          deudor: { tipo: 'lavador' as const, id: l.id },
          nombre: l.nombre,
          rol: l.activo ? 'Lavador' : 'Lavador (inactivo)',
          saldo: data.porLavador.get(l.id) ?? 0,
        })),
    ]
    return lista.sort((a, b) => b.saldo - a.saldo || a.nombre.localeCompare(b.nombre))
  }, [data])

  const conDeuda = filas.filter((f) => f.saldo > 0)
  const totalDeuda = conDeuda.reduce((s, f) => s + f.saldo, 0)
  const totalFaltantes = data.faltantes.reduce((s, f) => s + f.linea.valorDiferencia, 0)

  const refrescar = () => router.invalidate()

  return (
    <div className="flex flex-col gap-6 text-left">
      <div>
        <h2 className="text-base font-semibold text-neutral-900">Deudas del personal</h2>
        <p className="text-sm text-neutral-500">
          Préstamos, consumo de nevera y faltantes de inventario de lavadores, jefes de patio y gerencia. Se saldan con
          abonos o descontándolos al liquidar.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Deuda pendiente total" value={COP.format(totalDeuda)} icon={HandCoins} />
        <StatCard label="Personas con deuda" value={String(conDeuda.length)} icon={Users} />
        <StatCard
          label="Faltantes por decidir"
          value={COP.format(totalFaltantes)}
          hint={`${data.faltantes.length} a costo`}
          icon={AlertTriangle}
        />
      </div>

      <FaltantesPorDecidir faltantes={data.faltantes} personas={data.personas} onCambio={refrescar} />

      <Card className="overflow-hidden p-0">
        <div className="border-b border-neutral-100 px-5 py-3">
          <h3 className="text-sm font-semibold text-neutral-900">Saldos</h3>
          <p className="text-xs text-neutral-500">Toca una persona para ver sus movimientos, registrar un abono o anular un error.</p>
        </div>
        <ul className="flex flex-col divide-y divide-neutral-100">
          {filas.map((f) => (
            <li key={`${f.deudor.tipo}:${f.deudor.id}`}>
              <button
                type="button"
                onClick={() => setDetalle(f)}
                className="flex w-full items-center justify-between gap-3 px-5 py-3 text-left transition-colors hover:bg-primary-50/40"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-neutral-900">{f.nombre}</span>
                  <span className="block text-xs text-neutral-500">{f.rol}</span>
                </span>
                <span className={`shrink-0 font-mono text-sm font-semibold ${f.saldo > 0 ? 'text-warning-700' : 'text-neutral-400'}`}>
                  {f.saldo > 0 ? COP.format(f.saldo) : 'Al día'}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </Card>

      {detalle ? (
        <DetalleDeudaModal
          fila={detalle}
          onClose={() => setDetalle(null)}
          onCambio={async () => {
            await refrescar()
          }}
        />
      ) : null}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────────────────────

function FaltantesPorDecidir({
  faltantes,
  personas,
  onCambio,
}: {
  faltantes: FaltantePendiente[]
  personas: { id: string; nombre?: string | null }[]
  onCambio: () => Promise<void>
}) {
  const [cobrarA, setCobrarA] = useState<Record<string, string>>({})
  const [descartando, setDescartando] = useState<FaltantePendiente | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  if (faltantes.length === 0) return null

  async function cobrar(f: FaltantePendiente) {
    if (busy) return
    const persona = cobrarA[f.linea.id] || f.linea.respondePersonaId
    if (!persona) {
      toast.error('Elige a quién cobrárselo')
      return
    }
    setBusy(f.linea.id)
    try {
      await cobrarFaltante(f.linea.id, persona)
      toast.exito('Faltante cargado como deuda')
      await onCambio()
    } catch (err) {
      toast.desdeError(err, 'No se pudo cobrar el faltante')
    } finally {
      setBusy(null)
    }
  }

  return (
    <Card className="flex flex-col gap-3 border-l-4 border-l-danger-600 p-5">
      <div className="flex items-center gap-2.5">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-danger-50 text-danger-700">
          <AlertTriangle size={18} />
        </span>
        <div>
          <h3 className="text-sm font-semibold text-neutral-900">Faltantes de inventario por decidir</h3>
          <p className="text-xs text-neutral-500">Cobrar a una persona (queda como deuda, a costo) o descartar con motivo.</p>
        </div>
      </div>
      <ul className="flex flex-col gap-2">
        {faltantes.map((f) => (
          <li key={f.linea.id} className="flex flex-col gap-2 rounded-lg bg-neutral-50 p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-medium text-neutral-800">
                {Math.abs(f.linea.diferencia)} × {f.productoNombre} ·{' '}
                <span className="font-mono text-danger-700">{COP.format(f.linea.valorDiferencia)}</span>
              </p>
              <p className="text-xs text-neutral-500">
                {f.respondeNombre} · {f.fecha ? FECHA_HORA.format(new Date(f.fecha)) : '—'}
                {f.linea.motivo ? ` · ${f.linea.motivo}` : ''}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <div className="w-44">
                <CustomSelect
                  size="sm"
                  value={cobrarA[f.linea.id] ?? f.linea.respondePersonaId ?? ''}
                  onChange={(v) => setCobrarA((prev) => ({ ...prev, [f.linea.id]: v }))}
                  placeholder="¿A quién?"
                  options={personas.map((p) => ({ value: p.id, label: p.nombre?.trim() || 'Sin nombre' }))}
                />
              </div>
              <button
                type="button"
                disabled={busy === f.linea.id}
                onClick={() => cobrar(f)}
                className="rounded-lg bg-primary-600 px-3 py-2 text-xs font-semibold text-white shadow-nav-active transition-colors hover:bg-primary-700 disabled:opacity-60"
              >
                Cobrar
              </button>
              <button
                type="button"
                onClick={() => setDescartando(f)}
                className="rounded-lg border border-neutral-300 px-3 py-2 text-xs font-medium text-neutral-600 transition-colors hover:bg-white"
              >
                Descartar
              </button>
            </div>
          </li>
        ))}
      </ul>

      {descartando ? (
        <MotivoModal
          titulo={`Descartar faltante — ${Math.abs(descartando.linea.diferencia)} × ${descartando.productoNombre}`}
          ayuda="No se le cobra a nadie. Queda registrado con el motivo."
          boton="Descartar faltante"
          onCancel={() => setDescartando(null)}
          onConfirm={async (motivo) => {
            await descartarFaltante(descartando.linea.id, motivo)
            setDescartando(null)
            toast.exito('Faltante descartado')
            await onCambio()
          }}
        />
      ) : null}
    </Card>
  )
}

// ─────────────────────────────────────────────────────────────────────────────────────────────

function DetalleDeudaModal({ fila, onClose, onCambio }: { fila: FilaDeudor; onClose: () => void; onCambio: () => Promise<void> }) {
  const movimientosQuery = useQuery({
    queryKey: ['deudas', 'movimientos', fila.deudor.tipo, fila.deudor.id],
    queryFn: () => fetchMovimientosDeuda(fila.deudor),
  })
  const movimientos = movimientosQuery.data ?? null
  const [anulando, setAnulando] = useState<DeudaPersonal | null>(null)
  const [monto, setMonto] = useState('')
  const [metodo, setMetodo] = useState<MetodoAbono>('fuera')
  const [motivo, setMotivo] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const enVueloRef = useRef(false)

  const saldo = (movimientos ?? []).filter((m) => m.estado === 'activo').reduce((s, m) => s + m.monto, 0)

  async function recargar() {
    await movimientosQuery.refetch()
    await onCambio()
  }

  async function abonar() {
    if (enVueloRef.current) return
    const parsed = abonoInputSchema.safeParse({
      deudor: fila.deudor,
      monto: Number(monto || 0),
      metodo,
      motivo: motivo.trim() || undefined,
    })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Revisa el abono')
      return
    }
    setError(null)
    enVueloRef.current = true
    setSaving(true)
    try {
      await registrarAbono(parsed.data)
      setMonto('')
      setMotivo('')
      toast.exito('Abono registrado')
      await recargar()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar el abono')
      toast.desdeError(err, 'No se pudo registrar el abono')
    } finally {
      enVueloRef.current = false
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-neutral-900/40 p-4 backdrop-blur-[2px]">
      <div className="flex max-h-[90vh] w-full max-w-xl flex-col rounded-2xl bg-white shadow-card-hover">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-neutral-100 p-6 pb-4">
          <div>
            <h3 className="text-base font-semibold text-neutral-900">{fila.nombre}</h3>
            <p className="text-xs text-neutral-500">
              {fila.rol} · debe{' '}
              <span className="font-semibold text-neutral-800">{movimientos ? COP.format(saldo) : '…'}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="flex size-8 shrink-0 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-neutral-100"
          >
            <X size={18} />
          </button>
        </div>

        <div className="custom-scroll flex-1 overflow-y-auto px-6 py-4">
          {movimientosQuery.isError ? (
            <p className="py-6 text-center text-sm text-danger-600">No se pudieron cargar los movimientos.</p>
          ) : movimientos === null ? (
            <p className="py-6 text-center text-sm text-neutral-400">Cargando…</p>
          ) : movimientos.length === 0 ? (
            <p className="py-6 text-center text-sm text-neutral-400">Sin movimientos.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-neutral-100">
              {movimientos.map((m) => (
                <li key={m.id} className={`flex items-start justify-between gap-3 py-2.5 text-sm ${m.estado === 'anulado' ? 'opacity-50' : ''}`}>
                  <div className="min-w-0">
                    <p className="font-medium text-neutral-800">
                      {TIPO_DEUDA_LABEL[m.tipo]}
                      {m.tipo === 'abono' ? (m.metodoAbono === 'efectivo' ? ' · efectivo a caja' : ' · por fuera') : ''}
                      {m.estado === 'anulado' ? <span className="text-danger-600"> · anulado</span> : null}
                    </p>
                    <p className="text-xs text-neutral-500">
                      {m.motivo ?? 'Sin motivo'} · {m.registradoPor} · {FECHA_HORA.format(new Date(m.creadoEn))}
                    </p>
                    {m.estado === 'anulado' && m.motivoAnulacion ? (
                      <p className="text-xs text-danger-600">Anulado: {m.motivoAnulacion}</p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className={`font-mono font-semibold ${m.monto < 0 ? 'text-success-700' : 'text-neutral-800'}`}>
                      {m.monto < 0 ? `−${COP.format(-m.monto)}` : `+${COP.format(m.monto)}`}
                    </span>
                    {m.estado === 'activo' && (m.tipo === 'prestamo' || m.tipo === 'abono' || m.tipo === 'faltante') ? (
                      <button
                        type="button"
                        onClick={() => setAnulando(m)}
                        className="text-xs font-medium text-danger-600 transition-colors hover:text-danger-700"
                      >
                        Anular
                      </button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {saldo > 0 ? (
          <div className="flex shrink-0 flex-col gap-3 border-t border-neutral-100 p-6 pt-4">
            <p className="text-sm font-semibold text-neutral-900">Registrar abono</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="font-medium text-neutral-700">Monto</span>
                <CurrencyInput size="sm" prefix="$" value={monto} onChange={setMonto} />
              </label>
              <div className="flex flex-col gap-1.5 text-sm">
                <span className="font-medium text-neutral-700">Cómo paga</span>
                <div className="grid grid-cols-2 gap-1 rounded-lg bg-neutral-100 p-1">
                  {(
                    [
                      ['fuera', 'Por fuera'],
                      ['efectivo', 'Efectivo a caja'],
                    ] as const
                  ).map(([valor, label]) => (
                    <button
                      key={valor}
                      type="button"
                      onClick={() => setMetodo(valor)}
                      className={`rounded-md px-2 py-2 text-sm font-medium transition-colors ${
                        metodo === valor ? 'bg-white text-neutral-900 shadow-card' : 'text-neutral-500 hover:text-neutral-700'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-neutral-700">
                {metodo === 'fuera' ? 'Cómo se pagó' : 'Nota'}{' '}
                {metodo === 'fuera' ? <span className="text-danger-600">*</span> : <span className="font-normal text-neutral-400">(opcional)</span>}
              </span>
              <input
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder={metodo === 'fuera' ? 'Ej. transferencia Nequi 15/09' : 'Entra a la caja del turno abierto'}
                className="rounded-lg border border-neutral-300 px-3 py-2.5 text-sm outline-none transition-colors focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
              />
            </label>
            {error ? <p className="text-xs text-danger-600">{error}</p> : null}
            <div className="flex justify-end">
              <button
                type="button"
                onClick={abonar}
                disabled={saving}
                className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white shadow-nav-active transition-colors hover:bg-primary-700 disabled:opacity-60"
              >
                {saving ? 'Guardando…' : 'Registrar abono'}
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {anulando ? (
        <MotivoModal
          titulo={`Anular ${TIPO_DEUDA_LABEL[anulando.tipo].toLowerCase()} de ${COP.format(Math.abs(anulando.monto))}`}
          ayuda={
            anulando.tipo === 'faltante'
              ? 'El faltante vuelve a quedar por decidir.'
              : 'No se borra: queda anulado con el motivo. Si movió efectivo de un turno ya cerrado, ese arqueo no cambia.'
          }
          boton="Anular"
          onCancel={() => setAnulando(null)}
          onConfirm={async (texto) => {
            await anularDeuda(anulando.id, texto)
            setAnulando(null)
            toast.exito('Anulado')
            await recargar()
          }}
        />
      ) : null}
    </div>
  )
}

function MotivoModal({
  titulo,
  ayuda,
  boton,
  onConfirm,
  onCancel,
}: {
  titulo: string
  ayuda: string
  boton: string
  onConfirm: (motivo: string) => Promise<void>
  onCancel: () => void
}) {
  const [motivo, setMotivo] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const enVueloRef = useRef(false)

  async function confirmar() {
    if (enVueloRef.current) return
    if (motivo.trim().length < 5) {
      setError('Escribe el motivo (mínimo 5 caracteres)')
      return
    }
    enVueloRef.current = true
    setSaving(true)
    try {
      await onConfirm(motivo.trim())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo completar')
      toast.desdeError(err, 'No se pudo completar')
    } finally {
      enVueloRef.current = false
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-neutral-900/40 p-4 backdrop-blur-[2px]">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-card-hover sm:p-7">
        <h3 className="mb-2 text-base font-semibold text-neutral-900">{titulo}</h3>
        <p className="mb-4 text-xs text-neutral-500">{ayuda}</p>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-neutral-700">Motivo</span>
          <textarea
            autoFocus
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            rows={3}
            className="resize-none rounded-lg border border-neutral-300 px-3 py-2.5 text-sm outline-none transition-colors focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
          />
        </label>
        {error ? <p className="mt-2 text-xs text-danger-600">{error}</p> : null}
        <div className="mt-5 flex justify-end gap-2 border-t border-neutral-100 pt-4">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg px-4 py-2 text-sm font-medium text-neutral-600 transition-colors hover:bg-neutral-100"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={confirmar}
            disabled={saving}
            className="rounded-lg bg-danger-600 px-4 py-2 text-sm font-medium text-white shadow-nav-active transition-colors hover:bg-danger-700 disabled:opacity-60"
          >
            {saving ? 'Guardando…' : boton}
          </button>
        </div>
      </div>
    </div>
  )
}
