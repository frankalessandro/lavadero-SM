import { useId } from 'react'

interface LavadoAnimationProps {
  active?: boolean
  className?: string
}

// Despachador — la tarjeta "en proceso" de /jefe-zona pide una u otra según la categoría del
// tipo de vehículo (moto vs. auto/camioneta, ver `categoriaVehiculoSchema`), nunca ambas a la vez.
export function LavadoAnimation({ tipo, active = true, className = '' }: LavadoAnimationProps & { tipo: 'moto' | 'auto' }) {
  return tipo === 'moto' ? (
    <LavadoAnimationMoto active={active} className={className} />
  ) : (
    <LavadoAnimationAuto active={active} className={className} />
  )
}

// Versión mínima: solo el vehículo y la manguera echándole agua (sin burbujas, chispas de brillo
// ni goteo). Las animaciones (keyframes + clases `.lavado-*`) viven en src/index.css, no aquí —
// con varias tarjetas en pantalla, un <style> completo por instancia duplicaba el CSS y causaba
// el lag/desincronía de scroll que se reportó (ver esa sección de index.css para el detalle).
// Ids de gradientes sí se generan por instancia con `useId()`, porque esos son `id` de SVG,
// globales al documento — no se pueden compartir entre tarjetas sin pisarse.
function LavadoAnimationMoto({ active = true, className = '' }: LavadoAnimationProps) {
  const uid = useId()
  const sprayGrad = `${uid}-spray`
  const metalGrad = `${uid}-metal`
  const accentGrad = `${uid}-accent`

  return (
    <svg viewBox="280 120 790 570" className={`${className} ${active ? '' : 'lavado-anim-paused'}`} aria-hidden="true">
      <defs>
        <linearGradient id={sprayGrad} x1="1" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="1" />
          <stop offset="35%" stopColor="#7dd3fc" stopOpacity="0.95" />
          <stop offset="75%" stopColor="#38bdf8" stopOpacity="0.65" />
          <stop offset="100%" stopColor="#0284c7" stopOpacity="0.2" />
        </linearGradient>
        <linearGradient id={metalGrad} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#f8fafc" />
          <stop offset="50%" stopColor="#94a3b8" />
          <stop offset="100%" stopColor="#475569" />
        </linearGradient>
        <linearGradient id={accentGrad} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#38bdf8" />
          <stop offset="100%" stopColor="#0284c7" />
        </linearGradient>
      </defs>

      <g>
        <ellipse cx="590" cy="535" rx="260" ry="18" fill="#000000" opacity="0.35" />

        <g strokeLinecap="round" strokeLinejoin="round" fill="none">
          <circle cx="360" cy="490" r="38" stroke="#334155" strokeWidth="3" strokeDasharray="8 6" />
          <circle cx="780" cy="490" r="38" stroke="#334155" strokeWidth="3" strokeDasharray="8 6" />
          <circle cx="360" cy="490" r="14" fill="#0f172a" stroke="#64748b" strokeWidth="4" />
          <circle cx="780" cy="490" r="14" fill="#0f172a" stroke="#64748b" strokeWidth="4" />

          <g stroke="#1e293b" strokeWidth="22">
            <path d="m 620,430 -20,-60" />
            <path d="m 320,330 120,40 a 40 40 0 0 1 40,-40 h 40 a 40 40 0 0 1 39.8,36.2" />
            <path d="M 420,490 h 60 a 20 20 0 0 0 20,-20 120 120 0 0 1 120,-120 20 20 0 0 0 20,-20 v -15 A 100 100 0 0 0 600,250" />
            <circle cx="780" cy="490" r="60" />
            <circle cx="360" cy="490" r="60" />
          </g>

          <path d="m 620,430 -20,-60" stroke="#38bdf8" strokeWidth="8" />
          <path d="m 320,330 120,40 a 40 40 0 0 1 40,-40 h 40 a 40 40 0 0 1 39.8,36.2" stroke={`url(#${metalGrad})`} strokeWidth="12" />
          <path
            d="M 420,490 h 60 a 20 20 0 0 0 20,-20 120 120 0 0 1 120,-120 20 20 0 0 0 20,-20 v -15 A 100 100 0 0 0 600,250"
            stroke={`url(#${accentGrad})`}
            strokeWidth="12"
          />

          <circle cx="780" cy="490" r="60" stroke="#94a3b8" strokeWidth="12" />
          <circle cx="360" cy="490" r="60" stroke="#94a3b8" strokeWidth="12" />

          <circle cx="320" cy="330" r="8" fill="#38bdf8" stroke="#ffffff" strokeWidth="2" />
          <circle cx="600" cy="250" r="7" fill="#38bdf8" stroke="#ffffff" strokeWidth="2" />
        </g>
      </g>

      <g className="lavado-anim-wand">
        <path d="M 1120,40 Q 1040,110 970,160" fill="none" stroke="#1e293b" strokeWidth="12" strokeLinecap="round" />
        <path d="M 970,160 L 890,220" fill="none" stroke="#64748b" strokeWidth="8" strokeLinecap="round" />
        <path d="M 895,216 L 880,228" fill="none" stroke="#0284c7" strokeWidth="12" strokeLinecap="round" />
        <circle cx="875" cy="232" r="5" fill="#38bdf8" />

        <g stroke={`url(#${sprayGrad})`} strokeLinecap="round">
          <line x1="870" y1="235" x2="480" y2="440" strokeWidth="6" className="lavado-jet" />
          <line x1="870" y1="235" x2="550" y2="400" strokeWidth="7.5" className="lavado-jet" />
          <line x1="870" y1="235" x2="620" y2="350" strokeWidth="6.5" className="lavado-jet" />
          <line x1="870" y1="235" x2="680" y2="430" strokeWidth="5.5" className="lavado-jet" />
          <line x1="870" y1="235" x2="760" y2="480" strokeWidth="4.5" className="lavado-jet" />
        </g>
      </g>
    </svg>
  )
}

// Misma idea que LavadoAnimationMoto pero para autos/camionetas — solo carro + manguera, sin
// brillos ni goteo. Paleta monocromática (blanco/slate) en vez del acento cian de la moto, tal
// como venía la escena de origen.
function LavadoAnimationAuto({ active = true, className = '' }: LavadoAnimationProps) {
  const uid = useId()
  const sprayGrad = `${uid}-spray`
  const strokeGrad = `${uid}-stroke`

  return (
    <svg viewBox="290 110 780 578" className={`${className} ${active ? '' : 'lavado-anim-paused'}`} aria-hidden="true">
      <defs>
        <linearGradient id={sprayGrad} x1="1" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="1" />
          <stop offset="35%" stopColor="#7dd3fc" stopOpacity="0.95" />
          <stop offset="75%" stopColor="#38bdf8" stopOpacity="0.65" />
          <stop offset="100%" stopColor="#0284c7" stopOpacity="0.2" />
        </linearGradient>
        <linearGradient id={strokeGrad} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#cbd5e1" />
          <stop offset="50%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#e2e8f0" />
        </linearGradient>
      </defs>

      <g>
        <ellipse cx="580" cy="535" rx="275" ry="16" fill="#000000" opacity="0.45" />
        <path d="M 390,360 L 460,260 L 670,260 L 740,360 Z" fill="#0f172a" opacity="0.8" />

        <g strokeLinecap="round" strokeLinejoin="round" fill="none">
          <g stroke="#0f172a" strokeWidth="16">
            <path d="M 310,410 L 310,380 Q 310,360 330,360 L 370,360 L 450,260 Q 460,250 480,250 L 670,250 Q 690,250 700,260 L 775,360 L 830,365 Q 850,368 850,390 L 850,435 Q 850,445 840,445 L 815,445" />
            <line x1="475" y1="445" x2="685" y2="445" />
            <line x1="310" y1="445" x2="345" y2="445" />
            <circle cx="410" cy="445" r="62" />
            <circle cx="750" cy="445" r="62" />
          </g>

          <path
            d="M 310,415 L 310,380 Q 310,360 330,360 L 370,360 L 450,260 Q 460,250 480,250 L 670,250 Q 690,250 700,260 L 775,360 L 830,365 Q 850,368 850,390 L 850,435 Q 850,445 840,445 L 815,445"
            stroke={`url(#${strokeGrad})`}
            strokeWidth="8"
          />
          <line x1="475" y1="445" x2="685" y2="445" stroke="#e2e8f0" strokeWidth="8" />
          <line x1="310" y1="440" x2="345" y2="440" stroke="#e2e8f0" strokeWidth="8" />

          <path d="M 465,270 L 665,270 L 735,355 L 395,355 Z" stroke="#94a3b8" strokeWidth="5" opacity="0.9" />
          <line x1="565" y1="270" x2="565" y2="355" stroke="#cbd5e1" strokeWidth="6" />

          <line x1="565" y1="365" x2="565" y2="440" stroke="#64748b" strokeWidth="4" />
          <line x1="380" y1="365" x2="380" y2="440" stroke="#64748b" strokeWidth="3" opacity="0.6" />
          <line x1="585" y1="382" x2="620" y2="382" stroke="#ffffff" strokeWidth="5" />
          <line x1="495" y1="382" x2="530" y2="382" stroke="#ffffff" strokeWidth="5" />

          <path d="M 835,385 L 848,385" stroke="#ffffff" strokeWidth="8" />
          <path d="M 312,385 L 325,385" stroke="#94a3b8" strokeWidth="8" />

          <circle cx="410" cy="445" r="58" stroke="#cbd5e1" strokeWidth="8" />
          <circle cx="410" cy="445" r="32" stroke="#64748b" strokeWidth="4" strokeDasharray="10 8" />
          <circle cx="410" cy="445" r="10" fill="#ffffff" />

          <circle cx="750" cy="445" r="58" stroke="#cbd5e1" strokeWidth="8" />
          <circle cx="750" cy="445" r="32" stroke="#64748b" strokeWidth="4" strokeDasharray="10 8" />
          <circle cx="750" cy="445" r="10" fill="#ffffff" />
        </g>
      </g>

      <g className="lavado-carro-wand">
        <path d="M 1120,50 Q 1050,110 980,160" fill="none" stroke="#1e293b" strokeWidth="12" strokeLinecap="round" />
        <path d="M 980,160 L 900,220" fill="none" stroke="#64748b" strokeWidth="8" strokeLinecap="round" />
        <path d="M 905,216 L 890,228" fill="none" stroke="#0284c7" strokeWidth="12" strokeLinecap="round" />
        <circle cx="885" cy="232" r="5" fill="#38bdf8" />

        <g stroke={`url(#${sprayGrad})`} strokeLinecap="round">
          <line x1="880" y1="235" x2="490" y2="250" strokeWidth="6" className="lavado-carro-jet" />
          <line x1="880" y1="235" x2="630" y2="260" strokeWidth="7.5" className="lavado-carro-jet" />
          <line x1="880" y1="235" x2="720" y2="340" strokeWidth="7" className="lavado-carro-jet" />
          <line x1="880" y1="235" x2="810" y2="370" strokeWidth="6.5" className="lavado-carro-jet" />
          <line x1="880" y1="235" x2="750" y2="445" strokeWidth="5.5" className="lavado-carro-jet" />
        </g>
      </g>
    </svg>
  )
}
