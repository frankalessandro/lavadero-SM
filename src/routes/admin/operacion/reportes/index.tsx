import { useRef, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { CalendarRange, FileSpreadsheet, FileText, Hash, Wallet } from 'lucide-react'
import { Card } from '../../../../components/layout/Card'
import { StatCard } from '../../../../components/layout/StatCard'
import { PeriodoSelector } from '../../../../components/layout/PeriodoSelector'
import { queryKeys } from '../../../../lib/queryKeys'
import { toast } from '../../../../lib/toast'
import { calcularRango, rangoAISO, fechaLocalISO, type ModoPeriodo } from '../../../../lib/periodo'
import { REPORTES, cargarReporte, cargarTodosLosReportes, infoDe } from '../../../../lib/reportes/definiciones'
import { formatoCelda, formatoResumen, textoPeriodo } from '../../../../lib/reportes/formato'
import type { PeriodoReporte, ReporteCargado, ReporteKey } from '../../../../lib/reportes/tipos'

export const Route = createFileRoute('/admin/operacion/reportes/')({
  component: Reportes,
})

type Modo = ModoPeriodo | 'rango'

// Tope del rango libre: más allá de un año la lectura es pesada y un reporte así se parte por mes.
const MAX_DIAS_RANGO = 366
const FILAS_VISTA_PREVIA = 100

function diasEntre(desde: string, hasta: string) {
  return Math.round((new Date(`${hasta}T00:00:00`).getTime() - new Date(`${desde}T00:00:00`).getTime()) / 86_400_000) + 1
}

function armarPeriodo(periodoInicio: string, periodoFin: string, label: string): PeriodoReporte {
  return { periodoInicio, periodoFin, label, ...rangoAISO({ periodoInicio, periodoFin, label }) }
}

type Exportando = 'excel' | 'pdf' | 'todo-excel' | 'todo-pdf' | null

function Reportes() {
  const hoy = fechaLocalISO(new Date())
  const [modo, setModo] = useState<Modo>('dia')
  const [ancla, setAncla] = useState(() => new Date())
  const [desde, setDesde] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() - 6)
    return fechaLocalISO(d)
  })
  const [hasta, setHasta] = useState(hoy)
  const [key, setKey] = useState<ReporteKey>('ordenes')
  const [exportando, setExportando] = useState<Exportando>(null)
  const enVueloRef = useRef(false)

  const rangoEstandar = calcularRango(modo === 'rango' ? 'dia' : modo, ancla)
  const rangoLibreValido = desde !== '' && hasta !== '' && desde <= hasta && diasEntre(desde, hasta) <= MAX_DIAS_RANGO
  const periodo: PeriodoReporte | null =
    modo === 'rango'
      ? rangoLibreValido
        ? armarPeriodo(desde, hasta, `${desde} al ${hasta}`)
        : null
      : armarPeriodo(rangoEstandar.periodoInicio, rangoEstandar.periodoFin, rangoEstandar.label)

  const query = useQuery({
    queryKey: queryKeys.reporte(key, periodo?.periodoInicio ?? '', periodo?.periodoFin ?? ''),
    queryFn: () => cargarReporte(key, periodo as PeriodoReporte),
    enabled: periodo !== null,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  })
  const reporte = query.data

  async function exportar(tipo: Exclude<Exportando, null>) {
    if (!periodo || enVueloRef.current) return
    enVueloRef.current = true
    setExportando(tipo)
    try {
      const todos = tipo === 'todo-excel' || tipo === 'todo-pdf'
      let reportes: ReporteCargado[]
      if (todos) reportes = await cargarTodosLosReportes(periodo)
      else if (reporte) reportes = [reporte]
      else return
      const nombreBase = todos ? 'carwash-sm_reporte-completo' : `carwash-sm_${key}`
      // Los exportadores (y sus librerías) se cargan recién acá: no pesan en el resto de la app.
      if (tipo === 'excel' || tipo === 'todo-excel') {
        const { exportarExcel } = await import('../../../../lib/reportes/exportarExcel')
        await exportarExcel(reportes, periodo, nombreBase)
      } else {
        const { exportarPdf } = await import('../../../../lib/reportes/exportarPdf')
        await exportarPdf(reportes, periodo, nombreBase)
      }
      toast.exito('Reporte descargado')
    } catch (err) {
      toast.desdeError(err, 'No se pudo generar el reporte')
    } finally {
      enVueloRef.current = false
      setExportando(null)
    }
  }

  const info = infoDe(key)
  const columnasPdf = reporte ? reporte.tabla.columnas.map((c, i) => ({ c, i })).filter(({ c }) => c.enPdf !== false) : []
  const extras = reporte ? reporte.tabla.columnas.length - columnasPdf.length : 0
  const ocupado = exportando !== null

  return (
    <div className="flex flex-col gap-6 text-left">
      <div>
        <h2 className="text-base font-semibold text-neutral-900">Reportes</h2>
        <p className="max-w-3xl text-sm text-neutral-500">
          Histórico de la operación por día, semana, mes o un rango de fechas. Cada reporte se descarga en Excel
          (todas las columnas) o en PDF (hoja A4 horizontal), y también hay un reporte completo con todo el periodo.
        </p>
      </div>

      <Card className="flex flex-col gap-4 p-5">
        <div className="flex flex-wrap items-center gap-3">
          {modo === 'rango' ? (
            <>
              <label className="flex items-center gap-2 text-sm">
                <span className="font-medium text-neutral-700">Desde</span>
                <input
                  type="date"
                  value={desde}
                  max={hasta || hoy}
                  onChange={(e) => setDesde(e.target.value)}
                  className="rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none transition-colors focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
                />
              </label>
              <label className="flex items-center gap-2 text-sm">
                <span className="font-medium text-neutral-700">Hasta</span>
                <input
                  type="date"
                  value={hasta}
                  min={desde}
                  max={hoy}
                  onChange={(e) => setHasta(e.target.value)}
                  className="rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none transition-colors focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
                />
              </label>
              <button
                type="button"
                onClick={() => setModo('dia')}
                className="text-xs font-medium text-primary-600 transition-colors hover:text-primary-700"
              >
                Volver a día / semana / mes
              </button>
            </>
          ) : (
            <>
              <PeriodoSelector
                modo={modo}
                onModoChange={setModo}
                ancla={ancla}
                onAnclaChange={setAncla}
                rango={rangoEstandar}
              />
              <button
                type="button"
                onClick={() => setModo('rango')}
                className="flex items-center gap-1.5 rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-600 transition-colors hover:bg-neutral-50"
              >
                <CalendarRange size={15} />
                Rango de fechas
              </button>
            </>
          )}
        </div>
        {modo === 'rango' && !rangoLibreValido ? (
          <p className="text-xs text-danger-600">
            {desde > hasta && desde && hasta
              ? 'La fecha "desde" no puede ser posterior a "hasta".'
              : `Elige un rango válido de máximo ${MAX_DIAS_RANGO} días.`}
          </p>
        ) : null}

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {REPORTES.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={() => setKey(r.key)}
              className={`rounded-xl border px-3 py-2.5 text-left transition-colors ${
                key === r.key
                  ? 'border-primary-600 bg-primary-50 text-primary-700'
                  : 'border-neutral-200 text-neutral-700 hover:bg-neutral-50'
              }`}
            >
              <span className="block text-sm font-semibold">{r.label}</span>
            </button>
          ))}
        </div>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-neutral-900">{info.label}</h3>
          <p className="text-sm text-neutral-500">
            {info.descripcion}
            {periodo ? ` · ${textoPeriodo(periodo)}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!reporte || ocupado}
            onClick={() => exportar('excel')}
            className="flex items-center gap-1.5 rounded-lg bg-primary-600 px-3 py-2 text-sm font-medium text-white shadow-nav-active transition-colors hover:bg-primary-700 disabled:opacity-50"
          >
            <FileSpreadsheet size={15} />
            {exportando === 'excel' ? 'Generando…' : 'Excel'}
          </button>
          <button
            type="button"
            disabled={!reporte || ocupado}
            onClick={() => exportar('pdf')}
            className="flex items-center gap-1.5 rounded-lg bg-primary-600 px-3 py-2 text-sm font-medium text-white shadow-nav-active transition-colors hover:bg-primary-700 disabled:opacity-50"
          >
            <FileText size={15} />
            {exportando === 'pdf' ? 'Generando…' : 'PDF'}
          </button>
          <button
            type="button"
            disabled={!periodo || ocupado}
            onClick={() => exportar('todo-excel')}
            className="flex items-center gap-1.5 rounded-lg border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50 disabled:opacity-50"
          >
            <FileSpreadsheet size={15} />
            {exportando === 'todo-excel' ? 'Generando…' : 'Todo el periodo (Excel)'}
          </button>
          <button
            type="button"
            disabled={!periodo || ocupado}
            onClick={() => exportar('todo-pdf')}
            className="flex items-center gap-1.5 rounded-lg border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50 disabled:opacity-50"
          >
            <FileText size={15} />
            {exportando === 'todo-pdf' ? 'Generando…' : 'Todo el periodo (PDF)'}
          </button>
        </div>
      </div>

      {query.isError ? (
        <Card className="border-l-4 border-l-danger-500 p-5 text-sm text-danger-700">
          No se pudo cargar el reporte: {query.error instanceof Error ? query.error.message : 'error desconocido'}
        </Card>
      ) : null}

      {query.isPending && periodo ? <p className="text-sm text-neutral-400">Cargando…</p> : null}

      {reporte ? (
        <>
          {reporte.tabla.resumen.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {reporte.tabla.resumen.map((item) => (
                <StatCard
                  key={item.etiqueta}
                  label={item.etiqueta}
                  value={formatoResumen(item)}
                  icon={item.tipo === 'moneda' ? Wallet : Hash}
                />
              ))}
            </div>
          ) : null}

          <Card className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-neutral-200 text-left text-xs font-medium uppercase tracking-wide text-neutral-500">
                    {columnasPdf.map(({ c }) => (
                      <th
                        key={c.encabezado}
                        className={`px-4 py-3 ${c.tipo === 'moneda' || c.tipo === 'numero' ? 'text-right' : ''}`}
                      >
                        {c.encabezado}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {reporte.tabla.filas.slice(0, FILAS_VISTA_PREVIA).map((fila, r) => (
                    <tr key={r} className="border-b border-neutral-100 last:border-0">
                      {columnasPdf.map(({ c, i }) => (
                        <td
                          key={c.encabezado}
                          className={`px-4 py-2.5 text-neutral-700 ${c.tipo === 'moneda' || c.tipo === 'numero' ? 'text-right tabular-nums' : ''}`}
                        >
                          {formatoCelda(fila[i], c.tipo)}
                        </td>
                      ))}
                    </tr>
                  ))}
                  {reporte.tabla.filas.length === 0 ? (
                    <tr>
                      <td className="px-4 py-6 text-center text-neutral-400" colSpan={columnasPdf.length}>
                        Sin registros en este periodo.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </Card>
          <p className="-mt-3 text-xs text-neutral-500">
            {reporte.tabla.filas.length > FILAS_VISTA_PREVIA
              ? `Vista previa de ${FILAS_VISTA_PREVIA} de ${reporte.tabla.filas.length} registros — el archivo trae todos. `
              : `${reporte.tabla.filas.length} registros. `}
            {extras > 0 ? `El Excel incluye ${extras} columnas más que no caben en la hoja del PDF.` : ''}
          </p>
        </>
      ) : null}
    </div>
  )
}
