import { useRef, useState, type FormEvent } from 'react'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { IdCard, Pencil, Plus, X } from 'lucide-react'
import {
  createPersonalOperativo,
  fetchPersonalOperativo,
  setPersonalOperativoActivo,
  updatePersonalOperativo,
} from '../../../../data/personalOperativo'
import {
  NIVEL_LABEL,
  personalOperativoInputSchema,
  type NivelPersonal,
  type PersonalOperativo,
} from '../../../../schemas/personalOperativo'
import { Card } from '../../../../components/layout/Card'
import { CustomSelect } from '../../../../components/layout/CustomSelect'
import { ConfirmModal } from '../../../../components/layout/ConfirmModal'

export const Route = createFileRoute('/admin/personal/caja/')({
  loader: fetchPersonalOperativo,
  component: PersonalDeCaja,
})

const NIVEL_OPTIONS = (Object.keys(NIVEL_LABEL) as NivelPersonal[]).map((nivel) => ({
  value: nivel,
  label: NIVEL_LABEL[nivel],
}))

const NIVEL_BADGE: Record<NivelPersonal, string> = {
  administrador: 'bg-primary-50 text-primary-700',
  jefe_patio: 'bg-warning-50 text-warning-700',
  vigilante: 'bg-neutral-100 text-neutral-600',
}

function PersonalDeCaja() {
  const personal = Route.useLoaderData()
  const router = useRouter()
  const [editando, setEditando] = useState<PersonalOperativo | null>(null)
  const [creando, setCreando] = useState(false)
  const [confirmando, setConfirmando] = useState<PersonalOperativo | null>(null)

  async function refresh() {
    await router.invalidate()
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-neutral-900">Personal de caja</h1>
          <p className="max-w-2xl text-sm text-neutral-500">
            Las personas que abren caja y responden por un turno. No son cuentas de acceso: hay una sola cuenta
            por rol, compartida, así que es esta lista —y no el login— la que dice quién es quién. De acá salen el
            selector de responsable del turno y el sujeto de la comisión de jefe de patio.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreando(true)}
          className="flex items-center gap-1.5 rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white shadow-nav-active transition-colors hover:bg-primary-700"
        >
          <Plus size={16} />
          Agregar persona
        </button>
      </div>

      {personal.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 py-14 text-center">
          <IdCard size={28} className="text-neutral-300" />
          <p className="text-sm text-neutral-400">Todavía no hay personal registrado.</p>
        </Card>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[36rem] text-sm">
            <thead>
              <tr className="border-b border-neutral-100 text-left text-xs font-medium text-neutral-500">
                <th className="px-5 py-3">Nombre</th>
                <th className="px-5 py-3">Nivel</th>
                <th className="px-5 py-3">Teléfono</th>
                <th className="px-5 py-3">Estado</th>
                <th className="px-5 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {personal.map((persona) => (
                <tr key={persona.id} className="border-b border-neutral-50 last:border-0 hover:bg-primary-50/40">
                  <td className="px-5 py-3 font-medium text-neutral-800">{persona.nombre}</td>
                  <td className="px-5 py-3">
                    <span className={`rounded-md px-2 py-1 text-xs font-medium ${NIVEL_BADGE[persona.nivel]}`}>
                      {NIVEL_LABEL[persona.nivel]}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-neutral-600">{persona.telefono ?? '—'}</td>
                  <td className="px-5 py-3">
                    <span
                      className={`rounded-md px-2 py-1 text-xs font-medium ${
                        persona.activo ? 'bg-success-50 text-success-700' : 'bg-neutral-100 text-neutral-500'
                      }`}
                    >
                      {persona.activo ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setEditando(persona)}
                        className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-neutral-600 transition-colors hover:bg-neutral-100"
                      >
                        <Pencil size={14} />
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmando(persona)}
                        className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-neutral-600 transition-colors hover:bg-neutral-100"
                      >
                        {persona.activo ? 'Inactivar' : 'Activar'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {creando || editando ? (
        <PersonaModal
          persona={editando}
          onClose={() => {
            setCreando(false)
            setEditando(null)
          }}
          onGuardado={async () => {
            setCreando(false)
            setEditando(null)
            await refresh()
          }}
        />
      ) : null}

      {confirmando ? (
        <ConfirmModal
          title={confirmando.activo ? 'Inactivar persona' : 'Activar persona'}
          message={
            confirmando.activo
              ? `${confirmando.nombre} deja de aparecer en el selector de responsable del turno. Sus turnos, órdenes y comisión histórica se conservan intactos.`
              : `${confirmando.nombre} vuelve a aparecer en el selector de responsable del turno.`
          }
          confirmLabel={confirmando.activo ? 'Inactivar' : 'Activar'}
          variant={confirmando.activo ? 'danger' : 'primary'}
          onCancel={() => setConfirmando(null)}
          onConfirm={async () => {
            await setPersonalOperativoActivo(confirmando.id, !confirmando.activo)
            setConfirmando(null)
            await refresh()
          }}
        />
      ) : null}
    </div>
  )
}

function PersonaModal({
  persona,
  onClose,
  onGuardado,
}: {
  persona: PersonalOperativo | null
  onClose: () => void
  onGuardado: () => Promise<void>
}) {
  const [nombre, setNombre] = useState(persona?.nombre ?? '')
  const [nivel, setNivel] = useState<string>(persona?.nivel ?? 'jefe_patio')
  const [telefono, setTelefono] = useState(persona?.telefono ?? '')
  const [errores, setErrores] = useState<Record<string, string>>({})
  const [guardando, setGuardando] = useState(false)
  // Guard síncrono: `disabled={guardando}` llega tarde con un doble clic rápido.
  const enVueloRef = useRef(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (enVueloRef.current) return

    const parsed = personalOperativoInputSchema.safeParse({ nombre, nivel, telefono: telefono || undefined })
    if (!parsed.success) {
      const mapa: Record<string, string> = {}
      for (const issue of parsed.error.issues) {
        const campo = issue.path[0]
        if (typeof campo === 'string' && !mapa[campo]) mapa[campo] = issue.message
      }
      setErrores(mapa)
      return
    }

    enVueloRef.current = true
    setGuardando(true)
    try {
      if (persona) await updatePersonalOperativo(persona.id, parsed.data)
      else await createPersonalOperativo(parsed.data)
      await onGuardado()
    } catch (error) {
      setErrores({ general: error instanceof Error ? error.message : 'No se pudo guardar' })
    } finally {
      enVueloRef.current = false
      setGuardando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/40 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-card-hover sm:p-7">
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-neutral-900">
              {persona ? 'Editar persona' : 'Agregar persona'}
            </h2>
            <p className="text-xs text-neutral-500">
              El nombre queda como identidad única — evita apodos y abreviaciones.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex size-8 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-neutral-100"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-neutral-700">Nombre completo</span>
            <input
              autoFocus
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej. Julián Salinas"
              className="rounded-lg border border-neutral-300 px-3 py-2.5 text-sm outline-none transition-colors focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
            />
            {errores.nombre ? <span className="text-xs text-danger-600">{errores.nombre}</span> : null}
          </label>

          <div className="grid gap-5 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-neutral-700">Nivel</span>
              <CustomSelect
                size="sm"
                value={nivel}
                onChange={setNivel}
                options={NIVEL_OPTIONS}
                placeholder="Selecciona el nivel"
              />
              <span className="text-xs text-neutral-500">
                Decide qué cajas puede abrir. Un administrador puede cubrir cualquiera.
              </span>
            </label>

            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-neutral-700">Teléfono</span>
              <input
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
                placeholder="Opcional"
                className="rounded-lg border border-neutral-300 px-3 py-2.5 text-sm outline-none transition-colors focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
              />
            </label>
          </div>

          {errores.general ? (
            <p className="rounded-lg bg-danger-50 px-3 py-2.5 text-sm text-danger-700">{errores.general}</p>
          ) : null}

          <div className="flex justify-end gap-2 border-t border-neutral-100 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-3 py-2 text-sm font-medium text-neutral-600 transition-colors hover:bg-neutral-100"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={guardando}
              className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white shadow-nav-active transition-colors hover:bg-primary-700 disabled:opacity-60"
            >
              {guardando ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
