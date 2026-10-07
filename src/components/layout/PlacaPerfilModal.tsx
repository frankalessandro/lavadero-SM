import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  CarFront,
  CircleParking,
  MessageCircle,
  Phone,
  Receipt,
  Search,
  Sparkles,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import { fetchPerfilPlaca, type PerfilPlaca } from '../../data/perfilPlaca'
import { CLASE_VEHICULO_LABEL, type EstanciaParqueadero } from '../../schemas/estanciaParqueadero'
import type { Orden } from '../../schemas/orden'
import {
  CONDICION_LABEL,
  diasParaVencer,
  ESTADO_VIGENCIA_LABEL,
  estadoVigencia,
  textoVencimiento,
  type SuscripcionParqueadero,
} from '../../schemas/suscripcionParqueadero'
import { COP } from '../../lib/formato'
import type { Rol } from '../../lib/roles'
import { whatsappHref } from '../../lib/whatsapp'
import { Button } from './Button'
import { Card } from './Card'
import { Modal } from './Modal'

const LAVADOS_VISIBLES = 8
const ESTANCIAS_VISIBLES = 6

function fmtFechaHora(iso: string): string {
  return new Date(iso).toLocaleString('es-CO', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
}

function fmtFecha(iso: string): string {
  return new Date(iso).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })
}

function fmtFechaSola(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })
}

const ESTADO_ORDEN: Record<Orden['estado'], { label: string; clase: string }> = {
  en_proceso: { label: 'En proceso', clase: 'bg-primary-50 text-primary-700' },
  listo: { label: 'Listo', clase: 'bg-warning-50 text-warning-700' },
  entregado: { label: 'Entregado', clase: 'bg-success-50 text-success-700' },
  anulada: { label: 'Anulada', clase: 'bg-neutral-100 text-neutral-500' },
}

const BADGE_VIGENCIA = {
  vigente: 'bg-success-50 text-success-700',
  por_vencer: 'bg-warning-50 text-warning-700',
  vencida: 'bg-danger-50 text-danger-700',
  inactiva: 'bg-neutral-100 text-neutral-500',
} as const

const MODALIDAD_LABEL = { noche: 'Noche', mensualidad: 'Mensualidad', fijo: 'Fijo 24h' } as const

// "Perfil" de una placa: todo lo que el sistema sabe de ese vehículo — lavados, parqueadero y
// suscripción — reunido en un solo modal. Lo abre el buscador del Topbar desde cualquier pantalla.
// Cada rol ve solo lo que su RLS le permite (el vigilante no ve los lavados, el jefe de patio no ve
// el parqueadero); el resto de secciones simplemente no aparece.
export function PlacaPerfilModal({ placa, rol, onClose }: { placa: string; rol: Rol; onClose: () => void }) {
  const [perfil, setPerfil] = useState<PerfilPlaca | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [verTodosLavados, setVerTodosLavados] = useState(false)

  useEffect(() => {
    let activo = true
    fetchPerfilPlaca(placa, rol)
      .then((p) => {
        if (activo) setPerfil(p)
      })
      .catch((err) => {
        if (activo) setError(err instanceof Error ? err.message : 'No se pudo consultar la placa')
      })
    return () => {
      activo = false
    }
  }, [placa, rol])

  const resumen = useMemo(() => {
    if (!perfil) return null
    const ordenes = perfil.ordenes ?? []
    const reales = ordenes.filter((o) => o.estado !== 'anulada')
    const entregadas = reales.filter((o) => o.estado === 'entregado')
    const reciente = ordenes.find((o) => o.estado !== 'anulada') ?? ordenes[0]
    const sus = perfil.suscripciones.find((s) => s.activo) ?? perfil.suscripciones[0]
    return {
      lavados: entregadas.length,
      totalPagado: entregadas.reduce((suma, o) => suma + o.precio - o.descuento, 0),
      ultimaVisita: reales[0]?.creadoEn,
      cliente: reciente?.clienteNombre ?? sus?.titular,
      telefono: reciente?.clienteTelefono ?? sus?.telefono,
      tipo: reciente ? perfil.tipos.get(reciente.tipoVehiculoId) : sus ? CLASE_VEHICULO_LABEL[sus.claseVehiculo] : undefined,
      adentro: perfil.estancias?.find((e) => e.estado === 'adentro' && !e.anulada),
    }
  }, [perfil])

  const sinRegistros =
    !!perfil &&
    (perfil.ordenes?.length ?? 0) === 0 &&
    (perfil.estancias?.length ?? 0) === 0 &&
    perfil.suscripciones.length === 0 &&
    !perfil.lavadoHoy

  const subtitulo = [resumen?.cliente, resumen?.tipo].filter(Boolean).join(' · ')

  return (
    <Modal
      title={<span className="font-mono">{placa}</span>}
      subtitle={subtitulo || 'Perfil del vehículo'}
      icon={CarFront}
      size="lg"
      onClose={onClose}
      footer={
        <Button variant="ghost" onClick={onClose}>
          Cerrar
        </Button>
      }
    >
      {error ? (
        <p className="rounded-lg bg-danger-50 px-3 py-2.5 text-sm text-danger-700">{error}</p>
      ) : !perfil || !resumen ? (
        <p className="py-10 text-center text-sm text-neutral-400">Buscando {placa}…</p>
      ) : sinRegistros ? (
        <div className="flex flex-col items-center gap-2 py-10 text-center">
          <span className="flex size-11 items-center justify-center rounded-2xl bg-neutral-100 text-neutral-400">
            <Search size={20} />
          </span>
          <p className="text-sm font-medium text-neutral-700">No hay registros de {placa}</p>
          <p className="text-xs text-neutral-400">Revisa que la placa esté bien escrita.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {resumen.adentro ? (
            <p className="flex items-center gap-2 rounded-xl bg-primary-50 px-4 py-3 text-sm font-medium text-primary-800">
              <CircleParking size={16} />
              Está en el parqueadero desde el {fmtFechaHora(resumen.adentro.horaIngreso)} ·{' '}
              {MODALIDAD_LABEL[resumen.adentro.modalidad]}
            </p>
          ) : null}

          {perfil.lavadoHoy ? (
            <p className="flex items-center gap-2 rounded-xl bg-warning-50 px-4 py-3 text-sm font-medium text-warning-700">
              <Sparkles size={16} />
              Pasó por el lavadero hoy (orden #{perfil.lavadoHoy.consecutivo} ·{' '}
              {ESTADO_ORDEN[perfil.lavadoHoy.estado].label.toLowerCase()}).
            </p>
          ) : null}

          {perfil.ordenes ? (
            <div className="grid grid-cols-3 gap-3">
              <Dato icono={Sparkles} etiqueta="Lavados" valor={String(resumen.lavados)} />
              <Dato icono={Wallet} etiqueta="Ha pagado" valor={COP.format(resumen.totalPagado)} />
              <Dato
                icono={Receipt}
                etiqueta="Última visita"
                valor={resumen.ultimaVisita ? fmtFecha(resumen.ultimaVisita) : '—'}
              />
            </div>
          ) : null}

          {resumen.cliente || resumen.telefono ? (
            <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-neutral-900">{resumen.cliente ?? 'Sin nombre'}</p>
                <p className="text-xs text-neutral-500">{resumen.telefono ?? 'Sin teléfono'}</p>
              </div>
              {resumen.telefono ? (
                <div className="flex gap-2">
                  <a
                    href={whatsappHref(resumen.telefono, `Hola ${resumen.cliente ?? ''}, te escribimos de CarWash SM ✨ sobre tu vehículo ${placa}.`)}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1.5 rounded-lg bg-success-50 px-3 py-2 text-sm font-semibold text-success-700 transition-colors hover:bg-success-600/10"
                  >
                    <MessageCircle size={15} /> WhatsApp
                  </a>
                  <a
                    href={`tel:${resumen.telefono.replace(/\s+/g, '')}`}
                    className="flex items-center gap-1.5 rounded-lg bg-neutral-50 px-3 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-100"
                  >
                    <Phone size={15} /> Llamar
                  </a>
                </div>
              ) : null}
            </Card>
          ) : null}

          {perfil.suscripciones.length > 0 ? (
            <Seccion titulo="Suscripción de parqueadero" icono={CircleParking}>
              <ul className="flex flex-col gap-2">
                {perfil.suscripciones.map((s) => (
                  <FilaSuscripcion key={s.id} sus={s} />
                ))}
              </ul>
            </Seccion>
          ) : null}

          {perfil.ordenes ? (
            <Seccion titulo={`Lavados (${perfil.ordenes.length})`} icono={Sparkles}>
              {perfil.ordenes.length === 0 ? (
                <p className="text-sm text-neutral-400">Esta placa no tiene lavados registrados.</p>
              ) : (
                <>
                  <ul className="flex flex-col divide-y divide-neutral-100 rounded-xl border border-neutral-100">
                    {(verTodosLavados ? perfil.ordenes : perfil.ordenes.slice(0, LAVADOS_VISIBLES)).map((o) => (
                      <FilaOrden key={o.id} orden={o} perfil={perfil} />
                    ))}
                  </ul>
                  {perfil.ordenes.length > LAVADOS_VISIBLES ? (
                    <button
                      type="button"
                      onClick={() => setVerTodosLavados((v) => !v)}
                      className="w-fit text-xs font-medium text-primary-700 hover:underline"
                    >
                      {verTodosLavados ? 'Ver menos' : `Ver los ${perfil.ordenes.length} lavados`}
                    </button>
                  ) : null}
                </>
              )}
            </Seccion>
          ) : null}

          {perfil.estancias ? (
            <Seccion titulo={`Parqueadero (${perfil.estancias.length})`} icono={CircleParking}>
              {perfil.estancias.length === 0 ? (
                <p className="text-sm text-neutral-400">Esta placa no tiene estancias registradas.</p>
              ) : (
                <ul className="flex flex-col divide-y divide-neutral-100 rounded-xl border border-neutral-100">
                  {perfil.estancias.slice(0, ESTANCIAS_VISIBLES).map((e) => (
                    <FilaEstancia key={e.id} estancia={e} />
                  ))}
                </ul>
              )}
              {perfil.estancias.length > ESTANCIAS_VISIBLES ? (
                <p className="text-xs text-neutral-400">
                  Mostrando las {ESTANCIAS_VISIBLES} más recientes de {perfil.estancias.length}.
                </p>
              ) : null}
            </Seccion>
          ) : null}
        </div>
      )}
    </Modal>
  )
}

function Seccion({ titulo, icono: Icono, children }: { titulo: string; icono: LucideIcon; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-neutral-900">
        <Icono size={15} className="text-primary-600" />
        {titulo}
      </h3>
      {children}
    </section>
  )
}

function Dato({ icono: Icono, etiqueta, valor }: { icono: LucideIcon; etiqueta: string; valor: string }) {
  return (
    <Card className="flex flex-col gap-1 p-3.5">
      <span className="flex items-center gap-1.5 text-xs font-medium text-neutral-500">
        <Icono size={13} /> {etiqueta}
      </span>
      <span className="truncate text-base font-semibold tabular-nums text-neutral-900">{valor}</span>
    </Card>
  )
}

function FilaSuscripcion({ sus }: { sus: SuscripcionParqueadero }) {
  const estado = sus.activo ? estadoVigencia(sus.fechaFin) : 'inactiva'
  const dias = diasParaVencer(sus.fechaFin)
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-neutral-200 px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-neutral-900">
          {CONDICION_LABEL[sus.modalidad].titulo} · {CLASE_VEHICULO_LABEL[sus.claseVehiculo]} · {COP.format(sus.valor)}
        </p>
        <p className="text-xs text-neutral-500">
          Vence {fmtFechaSola(sus.fechaFin)}
          {sus.activo ? ` · ${textoVencimiento(dias)}` : ''}
        </p>
      </div>
      <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${BADGE_VIGENCIA[estado]}`}>
        {estado === 'inactiva' ? 'Inactiva' : ESTADO_VIGENCIA_LABEL[estado]}
      </span>
    </li>
  )
}

function FilaOrden({ orden, perfil }: { orden: Orden; perfil: PerfilPlaca }) {
  const estado = ESTADO_ORDEN[orden.estado]
  const servicios = orden.comboId
    ? (perfil.combos.get(orden.comboId) ?? 'Combo')
    : orden.serviciosAdicionales.map((s) => s.nombre).join(', ') || 'Servicios'
  const lavador = orden.lavadorId ? perfil.lavadores.get(orden.lavadorId) : undefined
  return (
    <li className="flex items-center justify-between gap-3 px-3.5 py-3 text-sm">
      <div className="min-w-0">
        <p className={`truncate font-medium ${orden.estado === 'anulada' ? 'text-neutral-400 line-through' : 'text-neutral-800'}`}>
          #{orden.consecutivo} · {servicios}
        </p>
        <p className="truncate text-xs text-neutral-400">
          {fmtFechaHora(orden.creadoEn)}
          {lavador ? ` · ${lavador}` : ''}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <span className="font-semibold tabular-nums text-neutral-900">{COP.format(orden.precio - orden.descuento)}</span>
        <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-medium ${estado.clase}`}>{estado.label}</span>
      </div>
    </li>
  )
}

function FilaEstancia({ estancia }: { estancia: EstanciaParqueadero }) {
  return (
    <li className="flex items-center justify-between gap-3 px-3.5 py-3 text-sm">
      <div className="min-w-0">
        <p className={`truncate font-medium ${estancia.anulada ? 'text-neutral-400 line-through' : 'text-neutral-800'}`}>
          <span className="font-mono">PAR-{estancia.consecutivo}</span> · {MODALIDAD_LABEL[estancia.modalidad]}
        </p>
        <p className="truncate text-xs text-neutral-400">
          {fmtFechaHora(estancia.horaIngreso)}
          {estancia.horaSalida ? ` → ${fmtFechaHora(estancia.horaSalida)}` : ' · sigue adentro'}
        </p>
      </div>
      <span className="shrink-0 font-semibold tabular-nums text-neutral-900">
        {estancia.anulada ? 'Anulada' : estancia.cobro !== undefined ? COP.format(estancia.cobro) : '—'}
      </span>
    </li>
  )
}
