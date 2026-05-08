/**
 * Schattig geanimeerd plantje voor de publieke /p/[slug] pagina.
 * Het uitzicht past zich aan op basis van de plantstatus én op basis
 * van een (deterministisch) gekozen variant zodat verschillende
 * planten afwisselende vormen krijgen.
 */

export type PlantMood = 'healthy' | 'needs-attention' | 'dying' | 'dead'
export type PlantVariant =
  | 'classic'
  | 'cactus'
  | 'succulent'
  | 'bloom'

const VARIANTS: PlantVariant[] = ['classic', 'cactus', 'succulent', 'bloom']

/** Deterministische djb2-hash → kies variant op basis van een seed (slug/id). */
export function pickPlantVariant(seed?: string | null): PlantVariant {
  if (!seed) return 'classic'
  let h = 5381
  for (let i = 0; i < seed.length; i++) {
    h = ((h << 5) + h + seed.charCodeAt(i)) | 0
  }
  return VARIANTS[Math.abs(h) % VARIANTS.length]
}

type Palette = {
  leaf: string
  leafShadow: string
  stem: string
  pot: string
  potShadow: string
  potRim: string
  face: string
  cheek: string
  bg: string
  bgAccent: string
  bloom: string
}

const PALETTES: Record<PlantMood, Palette> = {
  healthy: {
    leaf: '#62B98A',
    leafShadow: '#3E8A5D',
    stem: '#3E8A5D',
    pot: '#D17E5E',
    potShadow: '#A65C40',
    potRim: '#7A4632',
    face: '#16221A',
    cheek: '#FF9C9C',
    bg: '#E2F1DA',
    bgAccent: '#FFE9A8',
    bloom: '#FF9CB3',
  },
  'needs-attention': {
    leaf: '#A2C586',
    leafShadow: '#7CA666',
    stem: '#6E8E58',
    pot: '#CC7C5C',
    potShadow: '#A65C40',
    potRim: '#7A4632',
    face: '#1F2A1A',
    cheek: '#F0B89B',
    bg: '#FBEFD8',
    bgAccent: '#F4D7A5',
    bloom: '#E0A8B4',
  },
  dying: {
    leaf: '#C8AA6E',
    leafShadow: '#9C7A48',
    stem: '#7A5C34',
    pot: '#C97757',
    potShadow: '#A05538',
    potRim: '#74402C',
    face: '#3A2A14',
    cheek: '#E0BFA8',
    bg: '#F7E7C2',
    bgAccent: '#E8D29A',
    bloom: '#C9A48B',
  },
  dead: {
    leaf: '#7A5C3E',
    leafShadow: '#5A3E2A',
    stem: '#3A2A18',
    pot: '#A56548',
    potShadow: '#7C4630',
    potRim: '#5C3324',
    face: '#1A1A1A',
    cheek: 'transparent',
    bg: '#E0D6C5',
    bgAccent: '#C9BCA5',
    bloom: '#8A6E54',
  },
}

export default function AnimatedPlant({
  mood,
  variant,
  seed,
  className = '',
}: {
  mood: PlantMood
  /** Optioneel: forceer een specifieke variant. */
  variant?: PlantVariant
  /** Optioneel: een string (bv. slug) die deterministisch een variant kiest. */
  seed?: string | null
  className?: string
}) {
  const chosen = variant ?? pickPlantVariant(seed)
  const p = PALETTES[mood]

  return (
    <div
      className={`stera-plant stera-plant--${mood} stera-plant--${chosen} ${className}`}
      role="img"
      aria-label={moodLabel(mood)}
    >
      <style>{ANIM_CSS}</style>

      <svg
        viewBox="0 0 240 260"
        xmlns="http://www.w3.org/2000/svg"
        className="stera-plant__svg"
      >
        <circle cx="120" cy="120" r="110" fill={p.bg} />

        {mood === 'healthy' ? (
          <g className="stera-plant__sparkles" fill={p.bgAccent}>
            <circle cx="40" cy="60" r="3.5" className="stera-plant__sparkle s1" />
            <circle cx="195" cy="55" r="2.5" className="stera-plant__sparkle s2" />
            <circle cx="200" cy="125" r="3" className="stera-plant__sparkle s3" />
            <circle cx="35" cy="140" r="2" className="stera-plant__sparkle s1" />
          </g>
        ) : null}

        <g
          className="stera-plant__body"
          style={{ transformOrigin: '120px 200px' }}
        >
          {chosen === 'classic' && <ClassicBody mood={mood} p={p} />}
          {chosen === 'cactus' && <CactusBody mood={mood} p={p} />}
          {chosen === 'succulent' && <SucculentBody mood={mood} p={p} />}
          {chosen === 'bloom' && <BloomBody mood={mood} p={p} />}

          <Pot p={p} hideSoil={mood === 'dead'} />
        </g>
      </svg>
    </div>
  )
}

function moodLabel(mood: PlantMood) {
  switch (mood) {
    case 'healthy':
      return 'Vrolijk plantje'
    case 'needs-attention':
      return 'Plantje dat aandacht nodig heeft'
    case 'dying':
      return 'Plantje dat zich niet goed voelt'
    case 'dead':
      return 'Plantje is overleden'
  }
}

// ─── Pot (gedeeld) ───────────────────────────────────────────────
function Pot({ p, hideSoil }: { p: Palette; hideSoil: boolean }) {
  return (
    <g>
      <path d="M70,196 L170,196 L165,210 L75,210 Z" fill={p.potRim} />
      <path d="M77,210 L163,210 L153,244 L87,244 Z" fill={p.pot} />
      <path
        d="M153,244 L163,210 L161,210 L150,244 Z"
        fill={p.potShadow}
        opacity="0.5"
      />
      {!hideSoil && (
        <ellipse cx="120" cy="200" rx="48" ry="3.5" fill="#3A2618" opacity="0.85" />
      )}
    </g>
  )
}

// ─── Classic (bestaande variant) ─────────────────────────────────
function ClassicBody({ mood, p }: { mood: PlantMood; p: Palette }) {
  const isDead = mood === 'dead'
  const isDying = mood === 'dying'

  if (isDead) {
    return (
      <g transform="translate(0,0)">
        <g transform="rotate(-32 120 200)">
          <path
            d="M120,200 Q116,170 110,150"
            stroke={p.stem}
            strokeWidth="8"
            fill="none"
            strokeLinecap="round"
          />
          <ellipse cx="100" cy="155" rx="22" ry="11" fill={p.leaf} transform="rotate(-50 100 155)" />
          <ellipse cx="125" cy="165" rx="22" ry="11" fill={p.leafShadow} transform="rotate(20 125 165)" />
        </g>
        <ellipse cx="60" cy="218" rx="14" ry="6" fill={p.leaf} transform="rotate(-15 60 218)" />
        <ellipse cx="180" cy="220" rx="12" ry="5" fill={p.leafShadow} transform="rotate(20 180 220)" />
      </g>
    )
  }

  return (
    <g>
      <path
        d={
          isDying
            ? 'M120,200 Q118,168 122,138 Q132,118 130,98'
            : 'M120,200 Q118,160 120,120 Q121,90 120,72'
        }
        stroke={p.stem}
        strokeWidth="8"
        fill="none"
        strokeLinecap="round"
      />
      <ellipse
        className="stera-plant__leaf stera-plant__leaf--left"
        cx={isDying ? 92 : 88}
        cy={isDying ? 168 : 132}
        rx="26"
        ry="14"
        fill={p.leaf}
        transform={`rotate(${isDying ? -8 : -32} ${isDying ? 92 : 88} ${isDying ? 168 : 132})`}
      />
      <ellipse
        className="stera-plant__leaf stera-plant__leaf--right"
        cx={152}
        cy={isDying ? 158 : 122}
        rx="26"
        ry="14"
        fill={p.leafShadow}
        transform={`rotate(${isDying ? 12 : 35} 152 ${isDying ? 158 : 122})`}
      />
      <ellipse
        className="stera-plant__leaf stera-plant__leaf--top"
        cx={120}
        cy={isDying ? 95 : 70}
        rx="34"
        ry="22"
        fill={p.leaf}
        transform={`rotate(${isDying ? -4 : 0} 120 ${isDying ? 95 : 70})`}
      />

      <g
        className="stera-plant__face"
        transform={`translate(120 ${isDying ? 95 : 72})`}
      >
        <Cheeks p={p} />
        <Eye x={-9} y={0} mood={mood} face={p.face} />
        <Eye x={9} y={0} mood={mood} face={p.face} />
        <Mouth mood={mood} face={p.face} />
        {isDying && (
          <path
            d="M-9,4 q-1,5 -2,7 q-1,2 1,2 q2,0 1,-2 q-1,-2 0,-7"
            fill="#5BA8E0"
            className="stera-plant__tear"
          />
        )}
      </g>
    </g>
  )
}

// ─── Cactus (bolronde cactus met stekels) ─────────────────────────
function CactusBody({ mood, p }: { mood: PlantMood; p: Palette }) {
  const isDead = mood === 'dead'
  const isDying = mood === 'dying'

  if (isDead) {
    return (
      <g transform="rotate(-22 120 200)">
        <ellipse cx="120" cy="155" rx="42" ry="50" fill={p.leafShadow} />
        <Spikes color={p.leaf} />
      </g>
    )
  }

  return (
    <g className="stera-plant__cactus" style={{ transformOrigin: '120px 200px' }}>
      {/* Hoofdlichaam */}
      <ellipse
        cx="120"
        cy={isDying ? 150 : 140}
        rx={isDying ? 36 : 42}
        ry={isDying ? 48 : 56}
        fill={p.leaf}
      />
      {/* Verticale ribbels */}
      <path
        d="M104,108 q-3,38 0,76 M120,100 q-2,42 0,80 M136,108 q3,38 0,76"
        stroke={p.leafShadow}
        strokeWidth="2.5"
        fill="none"
        strokeLinecap="round"
        opacity="0.7"
      />
      {/* Zijarmpje (alleen healthy) */}
      {mood === 'healthy' && (
        <g className="stera-plant__cactus-arm">
          <ellipse cx="166" cy="148" rx="12" ry="20" fill={p.leaf} />
          <path
            d="M158,140 q3,12 0,18 M166,138 q2,14 0,20 M174,142 q-3,12 0,18"
            stroke={p.leafShadow}
            strokeWidth="2"
            fill="none"
            opacity="0.7"
            strokeLinecap="round"
          />
        </g>
      )}
      <Spikes color={p.leafShadow} />

      <g
        className="stera-plant__face"
        transform={`translate(120 ${isDying ? 158 : 148})`}
      >
        <Cheeks p={p} />
        <Eye x={-9} y={0} mood={mood} face={p.face} />
        <Eye x={9} y={0} mood={mood} face={p.face} />
        <Mouth mood={mood} face={p.face} />
        {isDying && (
          <path
            d="M-9,4 q-1,5 -2,7 q-1,2 1,2 q2,0 1,-2 q-1,-2 0,-7"
            fill="#5BA8E0"
            className="stera-plant__tear"
          />
        )}
      </g>

      {/* Bloem boven (alleen healthy) */}
      {mood === 'healthy' && (
        <g className="stera-plant__cactus-bloom" transform="translate(120 86)">
          <circle r="6" cx="-6" cy="-2" fill={p.bloom} />
          <circle r="6" cx="6" cy="-2" fill={p.bloom} />
          <circle r="6" cx="0" cy="-8" fill={p.bloom} />
          <circle r="6" cx="0" cy="2" fill={p.bloom} />
          <circle r="3" cx="0" cy="-3" fill="#FFE08A" />
        </g>
      )}
    </g>
  )
}

function Spikes({ color }: { color: string }) {
  // Kleine stekels rondom de cactus
  const positions = [
    [98, 116],
    [142, 116],
    [88, 140],
    [152, 140],
    [92, 168],
    [148, 168],
    [104, 184],
    [136, 184],
  ]
  return (
    <g stroke={color} strokeWidth="1.6" strokeLinecap="round">
      {positions.map(([x, y], i) => (
        <line key={i} x1={x} y1={y} x2={x + (x < 120 ? -6 : 6)} y2={y} />
      ))}
    </g>
  )
}

// ─── Succulent (rozet van puntige blaadjes) ──────────────────────
function SucculentBody({ mood, p }: { mood: PlantMood; p: Palette }) {
  const isDead = mood === 'dead'
  const isDying = mood === 'dying'

  if (isDead) {
    return (
      <g>
        <ellipse cx="120" cy="195" rx="48" ry="14" fill={p.leafShadow} opacity="0.9" />
        <ellipse cx="84" cy="200" rx="14" ry="6" fill={p.leaf} transform="rotate(-12 84 200)" />
        <ellipse cx="156" cy="200" rx="14" ry="6" fill={p.leaf} transform="rotate(15 156 200)" />
      </g>
    )
  }

  // Rozet van 8 blaadjes
  const rosette = Array.from({ length: 8 }, (_, i) => i * 45)

  return (
    <g className="stera-plant__succulent" style={{ transformOrigin: '120px 165px' }}>
      {rosette.map((angle, i) => {
        // Iets kleinere/kromme blaadjes als dying
        const ry = isDying ? 12 : 16
        return (
          <ellipse
            key={i}
            cx={120}
            cy={isDying ? 168 : 158}
            rx="10"
            ry={ry}
            fill={i % 2 === 0 ? p.leaf : p.leafShadow}
            transform={`rotate(${angle} 120 ${isDying ? 168 : 158}) translate(0 ${isDying ? 16 : 22})`}
          />
        )
      })}

      {/* Top-rosette laag */}
      {Array.from({ length: 6 }, (_, i) => i * 60).map((angle, i) => (
        <ellipse
          key={`top-${i}`}
          cx={120}
          cy={isDying ? 168 : 158}
          rx="7"
          ry="11"
          fill={i % 2 === 0 ? p.leaf : p.leafShadow}
          transform={`rotate(${angle + 30} 120 ${isDying ? 168 : 158}) translate(0 ${isDying ? 8 : 12})`}
        />
      ))}

      {/* Hartje */}
      <circle cx="120" cy={isDying ? 168 : 158} r="6" fill={p.leaf} />

      <g
        className="stera-plant__face"
        transform={`translate(120 ${isDying ? 174 : 162})`}
      >
        <Cheeks p={p} />
        <Eye x={-7} y={-2} mood={mood} face={p.face} />
        <Eye x={7} y={-2} mood={mood} face={p.face} />
        <MouthSmall mood={mood} face={p.face} />
      </g>
    </g>
  )
}

// ─── Bloom (bloemende plant met petals) ──────────────────────────
function BloomBody({ mood, p }: { mood: PlantMood; p: Palette }) {
  const isDead = mood === 'dead'
  const isDying = mood === 'dying'

  if (isDead) {
    return (
      <g transform="rotate(-25 120 200)">
        <path
          d="M120,200 Q118,170 112,150"
          stroke={p.stem}
          strokeWidth="8"
          fill="none"
          strokeLinecap="round"
        />
        <g transform="translate(110 142)">
          <ellipse cx="-10" cy="0" rx="9" ry="6" fill={p.bloom} transform="rotate(-30)" />
          <ellipse cx="10" cy="0" rx="9" ry="6" fill={p.bloom} transform="rotate(30)" />
          <ellipse cx="0" cy="-10" rx="9" ry="6" fill={p.bloom} />
          <circle r="5" fill="#A06E3C" />
        </g>
      </g>
    )
  }

  const stemPath = isDying
    ? 'M120,200 Q116,168 122,138 Q132,114 128,86'
    : 'M120,200 Q120,160 122,120 Q124,90 122,68'

  return (
    <g>
      <path
        d={stemPath}
        stroke={p.stem}
        strokeWidth="7"
        fill="none"
        strokeLinecap="round"
      />

      {/* Twee zijbladeren */}
      <ellipse
        className="stera-plant__leaf stera-plant__leaf--left"
        cx="92"
        cy={isDying ? 162 : 145}
        rx="22"
        ry="11"
        fill={p.leaf}
        transform={`rotate(${isDying ? -10 : -32} 92 ${isDying ? 162 : 145})`}
      />
      <ellipse
        className="stera-plant__leaf stera-plant__leaf--right"
        cx="150"
        cy={isDying ? 152 : 130}
        rx="22"
        ry="11"
        fill={p.leafShadow}
        transform={`rotate(${isDying ? 14 : 32} 150 ${isDying ? 152 : 130})`}
      />

      {/* Bloemkop */}
      <g
        className="stera-plant__bloom-head"
        transform={`translate(${isDying ? 128 : 122} ${isDying ? 86 : 68})`}
      >
        {/* Petals */}
        {[0, 60, 120, 180, 240, 300].map((angle, i) => (
          <ellipse
            key={i}
            cx="0"
            cy="0"
            rx="9"
            ry="16"
            fill={i % 2 === 0 ? p.bloom : p.leaf}
            transform={`rotate(${angle}) translate(0 -14)`}
            opacity="0.95"
          />
        ))}
        {/* Hartje */}
        <circle r="9" fill="#FFE08A" />
        <circle r="4" fill="#E59B4E" />

        {/* Klein gezichtje in het hart */}
        <g className="stera-plant__face">
          <Eye x={-3} y={-1} mood={mood} face={p.face} />
          <Eye x={3} y={-1} mood={mood} face={p.face} />
          <MouthTiny mood={mood} face={p.face} />
        </g>
      </g>
    </g>
  )
}

// ─── Gezichts-onderdelen (gedeeld) ───────────────────────────────
function Cheeks({ p }: { p: Palette }) {
  if (p.cheek === 'transparent') return null
  return (
    <>
      <circle cx="-12" cy="6" r="4" fill={p.cheek} opacity="0.65" />
      <circle cx="12" cy="6" r="4" fill={p.cheek} opacity="0.65" />
    </>
  )
}

function Eye({
  x,
  y,
  mood,
  face,
}: {
  x: number
  y: number
  mood: PlantMood
  face: string
}) {
  if (mood === 'dead') {
    return (
      <g stroke={face} strokeWidth="2" strokeLinecap="round">
        <line x1={x - 4} y1={y - 4} x2={x + 4} y2={y + 4} />
        <line x1={x + 4} y1={y - 4} x2={x - 4} y2={y + 4} />
      </g>
    )
  }
  return (
    <ellipse
      className="stera-plant__eye"
      cx={x}
      cy={y}
      rx="2.5"
      ry={mood === 'healthy' ? 3.5 : 3}
      fill={face}
    />
  )
}

function Mouth({ mood, face }: { mood: PlantMood; face: string }) {
  if (mood === 'healthy') {
    return (
      <path d="M-7,8 Q0,15 7,8" stroke={face} strokeWidth="2.2" fill="none" strokeLinecap="round" />
    )
  }
  if (mood === 'needs-attention') {
    return (
      <path d="M-6,11 Q0,11 6,11" stroke={face} strokeWidth="2.2" fill="none" strokeLinecap="round" />
    )
  }
  if (mood === 'dying') {
    return (
      <path d="M-7,12 Q0,8 7,12" stroke={face} strokeWidth="2.2" fill="none" strokeLinecap="round" />
    )
  }
  return (
    <path d="M-5,12 Q0,9 5,12" stroke={face} strokeWidth="2" fill="none" strokeLinecap="round" />
  )
}

function MouthSmall({ mood, face }: { mood: PlantMood; face: string }) {
  if (mood === 'healthy') {
    return (
      <path d="M-5,5 Q0,10 5,5" stroke={face} strokeWidth="1.8" fill="none" strokeLinecap="round" />
    )
  }
  if (mood === 'dying') {
    return (
      <path d="M-5,7 Q0,4 5,7" stroke={face} strokeWidth="1.8" fill="none" strokeLinecap="round" />
    )
  }
  return (
    <path d="M-4,6 Q0,6 4,6" stroke={face} strokeWidth="1.8" fill="none" strokeLinecap="round" />
  )
}

function MouthTiny({ mood, face }: { mood: PlantMood; face: string }) {
  if (mood === 'healthy') {
    return (
      <path d="M-3,3 Q0,6 3,3" stroke={face} strokeWidth="1.4" fill="none" strokeLinecap="round" />
    )
  }
  return (
    <path d="M-2,4 Q0,3 2,4" stroke={face} strokeWidth="1.4" fill="none" strokeLinecap="round" />
  )
}

// ─── Animaties ───────────────────────────────────────────────────
const ANIM_CSS = `
.stera-plant { display: inline-block; width: 100%; max-width: 320px; }
.stera-plant__svg { width: 100%; height: auto; }

/* Classic — vrolijk wuiven + bouncing top leaf */
.stera-plant--classic.stera-plant--healthy .stera-plant__body {
  animation: stera-sway 4s ease-in-out infinite;
}
.stera-plant--classic.stera-plant--healthy .stera-plant__leaf--top {
  transform-origin: 120px 90px;
  animation: stera-bounce 2.4s ease-in-out infinite;
}
.stera-plant--classic.stera-plant--healthy .stera-plant__leaf--left {
  transform-origin: 88px 132px;
  animation: stera-wiggle 3.2s ease-in-out infinite;
}
.stera-plant--classic.stera-plant--healthy .stera-plant__leaf--right {
  transform-origin: 152px 122px;
  animation: stera-wiggle 3.2s 0.4s ease-in-out infinite reverse;
}

/* Cactus — ademend, armpje wiebelt, bloem pulseert */
.stera-plant--cactus.stera-plant--healthy .stera-plant__cactus {
  animation: stera-cactus-bob 3.6s ease-in-out infinite;
}
.stera-plant--cactus.stera-plant--healthy .stera-plant__cactus-arm {
  transform-origin: 166px 168px;
  animation: stera-wiggle 2.6s ease-in-out infinite;
}
.stera-plant--cactus.stera-plant--healthy .stera-plant__cactus-bloom {
  transform-origin: 120px 86px;
  animation: stera-bloom-pulse 2.8s ease-in-out infinite;
}
.stera-plant--cactus.stera-plant--needs-attention .stera-plant__cactus {
  animation: stera-cactus-bob 5.5s ease-in-out infinite;
}

/* Succulent — zacht draaien + kloppend hartje */
.stera-plant--succulent.stera-plant--healthy .stera-plant__succulent {
  animation: stera-succulent-spin 18s linear infinite, stera-succulent-pulse 2.4s ease-in-out infinite;
}
.stera-plant--succulent.stera-plant--needs-attention .stera-plant__succulent {
  animation: stera-succulent-pulse 4s ease-in-out infinite;
}

/* Bloom — zwiepende stengel + draaiende bloemkop */
.stera-plant--bloom.stera-plant--healthy .stera-plant__body {
  animation: stera-sway 4.5s ease-in-out infinite;
}
.stera-plant--bloom.stera-plant--healthy .stera-plant__bloom-head {
  animation: stera-bloom-spin 9s linear infinite;
}
.stera-plant--bloom.stera-plant--healthy .stera-plant__leaf--left {
  transform-origin: 92px 145px;
  animation: stera-wiggle 3.4s ease-in-out infinite;
}
.stera-plant--bloom.stera-plant--healthy .stera-plant__leaf--right {
  transform-origin: 150px 130px;
  animation: stera-wiggle 3.4s 0.5s ease-in-out infinite reverse;
}

/* Gedeelde subtiele beweging voor 'aandacht nodig' op alle varianten */
.stera-plant--needs-attention .stera-plant__body {
  animation: stera-sway-slow 6s ease-in-out infinite;
}

/* Dying — slow breathing + traan */
.stera-plant--dying .stera-plant__body {
  animation: stera-breathe 5s ease-in-out infinite;
  transform-origin: 120px 200px;
}
.stera-plant--dying .stera-plant__tear {
  transform-origin: -9px 4px;
  animation: stera-tear 4s ease-in-out infinite;
}

/* Sparkles + blink op alle healthy varianten */
.stera-plant--healthy .stera-plant__eye {
  animation: stera-blink 5s ease-in-out infinite;
  transform-origin: center;
}
.stera-plant--healthy .stera-plant__sparkle {
  animation: stera-sparkle 3s ease-in-out infinite;
}
.stera-plant--healthy .stera-plant__sparkle.s2 { animation-delay: 0.6s; }
.stera-plant--healthy .stera-plant__sparkle.s3 { animation-delay: 1.2s; }

/* Keyframes */
@keyframes stera-sway {
  0%, 100% { transform: rotate(-2deg); }
  50%      { transform: rotate(2deg); }
}
@keyframes stera-sway-slow {
  0%, 100% { transform: rotate(-1deg); }
  50%      { transform: rotate(1deg); }
}
@keyframes stera-breathe {
  0%, 100% { transform: scale(1) rotate(-3deg); }
  50%      { transform: scale(1.02) rotate(-3deg); }
}
@keyframes stera-bounce {
  0%, 100% { transform: translateY(0); }
  50%      { transform: translateY(-4px) scale(1.04); }
}
@keyframes stera-wiggle {
  0%, 100% { transform: rotate(0deg); }
  50%      { transform: rotate(4deg); }
}
@keyframes stera-blink {
  0%, 92%, 100% { transform: scaleY(1); }
  95%           { transform: scaleY(0.1); }
}
@keyframes stera-sparkle {
  0%, 100% { opacity: 0; transform: scale(0.6); }
  50%      { opacity: 1; transform: scale(1.1); }
}
@keyframes stera-tear {
  0%, 30% { opacity: 0; transform: translateY(0); }
  50%     { opacity: 1; transform: translateY(0); }
  90%     { opacity: 1; transform: translateY(8px); }
  100%    { opacity: 0; transform: translateY(10px); }
}
@keyframes stera-cactus-bob {
  0%, 100% { transform: translateY(0) scale(1); }
  50%      { transform: translateY(-2px) scale(1.02, 0.98); }
}
@keyframes stera-bloom-pulse {
  0%, 100% { transform: scale(1); }
  50%      { transform: scale(1.12); }
}
@keyframes stera-succulent-spin {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}
@keyframes stera-succulent-pulse {
  0%, 100% { filter: brightness(1); }
  50%      { filter: brightness(1.07); }
}
@keyframes stera-bloom-spin {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}

/* Reduced motion: stop alles */
@media (prefers-reduced-motion: reduce) {
  .stera-plant__body,
  .stera-plant__leaf--top,
  .stera-plant__leaf--left,
  .stera-plant__leaf--right,
  .stera-plant__eye,
  .stera-plant__sparkle,
  .stera-plant__tear,
  .stera-plant__cactus,
  .stera-plant__cactus-arm,
  .stera-plant__cactus-bloom,
  .stera-plant__succulent,
  .stera-plant__bloom-head {
    animation: none !important;
  }
}
`
