import {
  Chart as ChartJS,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  type ChartOptions,
} from 'chart.js'

// Solo lo necesario para barras — nada de ArcElement/DoughnutController (no usamos donut,
// ver nota de diseño más abajo) ni PointElement/LineElement (no hay serie de tiempo todavía).
// Cada pieza que se registra es la que decide cuánto pesa este chunk en el build.
ChartJS.register(BarElement, CategoryScale, LinearScale, Tooltip)

// Paleta — tomada directo de los tokens de `src/index.css` (@theme), no valores nuevos.
// La mayoría de nuestros charts son UNA sola métrica por categoría (tiempo promedio por
// combo, comisiones por lavador, gastos por categoría) — eso es nominal categórico de una
// sola serie: todas las barras van del mismo color (primary-600), nunca un color por barra
// ("colorear barras nominales por su valor" gasta el canal de identidad en algo que el
// largo de la barra ya muestra). Donde el color sí encodea algo real (stock bajo mínimo) se
// usa la paleta de estado (danger), no un color "categórico" más.
export const CHART_COLORS = {
  primary: '#1c7fd6', // --color-primary-600
  primarySoft: '#eff8ff', // --color-primary-50
  success: '#16a34a', // --color-success-600 — segunda categoría cuando de verdad hay 2 series (ej. línea de negocio)
  danger: '#dc2626', // --color-danger-600 — solo para estado (bajo stock mínimo), nunca como "serie 2"
  grid: '#e2e8f0', // --color-neutral-200 — gridlines recesivas
  text: '#64748b', // --color-neutral-500 — texto de ejes/tooltip
  surface: '#ffffff',
} as const

const FONT_FAMILY = "'Plus Jakarta Sans', system-ui, sans-serif"

ChartJS.defaults.font.family = FONT_FAMILY
ChartJS.defaults.color = CHART_COLORS.text

// Opciones base compartidas por todos los BarChart — gridlines hairline sólidas (nunca
// punteadas), sin leyenda (una sola serie no la necesita, el título del Card ya dice qué se
// grafica), tooltip con el estilo del sistema.
export function baseBarOptions(horizontal: boolean): ChartOptions<'bar'> {
  const valueAxis = {
    grid: { color: CHART_COLORS.grid, drawTicks: false },
    border: { display: false },
    ticks: { color: CHART_COLORS.text, font: { size: 11 } },
  }
  const categoryAxis = {
    grid: { display: false },
    border: { display: false },
    ticks: { color: CHART_COLORS.text, font: { size: 11 } },
  }

  return {
    indexAxis: horizontal ? 'y' : 'x',
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#0f172a',
        padding: 8,
        cornerRadius: 8,
        titleFont: { family: FONT_FAMILY, size: 12, weight: 'normal' },
        bodyFont: { family: FONT_FAMILY, size: 12, weight: 'bold' },
        displayColors: false,
      },
    },
    scales: horizontal ? { x: valueAxis, y: categoryAxis } : { x: categoryAxis, y: valueAxis },
  }
}
