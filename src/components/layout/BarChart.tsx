import { Bar } from 'react-chartjs-2'
import { CHART_COLORS, baseBarOptions } from '../../lib/chartTheme'

interface BarChartProps {
  labels: string[]
  data: number[]
  /** Color único para todas las barras (nominal categórico de una sola serie — ver chartTheme.ts). */
  color?: string
  /** Override por barra — úsalo solo para color de ESTADO (ej. rojo = bajo stock mínimo), no como paleta decorativa. */
  colors?: string[]
  /** true (default): barras horizontales — mejor para nombres largos (combos, lavadores, categorías). */
  horizontal?: boolean
  valueFormatter?: (value: number) => string
  height?: number
  emptyLabel?: string
}

// Un solo componente para todos los charts de barra del sistema — todos nuestros gráficos son
// "una métrica por categoría" (tiempo promedio, comisiones, gastos, stock), nunca varias series
// a la vez, así que no hace falta leyenda ni una paleta categórica de 8 colores.
export function BarChart({
  labels,
  data,
  color = CHART_COLORS.primary,
  colors,
  horizontal = true,
  valueFormatter,
  height = 220,
  emptyLabel = 'Sin datos todavía.',
}: BarChartProps) {
  if (labels.length === 0) {
    return (
      <div className="flex items-center justify-center text-sm text-neutral-400" style={{ height }}>
        {emptyLabel}
      </div>
    )
  }

  const options = baseBarOptions(horizontal)
  options.plugins = {
    ...options.plugins,
    tooltip: {
      ...options.plugins?.tooltip,
      callbacks: {
        label: (ctx) => {
          const raw = typeof ctx.raw === 'number' ? ctx.raw : Number(ctx.raw)
          return valueFormatter ? valueFormatter(raw) : String(raw)
        },
      },
    },
  }
  const valueScaleKey = horizontal ? 'x' : 'y'
  options.scales = {
    ...options.scales,
    [valueScaleKey]: {
      ...(options.scales as Record<string, object>)[valueScaleKey],
      ticks: {
        color: CHART_COLORS.text,
        font: { size: 11 },
        callback: (value) => (valueFormatter ? valueFormatter(Number(value)) : String(value)),
      },
    },
  }

  return (
    <div style={{ height }}>
      <Bar
        data={{
          labels,
          datasets: [
            {
              data,
              backgroundColor: colors ?? color,
              borderRadius: 4,
              maxBarThickness: 24,
              barPercentage: 0.6,
              categoryPercentage: 0.8,
            },
          ],
        }}
        options={options}
      />
    </div>
  )
}
