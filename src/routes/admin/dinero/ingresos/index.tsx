import { useRef, useState, type FormEvent } from 'react'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { Ban, Banknote, HandCoins, Plus, ReceiptText, Settings2 } from 'lucide-react'
import {
  anularIngresoOtro,
  createCategoriaIngreso,
  createIngresoOtro,
  fetchCategoriasIngreso,
  fetchIngresosOtros,
  setCategoriaIngresoActivo,
  type IngresoOtroConCategoria,
} from '../../../../data/ingresosOtros'
import {
  anularIngresoOtroInputSchema,
  categoriaIngresoInputSchema,
  ingresoOtroInputSchema,
  type CategoriaIngreso,
} from '../../../../schemas/ingresoOtro'
import type { MetodoPagoBase } from '../../../../schemas/orden'
import { StatCard } from '../../../../components/layout/StatCard'
import { CustomSelect } from '../../../../components/layout/CustomSelect'
import { ConfirmModal } from '../../../../components/layout/ConfirmModal'
import { CurrencyInput } from '../../../../components/layout/CurrencyInput'
import { Modal } from '../../../../components/layout/Modal'
import { Button } from '../../../../components/layout/Button'
import { PageHeader, SectionHeader } from '../../../../components/layout/PageHeader'
import { PeriodoSelector } from '../../../../components/layout/PeriodoSelector'
import { toast } from '../../../../lib/toast'
import { METODO_PAGO_LABEL } from '../../../../lib/metodoPago'
import { calcularRango, fechaLocalISO, type ModoPeriodo } from '../../../../lib/periodo'

const COP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })

const METODOS: MetodoPagoBase[] = ['efectivo', 'transferencia', 'datafono']

const INPUT_GRANDE =
  'rounded-lg border border-neutral-300 px-3 py-3 text-base outline-none transition-colors focus:border-primary-500 focus:ring-1 focus:ring-primary-500'

const INPUT_CLASS =
  'rounded-lg border border-neutral-300 px-3 py-2.5 text-sm outline-none transition-colors focus:border-primary-500 focus:ring-1 focus:ring-primary-500'

async function cargar(modo: ModoPeriodo, ancla: Date) {
  const rango = calcularRango(modo, ancla)
  const [categorias, ingresos] = await Promise.all([
    fetchCategoriasIngreso(),
    fetchIngresosOtros(rango.periodoInicio, rango.periodoFin),
  ])
  return { categorias, ingresos }
}

export const Route = createFileRoute('/admin/dinero/ingresos/')({
  loader: () => cargar('mes', new Date()),
  component: IngresosPage,
})

function IngresosPage() {
  const initial = Route.useLoaderData()
  const router = useRouter()
  const [categorias, setCategorias] = useState(initial.categorias)
  const [ingresos, setIngresos] = useState(initial.ingresos)
  const [modo, setModo] = useState<ModoPeriodo>('mes')
  const [ancla, setAncla] = useState(() => new Date())
  const [registrando, setRegistrando] = useState(false)
  const [categoriasAbierto, setCategoriasAbierto] = useState(false)
  const [anulando, setAnulando] = useState<IngresoOtroConCategoria | null>(null)

  const rango = calcularRango(modo, ancla)

  async function recargar(m: ModoPeriodo = modo, a: Date = ancla) {
    const datos = await cargar(m, a)
    setCategorias(datos.categorias)
    setIngresos(datos.ingresos)
    router.invalidate()
  }

  async function cambiarPeriodo(m: ModoPeriodo, a: Date) {
    setModo(m)
    setAncla(a)
    try {
      await recargar(m, a)
    } catch (err) {
      toast.desdeError(err, 'No se pudieron cargar los ingresos')
    }
  }

  const vigentes = ingresos.filter((i) => i.estado === 'activa')
  const anulados = ingresos.length - vigentes.length
  const total = vigentes.reduce((s, i) => s + i.monto, 0)
  const categoriasActivas = categorias.filter((c) => c.activo)

  return (
    <div className="flex flex-col gap-6 text-left">
      <PageHeader
        title="Otros ingresos"
        description="Plata que entra al negocio y no es lavado, nevera ni parqueadero."
        help={{
          body:
            'Aquí van los ingresos que no salen de la operación diaria: el alquiler del carro de comidas, patrocinios, publicidad, etc. Cada uno lleva categoría, monto, fecha y cómo se pagó.\n\n' +
            'Es manejo de gerencia: no entra al arqueo de ninguna caja. Suma a los ingresos y a la utilidad en Rentabilidad, en su propia línea "Otros ingresos".\n\n' +
            'Nada se borra: un ingreso mal registrado se anula con motivo y queda visible. Las categorías nuevas (por ejemplo "Patrocinios") se crean en el botón Categorías.',
        }}
        actions={
          <>
            <PeriodoSelector
              modo={modo}
              onModoChange={(m) => cambiarPeriodo(m, ancla)}
              ancla={ancla}
              onAnclaChange={(a) => cambiarPeriodo(modo, a)}
              rango={rango}
            />
            <Button icon={Settings2} onClick={() => setCategoriasAbierto(true)}>
              Categorías
            </Button>
            <Button variant="primary" icon={Plus} onClick={() => setRegistrando(true)}>
              Registrar ingreso
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard label="Total del periodo" value={COP.format(total)} hint={rango.label} icon={Banknote} />
        <StatCard label="Ingresos registrados" value={String(vigentes.length)} icon={ReceiptText} />
        <StatCard label="Anulados" value={String(anulados)} hint="Visibles abajo, no suman" icon={Ban} />
      </div>

      <section className="flex flex-col gap-3">
        <SectionHeader title="Ingresos del periodo" count={ingresos.length} />
        {ingresos.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-neutral-200 bg-white px-4 py-10 text-center text-sm text-neutral-400">
            No hay otros ingresos en este periodo.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-neutral-100 overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-card">
            {ingresos.map((ingreso) => (
              <IngresoRow key={ingreso.id} ingreso={ingreso} onAnular={() => setAnulando(ingreso)} />
            ))}
          </ul>
        )}
      </section>

      {registrando ? (
        <IngresoForm
          categorias={categoriasActivas}
          onClose={() => setRegistrando(false)}
          onSaved={async (fecha) => {
            setRegistrando(false)
            // Un ingreso con fecha de otro mes no aparecería en el periodo que se está viendo:
            // se mueve la vista a esa fecha para que se vea lo que se acaba de registrar.
            if (fecha >= rango.periodoInicio && fecha <= rango.periodoFin) await recargar()
            else await cambiarPeriodo(modo, new Date(`${fecha}T00:00:00`))
          }}
        />
      ) : null}

      {categoriasAbierto ? (
        <CategoriasModal categorias={categorias} onClose={() => setCategoriasAbierto(false)} onChanged={() => recargar()} />
      ) : null}

      {anulando ? (
        <AnularModal
          ingreso={anulando}
          onClose={() => setAnulando(null)}
          onAnulado={async () => {
            setAnulando(null)
            await recargar()
          }}
        />
      ) : null}
    </div>
  )
}

function IngresoRow({ ingreso, onAnular }: { ingreso: IngresoOtroConCategoria; onAnular: () => void }) {
  const anulado = ingreso.estado === 'anulada'
  return (
    <li className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-neutral-50 sm:px-5">
      <span
        className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${
          anulado ? 'bg-neutral-100 text-neutral-400' : 'bg-success-50 text-success-700'
        }`}
      >
        <HandCoins size={16} />
      </span>
      <div className="min-w-0 flex-1">
        <p className={`truncate text-sm font-medium ${anulado ? 'text-neutral-400 line-through' : 'text-neutral-900'}`}>
          {ingreso.descripcion}
        </p>
        <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-neutral-500">
          <span>{ingreso.fecha}</span>
          <span className="text-neutral-300">·</span>
          <span>{ingreso.categoriaNombre}</span>
          <span className="text-neutral-300">·</span>
          <span>{METODO_PAGO_LABEL[ingreso.metodoPago]}</span>
          <span className="text-neutral-300">·</span>
          <span className="truncate">{ingreso.registradoPor}</span>
          {anulado ? (
            <span className="rounded-full bg-danger-50 px-1.5 py-0.5 text-[10px] font-medium text-danger-700">Anulado</span>
          ) : null}
        </p>
        {anulado && ingreso.motivoAnulacion ? (
          <p className="mt-0.5 text-xs text-neutral-400">
            Motivo: {ingreso.motivoAnulacion}
            {ingreso.anuladaPor ? ` · ${ingreso.anuladaPor}` : ''}
          </p>
        ) : null}
      </div>
      <span className={`shrink-0 text-sm font-semibold tabular-nums ${anulado ? 'text-neutral-300 line-through' : 'text-neutral-900'}`}>
        {COP.format(ingreso.monto)}
      </span>
      {!anulado ? (
        <button
          type="button"
          onClick={onAnular}
          title="Anular ingreso"
          aria-label="Anular ingreso"
          className="flex size-8 shrink-0 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-danger-50 hover:text-danger-700"
        >
          <Ban size={15} />
        </button>
      ) : (
        <span className="size-8 shrink-0" />
      )}
    </li>
  )
}

function IngresoForm({
  categorias,
  onSaved,
  onClose,
}: {
  categorias: CategoriaIngreso[]
  onSaved: (fecha: string) => Promise<void>
  onClose: () => void
}) {
  const [fecha, setFecha] = useState(fechaLocalISO(new Date()))
  const [categoriaId, setCategoriaId] = useState(categorias.length === 1 ? categorias[0].id : '')
  const [descripcion, setDescripcion] = useState('')
  const [monto, setMonto] = useState('')
  const [metodoPago, setMetodoPago] = useState<MetodoPagoBase>('transferencia')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  // Guard síncrono contra doble envío: `disabled={saving}` no alcanza, los clics/Enter que se
  // encolan antes del re-render disparan cada uno su propio registro.
  const enVuelo = useRef(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (enVuelo.current) return
    const parsed = ingresoOtroInputSchema.safeParse({ fecha, categoriaId, descripcion, monto: Number(monto), metodoPago })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Datos inválidos')
      return
    }
    setError(null)
    enVuelo.current = true
    setSaving(true)
    try {
      await createIngresoOtro(parsed.data)
      await onSaved(parsed.data.fecha)
      toast.exito('Ingreso registrado')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar el ingreso')
      toast.desdeError(err, 'No se pudo registrar el ingreso')
    } finally {
      enVuelo.current = false
      setSaving(false)
    }
  }

  return (
    <Modal
      title="Registrar ingreso"
      subtitle="Ingreso que no viene del lavado, la nevera ni el parqueadero."
      icon={HandCoins}
      size="lg"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" type="submit" form="form-ingreso" icon={Plus} loading={saving}>
            Registrar ingreso
          </Button>
        </>
      }
    >
      <form id="form-ingreso" onSubmit={handleSubmit} className="flex flex-col gap-5">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-neutral-700">Fecha</span>
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={INPUT_GRANDE} />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-neutral-700">Monto</span>
            <CurrencyInput size="md" prefix="$" value={monto} onChange={setMonto} />
          </label>
        </div>

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-neutral-700">Categoría</span>
          <CustomSelect
            size="md"
            value={categoriaId}
            onChange={setCategoriaId}
            options={categorias.map((c) => ({ value: c.id, label: c.nombre }))}
            placeholder="Selecciona una categoría"
            emptyLabel="No hay categorías activas"
          />
        </label>

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-neutral-700">Descripción</span>
          <input
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            placeholder="p. ej. Alquiler de octubre — carro de comidas"
            className={INPUT_GRANDE}
          />
        </label>

        <div className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-neutral-700">Cómo se pagó</span>
          <div className="flex rounded-lg border border-neutral-300 p-1">
            {METODOS.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMetodoPago(m)}
                className={`flex-1 rounded-md px-3 py-2.5 text-sm font-medium transition-colors ${
                  metodoPago === m ? 'bg-primary-600 text-white shadow-nav-active' : 'text-neutral-600 hover:bg-neutral-50'
                }`}
              >
                {METODO_PAGO_LABEL[m]}
              </button>
            ))}
          </div>
          <p className="text-xs text-neutral-400">Informativo: este ingreso no entra al arqueo de ninguna caja.</p>
        </div>

        {error ? <p className="text-xs text-danger-600">{error}</p> : null}
      </form>
    </Modal>
  )
}

function AnularModal({
  ingreso,
  onClose,
  onAnulado,
}: {
  ingreso: IngresoOtroConCategoria
  onClose: () => void
  onAnulado: () => Promise<void>
}) {
  const [motivo, setMotivo] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const enVuelo = useRef(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (enVuelo.current) return
    const parsed = anularIngresoOtroInputSchema.safeParse({ motivo })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Datos inválidos')
      return
    }
    setError(null)
    enVuelo.current = true
    setSaving(true)
    try {
      await anularIngresoOtro(ingreso.id, parsed.data)
      await onAnulado()
      toast.exito('Ingreso anulado')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo anular el ingreso')
      toast.desdeError(err, 'No se pudo anular el ingreso')
    } finally {
      enVuelo.current = false
      setSaving(false)
    }
  }

  return (
    <Modal
      title="Anular ingreso"
      subtitle={`${ingreso.descripcion} · ${COP.format(ingreso.monto)}`}
      icon={Ban}
      size="md"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="danger" type="submit" form="form-anular-ingreso" icon={Ban} loading={saving}>
            Anular ingreso
          </Button>
        </>
      }
    >
      <form id="form-anular-ingreso" onSubmit={handleSubmit} className="flex flex-col gap-4">
        <p className="text-sm text-neutral-600">
          El ingreso no se borra: queda visible como anulado con su motivo y deja de sumar a los ingresos y la utilidad.
        </p>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-neutral-700">Motivo</span>
          <textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            rows={3}
            placeholder="p. ej. Se registró dos veces"
            className={INPUT_CLASS}
          />
        </label>
        {error ? <p className="text-xs text-danger-600">{error}</p> : null}
      </form>
    </Modal>
  )
}

function CategoriasModal({
  categorias,
  onClose,
  onChanged,
}: {
  categorias: CategoriaIngreso[]
  onClose: () => void
  onChanged: () => Promise<void>
}) {
  const [nombre, setNombre] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [confirmando, setConfirmando] = useState<CategoriaIngreso | null>(null)
  const enVuelo = useRef(false)

  async function handleCrear(event: FormEvent) {
    event.preventDefault()
    if (enVuelo.current) return
    const parsed = categoriaIngresoInputSchema.safeParse({ nombre })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Datos inválidos')
      return
    }
    setError(null)
    enVuelo.current = true
    setSaving(true)
    try {
      await createCategoriaIngreso(parsed.data)
      setNombre('')
      await onChanged()
      toast.exito('Categoría creada')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear la categoría')
      toast.desdeError(err, 'No se pudo crear la categoría')
    } finally {
      enVuelo.current = false
      setSaving(false)
    }
  }

  return (
    <>
      <Modal
        title="Categorías de ingreso"
        subtitle="Para clasificar de dónde viene cada ingreso: alquileres, patrocinios, publicidad…"
        icon={Settings2}
        size="lg"
        onClose={onClose}
      >
        <ul className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {categorias.map((categoria) => (
            <li key={categoria.id} className="flex items-start justify-between gap-2 rounded-xl border border-neutral-200 p-3.5">
              <div className="flex min-w-0 flex-col items-start gap-1">
                <span className="break-words text-sm font-semibold text-neutral-900">{categoria.nombre}</span>
                <span
                  className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                    categoria.activo ? 'bg-success-50 text-success-700' : 'bg-neutral-100 text-neutral-500'
                  }`}
                >
                  {categoria.activo ? 'Activa' : 'Inactiva'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setConfirmando(categoria)}
                className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium text-neutral-600 transition-colors hover:bg-primary-100 hover:text-primary-700"
              >
                {categoria.activo ? 'Inactivar' : 'Activar'}
              </button>
            </li>
          ))}
        </ul>

        <form onSubmit={handleCrear} className="flex flex-col gap-4 border-t border-neutral-100 pt-5">
          <h4 className="text-sm font-semibold text-neutral-900">Nueva categoría</h4>
          <label className="flex flex-col gap-1.5 text-left text-sm">
            <span className="font-medium text-neutral-700">Nombre</span>
            <input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="p. ej. Patrocinios"
              className={INPUT_CLASS}
            />
          </label>
          {error ? <p className="text-xs text-danger-600">{error}</p> : null}
          <div className="flex justify-end">
            <Button variant="primary" type="submit" icon={Plus} loading={saving}>
              Crear categoría
            </Button>
          </div>
        </form>
      </Modal>

      {confirmando ? (
        <ConfirmModal
          title={confirmando.activo ? 'Inactivar categoría' : 'Activar categoría'}
          message={
            confirmando.activo
              ? `¿Inactivar "${confirmando.nombre}"? Ya no aparecerá para registrar nuevos ingresos; los registrados se conservan.`
              : `¿Activar "${confirmando.nombre}"? Volverá a estar disponible para nuevos ingresos.`
          }
          confirmLabel={confirmando.activo ? 'Inactivar' : 'Activar'}
          variant={confirmando.activo ? 'danger' : 'primary'}
          successMessage={confirmando.activo ? 'Categoría inactivada' : 'Categoría activada'}
          onConfirm={async () => {
            await setCategoriaIngresoActivo(confirmando.id, !confirmando.activo)
            await onChanged()
            setConfirmando(null)
          }}
          onCancel={() => setConfirmando(null)}
        />
      ) : null}
    </>
  )
}
