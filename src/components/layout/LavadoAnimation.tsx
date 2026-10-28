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
        <linearGradient id={accentGrad} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#38bdf8" />
          <stop offset="100%" stopColor="#0284c7" />
        </linearGradient>
      </defs>

      {/* Naked de perfil mirando a la manguera (derecha): líneas gruesas en tres tonos — contorno
          slate, metal gris y carrocería en el celeste de marca con relleno tenue. Ejes en
          (360,490) y (780,490); los chorros apuntan a esa zona, no moverlos sin ajustar
          `lavado-jet`. Se pinta de atrás hacia adelante para que la horquilla y el carenado
          queden encima. */}
      <g strokeLinecap="round" strokeLinejoin="round" fill="none">
        <ellipse cx="572" cy="572" rx="292" ry="11" fill="#0f172a" opacity="0.1" stroke="none" />

        {/* Ruedas: llanta, rin, disco adelante y eje */}
        <circle cx="360" cy="490" r="70" stroke="#1e293b" strokeWidth="20" />
        <circle cx="780" cy="490" r="70" stroke="#1e293b" strokeWidth="20" />
        <circle cx="360" cy="490" r="40" stroke="#94a3b8" strokeWidth="8" />
        <circle cx="780" cy="490" r="40" stroke="#94a3b8" strokeWidth="8" />
        <circle cx="780" cy="490" r="24" stroke="#cbd5e1" strokeWidth="5" />
        <circle cx="360" cy="490" r="14" fill="#1e293b" stroke="none" />
        <circle cx="780" cy="490" r="14" fill="#1e293b" stroke="none" />

        {/* Basculante */}
        <path d="M 360,490 L 524,458" stroke="#94a3b8" strokeWidth="16" />

        {/* Escape: sale bajo el motor y sube hacia atrás */}
        <path d="M 600,526 C 560,540 500,536 470,516 L 430,470" stroke="#94a3b8" strokeWidth="13" />
        <path d="M 438,480 L 418,452" stroke="#1e293b" strokeWidth="22" />

        {/* Subchasis y porta-placa */}
        <path d="M 346,346 L 506,446" stroke="#1e293b" strokeWidth="12" />
        <path d="M 328,350 C 312,366 302,386 298,408" stroke="#1e293b" strokeWidth="10" />
        <path d="M 290,410 H 310" stroke={`url(#${accentGrad})`} strokeWidth="10" />

        {/* Motor con aletas */}
        <path
          d="M 516,404 H 632 C 650,404 662,418 662,436 V 486 C 662,510 646,526 622,526 H 540 C 522,526 510,512 512,494 Z"
          stroke="#1e293b"
          strokeWidth="14"
        />
        <path d="M 538,436 H 636 M 538,462 H 636 M 538,488 H 636" stroke="#94a3b8" strokeWidth="7" />

        {/* Carrocería en un solo trazo: cola en punta, asiento escalonado y tanque */}
        <path
          d="M 290,296 L 400,314 C 410,316 416,322 418,332 L 422,342 L 512,356 C 520,320 548,294 592,290 C 638,286 670,300 684,324 L 692,350 C 662,380 612,394 558,396 L 506,392 L 402,378 C 356,372 322,350 304,322 Z"
          fill={`url(#${accentGrad})`}
          fillOpacity="0.12"
          stroke={`url(#${accentGrad})`}
          strokeWidth="14"
        />
        <path d="M 540,334 C 562,314 594,306 632,310" stroke="#ffffff" strokeWidth="8" />
        <path d="M 300,302 L 296,316" stroke="#f87171" strokeWidth="10" />

        {/* Horquilla */}
        <path d="M 706,344 L 780,490" stroke="#1e293b" strokeWidth="22" />
        <path d="M 706,344 L 780,490" stroke="#94a3b8" strokeWidth="10" />

        {/* Guardabarros delantero */}
        <path d="M 722,436 A 72 72 0 0 1 846,452" stroke={`url(#${accentGrad})`} strokeWidth="12" />

        {/* Manubrio y retrovisor */}
        <path d="M 634,302 C 652,296 670,298 686,308" stroke="#1e293b" strokeWidth="12" />
        <path d="M 668,302 L 660,242" stroke="#1e293b" strokeWidth="8" />
        <ellipse
          cx="656"
          cy="226"
          rx="11"
          ry="16"
          fill={`url(#${accentGrad})`}
          fillOpacity="0.12"
          stroke={`url(#${accentGrad})`}
          strokeWidth="8"
        />

        {/* Carenado con farola */}
        <path
          d="M 702,370 L 696,312 C 698,300 706,292 718,286 C 746,308 758,340 754,378 Z"
          fill={`url(#${accentGrad})`}
          fillOpacity="0.12"
          stroke={`url(#${accentGrad})`}
          strokeWidth="14"
        />
        <path d="M 742,326 C 748,338 750,350 748,362" stroke="#ffffff" strokeWidth="7" />
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
// brillos ni goteo, con la misma paleta de la moto (slate, gris y celeste de marca).
function LavadoAnimationAuto({ active = true, className = '' }: LavadoAnimationProps) {
  const uid = useId()
  const sprayGrad = `${uid}-spray`
  const accentGrad = `${uid}-accent`

  return (
    <svg viewBox="290 110 780 578" className={`${className} ${active ? '' : 'lavado-anim-paused'}`} aria-hidden="true">
      <defs>
        <linearGradient id={sprayGrad} x1="1" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="1" />
          <stop offset="35%" stopColor="#7dd3fc" stopOpacity="0.95" />
          <stop offset="75%" stopColor="#38bdf8" stopOpacity="0.65" />
          <stop offset="100%" stopColor="#0284c7" stopOpacity="0.2" />
        </linearGradient>
        <linearGradient id={accentGrad} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#38bdf8" />
          <stop offset="100%" stopColor="#0284c7" />
        </linearGradient>
      </defs>

      {/* Carro de perfil mirando a la manguera (derecha), mismo estilo de la moto: líneas gruesas
          en slate, gris y celeste de marca con relleno tenue. Ejes en (410,445) y (750,445); los
          chorros apuntan a esa zona, no moverlos sin ajustar `lavado-carro-jet`. Las ruedas van
          al final, encima de los pasos de rueda de la carrocería. */}
      <g strokeLinecap="round" strokeLinejoin="round" fill="none">
        <ellipse cx="584" cy="528" rx="300" ry="11" fill="#0f172a" opacity="0.1" stroke="none" />

        {/* Carrocería en un solo trazo, con los pasos de rueda */}
        <path
          d="M 334,445 L 322,445 C 314,445 310,440 310,432 L 310,396 C 310,380 318,370 334,366 L 396,354 L 462,282 C 470,272 480,266 494,266 L 640,264 C 654,264 664,270 672,280 L 734,350 L 830,366 C 848,370 858,382 858,398 L 858,428 C 858,438 852,445 842,445 L 826,445 A 76 76 0 0 0 674,445 L 486,445 A 76 76 0 0 0 334,445 Z"
          fill={`url(#${accentGrad})`}
          fillOpacity="0.12"
          stroke={`url(#${accentGrad})`}
          strokeWidth="14"
        />

        {/* Ventanas con parante central y brillo */}
        <path d="M 414,350 L 474,288 C 478,284 484,282 490,282 L 556,282 L 556,350 Z" fill="#e0f2fe" stroke="#94a3b8" strokeWidth="8" />
        <path d="M 580,350 L 580,282 L 636,282 C 642,282 648,284 652,288 L 708,350 Z" fill="#e0f2fe" stroke="#94a3b8" strokeWidth="8" />
        <path d="M 482,300 L 506,300" stroke="#ffffff" strokeWidth="6" />

        {/* Puertas, manijas y línea de cintura */}
        <path d="M 568,356 V 432" stroke="#94a3b8" strokeWidth="6" />
        <path d="M 452,380 H 482 M 600,380 H 630" stroke="#1e293b" strokeWidth="8" />
        <path d="M 500,368 C 560,364 620,364 668,368" stroke="#ffffff" strokeWidth="6" />

        {/* Farola, stop y retrovisor */}
        <path d="M 838,386 L 856,392" stroke="#fde68a" strokeWidth="10" />
        <path d="M 312,384 V 404" stroke="#f87171" strokeWidth="10" />
        <path d="M 716,352 C 724,340 736,338 744,344 L 738,356 Z" fill={`url(#${accentGrad})`} stroke="#1e293b" strokeWidth="6" />

        {/* Ruedas: llanta, rin y eje */}
        <circle cx="410" cy="445" r="58" stroke="#1e293b" strokeWidth="22" />
        <circle cx="750" cy="445" r="58" stroke="#1e293b" strokeWidth="22" />
        <circle cx="410" cy="445" r="32" stroke="#94a3b8" strokeWidth="8" />
        <circle cx="750" cy="445" r="32" stroke="#94a3b8" strokeWidth="8" />
        <circle cx="410" cy="445" r="12" fill="#1e293b" stroke="none" />
        <circle cx="750" cy="445" r="12" fill="#1e293b" stroke="none" />
      </g>

      <g className="lavado-carro-wand">
        <path d="M 1120,50 Q 1050,110 980,160" fill="none" stroke="#1e293b" strokeWidth="12" strokeLinecap="round" />
        <path d="M 980,160 L 900,220" fill="none" stroke="#64748b" strokeWidth="8" strokeLinecap="round" />
        <path d="M 905,216 L 890,228" fill="none" stroke="#0284c7" strokeWidth="12" strokeLinecap="round" />
        <circle cx="885" cy="232" r="5" fill="#38bdf8" />

        <g stroke={`url(#${sprayGrad})`} strokeLinecap="round">
          <line x1="880" y1="235" x2="500" y2="270" strokeWidth="6" className="lavado-carro-jet" />
          <line x1="880" y1="235" x2="630" y2="268" strokeWidth="7.5" className="lavado-carro-jet" />
          <line x1="880" y1="235" x2="720" y2="340" strokeWidth="7" className="lavado-carro-jet" />
          <line x1="880" y1="235" x2="810" y2="370" strokeWidth="6.5" className="lavado-carro-jet" />
          <line x1="880" y1="235" x2="750" y2="445" strokeWidth="5.5" className="lavado-carro-jet" />
        </g>
      </g>
    </svg>
  )
}
