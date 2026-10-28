import { useMemo, useRef, useState } from 'react'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, CheckCircle2, HandCoins, Users } from 'lucide-react'
import { fetchLavadores } from '../../../../data/lavadores'
import {
  anularDeuda,
  cobrarFaltante,
  descartarFaltante,
  fetchMovimientosDeuda,
  fetchPersonasDeudoras,
  fetchSaldoDeuda,
  fetchSaldosDeuda,
  type DeudaPersonal,
  type Deudor,
} from '../../../../data/deudasPersonal'
import { fetchFaltantesPendientes, type FaltantePendiente } from '../../../../data/conteosInventario'
import {
  BOLSA_DEUDA_LABEL,
  SALDO_DEUDA_CERO,
  TIPO_DEUDA_LABEL,
  type BolsaDeuda,
  type SaldoDeuda,
} from '../../../../schemas/deudaPersonal'
import { Modal } from '../../../../components/layout/Modal'
import { Button } from '../../../../components/layout/Button'
import { AbonoDeudaModal } from '../../../../components/deudas/AbonoDeudaModal'
import { TarjetasBolsa } from '../../../../components/deudas/TarjetasBolsa'
import { Card } from '../../../../components/layout/Card'
import { StatCard } from '../../../../components/layout/StatCard'
import { CustomSelect } from '../../../../components/layout/CustomSelect'
import { toast } from '../../../../lib/toast'
import { PageHeader } from '../../../../components/layout/PageHeader'

async function loadDeudas() {
  const [lavadores, personas, { porLavador, porPersona }, faltantes] = await Promise.all([
    fetchLavadores(),
    fetchPersonasDeudoras(),
    fetchSaldosDeuda(),
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
  saldo: SaldoDeuda
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
        saldo: data.porPersona.get(p.id) ?? SALDO_DEUDA_CERO,
      })),
      ...data.lavadores
        .filter((l) => l.activo || (data.porLavador.get(l.id)?.total ?? 0) !== 0)
        .map((l) => ({
          deudor: { tipo: 'lavador' as const, id: l.id },
          nombre: l.nombre,
          rol: l.activo ? 'Lavador' : 'Lavador (inactivo)',
          saldo: data.porLavador.get(l.id) ?? SALDO_DEUDA_CERO,
        })),
    ]
    return lista.sort((a, b) => b.saldo.total - a.saldo.total || a.nombre.localeCompare(b.nombre))
  }, [data])

  const conDeuda = filas.filter((f) => f.saldo.total > 0)
  const totalDeuda = conDeuda.reduce((s, f) => s + f.saldo.total, 0)
  const totalTienda = conDeuda.reduce((s, f) => s + f.saldo.tienda, 0)
  const totalFaltantes = data.faltantes.reduce((s, f) => s + f.linea.valorDiferencia, 0)

  const refrescar = () => router.invalidate()

  return (
    <div className="flex flex-col gap-6 text-left">
      <PageHeader
        title="Deudas del personal"
        description="Quién le debe al negocio y por qué. Toca una persona para abonar o ver sus movimientos."
        help={{
          body: 'Préstamos en efectivo, consumo de nevera y faltantes de inventario de lavadores, jefes de patio y gerencia, en dos bolsas: Préstamos y Tienda (nevera + faltantes cobrados).\n\nLo que una persona tiene cargado en su cuenta abierta ya cuenta como deuda de tienda. Al abonar o descontar tienda, esos productos pasan a la deuda y la cuenta sigue abierta para seguir cargando.\n\nSe saldan con abonos (a la caja del turno o directo a gerencia) o descontándolos al generar la liquidación, eligiendo a qué bolsa. Nunca queda saldo a favor.\n\nLos faltantes de conteo de inventario llegan acá para que gerencia decida: cobrarlos a alguien o descartarlos.',
        }}
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          label="Deuda pendiente total"
          value={COP.format(totalDeuda)}
          hint={`Préstamos ${COP.format(totalDeuda - totalTienda)} · Tienda ${COP.format(totalTienda)}`}
          icon={HandCoins}
        />
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
                <span className="flex shrink-0 flex-col items-end">
                  <span className={`font-mono text-sm font-semibold ${f.saldo.total > 0 ? 'text-warning-700' : 'text-neutral-400'}`}>
                    {f.saldo.total > 0 ? COP.format(f.saldo.total) : 'Al día'}
                  </span>
                  {f.saldo.total > 0 ? (
                    <span className="text-xs text-neutral-500">
                      Préstamos {COP.format(f.saldo.prestamo)} · Tienda {COP.format(f.saldo.tienda)}
                    </span>
                  ) : null}
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
                className="rounded-xl bg-primary-600 px-3 py-2 text-xs font-semibold text-white shadow-nav-active transition-colors hover:bg-primary-700 disabled:opacity-60"
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

// Expediente de deuda de una persona: saldo por bolsa arriba, movimientos filtrables por bolsa y
// "Recibir abono" (AbonoDeudaModal, el mismo de la caja del jefe de patio).
function DetalleDeudaModal({ fila, onClose, onCambio }: { fila: FilaDeudor; onClose: () => void; onCambio: () => Promise<void> }) {
  const movimientosQuery = useQuery({
    queryKey: ['deudas', 'movimientos', fila.deudor.tipo, fila.deudor.id],
    queryFn: () => fetchMovimientosDeuda(fila.deudor),
  })
  const movimientos = movimientosQuery.data ?? null
  // Saldo por bolsa con lo pendiente de sus cuentas abiertas (el ledger solo no lo trae).
  const saldoQuery = useQuery({
    queryKey: ['deudas', 'saldo', fila.deudor.tipo, fila.deudor.id],
    queryFn: () => fetchSaldoDeuda(fila.deudor),
    initialData: fila.saldo,
  })
  const saldo = saldoQuery.data
  const [anulando, setAnulando] = useState<DeudaPersonal | null>(null)
  const [abonando, setAbonando] = useState(false)
  const [filtro, setFiltro] = useState<'todas' | BolsaDeuda>('todas')

  // Saldo corrido: un abono (o descuento de liquidación) que lo deja en $0 es "quedó al día" ese
  // día. Si después vuelve a pedir prestado, es otra deuda — el badge se queda en el día que se saldó.
  const alDia = useMemo(() => {
    const ids = new Set<string>()
    let corrido = 0
    for (const m of [...(movimientos ?? [])].reverse()) {
      if (m.estado !== 'activo') continue
      corrido += m.monto
      if (m.monto < 0 && corrido <= 0) ids.add(m.id)
    }
    return ids
  }, [movimientos])

  const visibles = (movimientos ?? []).filter((m) => filtro === 'todas' || m.bolsa === filtro)

  async function recargar() {
    await Promise.all([movimientosQuery.refetch(), saldoQuery.refetch()])
    await onCambio()
  }

  return (
    <>
      <Modal
        title={fila.nombre}
        subtitle={`${fila.rol} · debe ${COP.format(saldo.total)}`}
        icon={HandCoins}
        tone={saldo.total > 0 ? 'warning' : 'success'}
        size="md"
        onClose={onClose}
        footer={
          <>
            <Button variant="ghost" onClick={onClose}>
              Cerrar
            </Button>
            {saldo.total > 0 ? (
              <Button variant="primary" icon={HandCoins} onClick={() => setAbonando(true)}>
                Recibir abono
              </Button>
            ) : null}
          </>
        }
      >
        <div className="flex flex-col gap-5">
          <TarjetasBolsa saldo={saldo} />

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-3">
              <h4 className="text-sm font-semibold text-neutral-900">Movimientos</h4>
              <div className="flex gap-1 rounded-lg bg-neutral-100 p-1">
                {(
                  [
                    ['todas', 'Todo'],
                    ['prestamo', 'Préstamos'],
                    ['tienda', 'Tienda'],
                  ] as const
                ).map(([valor, label]) => (
                  <button
                    key={valor}
                    type="button"
                    onClick={() => setFiltro(valor)}
                    className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                      filtro === valor ? 'bg-white text-neutral-900 shadow-card' : 'text-neutral-500 hover:text-neutral-700'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {movimientosQuery.isError ? (
              <p className="py-6 text-center text-sm text-danger-600">No se pudieron cargar los movimientos.</p>
            ) : movimientos === null ? (
              <p className="py-6 text-center text-sm text-neutral-400">Cargando…</p>
            ) : visibles.length === 0 ? (
              <p className="py-6 text-center text-sm text-neutral-400">Sin movimientos.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-neutral-100 rounded-xl border border-neutral-100">
                {visibles.map((m) => (
                  <li
                    key={m.id}
                    className={`flex items-start justify-between gap-3 px-3 py-2.5 text-sm ${m.estado === 'anulado' ? 'opacity-50' : ''}`}
                  >
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-1.5 font-medium text-neutral-800">
                        <span
                          className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                            m.bolsa === 'tienda' ? 'bg-primary-50 text-primary-700' : 'bg-warning-50 text-warning-700'
                          }`}
                        >
                          {BOLSA_DEUDA_LABEL[m.bolsa]}
                        </span>
                        {TIPO_DEUDA_LABEL[m.tipo]}
                        {m.tipo === 'abono' ? (
                          <span className="text-xs font-normal text-neutral-500">
                            {m.metodoAbono === 'efectivo' ? 'efectivo a caja' : 'directo a gerencia'}
                          </span>
                        ) : null}
                        {m.estado === 'anulado' ? <span className="text-danger-600">· anulado</span> : null}
                      </p>
                      {alDia.has(m.id) ? (
                        <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-success-50 px-2 py-0.5 text-xs font-semibold text-success-700">
                          <CheckCircle2 size={12} /> ¡Quedó al día!
                        </span>
                      ) : null}
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
            {saldo.enCuenta > 0 && filtro !== 'prestamo' ? (
              <p className="text-xs text-neutral-500">
                Además tiene {COP.format(saldo.enCuenta)} cargados en su cuenta abierta: pasan a esta lista cuando abone o se
                le descuente tienda.
              </p>
            ) : null}
          </div>
        </div>
      </Modal>

      {abonando ? (
        <AbonoDeudaModal
          deudor={fila.deudor}
          nombre={fila.nombre}
          bolsaInicial={saldo.prestamo > 0 ? 'prestamo' : 'tienda'}
          metodoInicial="fuera"
          onClose={() => setAbonando(false)}
          onRegistrado={() => void recargar()}
        />
      ) : null}

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
    </>
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
    <Modal
      title={titulo}
      subtitle={ayuda}
      icon={AlertTriangle}
      tone="danger"
      size="sm"
      onClose={onCancel}
      footer={
        <>
          <Button variant="ghost" onClick={onCancel}>
            Cancelar
          </Button>
          <Button variant="danger" loading={saving} onClick={() => void confirmar()}>
            {boton}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
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
        {error ? <p className="rounded-lg bg-danger-50 px-3 py-2.5 text-sm text-danger-700">{error}</p> : null}
      </div>
    </Modal>
  )
}
