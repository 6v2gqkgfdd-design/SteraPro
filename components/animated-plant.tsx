/**
 * Schattig geanimeerd plantje voor de publieke /p/[slug] pagina.
 * Het uitzicht past zich aan op basis van de plantstatus.
 */

export type PlantMood = 'healthy' | 'needs-attention' | 'dying' | 'dead'

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
  },
}

export default function AnimatedPlant({
  mood,
  className = '',
}: {
  mood: PlantMood
  className?: string
}) {
  const p = PALETTES[mood]
  const isDead = mood === 'dead'
  const isDying = mood === 'dying'
  const isHealthy = mood === 'healthy'
  const isAttention = mood === 'needs-attention'

  return (
    <div
      className={`stera-plant stera-plant--${mood} ${className}`}
      role="img"
      aria-label={moodLabel(mood)}
    >
      <style>{ANIM_CSS}</style>

      <svg viewBox="0 0 240 260" xmlns="http://www.w3.org/2000/svg" className="stera-plant__svg">
        {/* Soft circular background blob */}
        <circle cx="120" cy="120" r="110" fill={p.bg} />

        {/* Sparkles (only when healthy) */}
        {isHealthy && (
          <g className="stera-plant__sparkles" fill={p.bgAccent}>
            <circle cx="40" cy="60" r="3.5" className="stera-plant__sparkle s1" />
            <circle cx="195" cy="55" r="2.5" className="stera-plant__sparkle s2" />
            <circle cx="200" cy="125" r="3" className="stera-plant__sparkle s3" />
            <circle cx="35" cy="140" r="2" className="stera-plant__sparkle s1" />
          </g>
        )}

        {/* Plant body — sways gently */}
        <g
          className="stera-plant__body"
          style={{ transformOrigin: '120px 200px' }}
        >
          {isDead ? (
            // ----- DEAD: tipped over, withered, no leaves up high -----
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
              {/* Fallen leaves on the ground */}
              <ellipse cx="60" cy="218" rx="14" ry="6" fill={p.leaf} transform="rotate(-15 60 218)" />
              <ellipse cx="180" cy="220" rx="12" ry="5" fill={p.leafShadow} transform="rotate(20 180 220)" />
            </g>
          ) : (
            <g>
              {/* Stem */}
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

              {/* Leaves */}
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
                cx={isDying ? 152 : 152}
                cy={isDying ? 158 : 122}
                rx="26"
                ry="14"
                fill={p.leafShadow}
                transform={`rotate(${isDying ? 12 : 35} ${isDying ? 152 : 152} ${isDying ? 158 : 122})`}
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

              {/* Face */}
              <g
                className="stera-plant__face"
                transform={`translate(120 ${isDying ? 95 : 72})`}
              >
                {/* Cheeks */}
                {!isDead && (
                  <>
                    <circle cx="-12" cy="6" r="4" fill={p.cheek} opacity="0.65" />
                    <circle cx="12" cy="6" r="4" fill={p.cheek} opacity="0.65" />
                  </>
                )}

                {/* Eyes — closed for healthy blink */}
                <Eye x={-9} y={0} mood={mood} side="left" face={p.face} />
                <Eye x={9} y={0} mood={mood} side="right" face={p.face} />

                {/* Mouth */}
                <Mouth mood={mood} face={p.face} />

                {/* Tear drop for dying */}
                {isDying && (
                  <path
                    d="M-9,4 q-1,5 -2,7 q-1,2 1,2 q2,0 1,-2 q-1,-2 0,-7"
                    fill="#5BA8E0"
                    className="stera-plant__tear"
                  />
                )}
              </g>
            </g>
          )}

          {/* Pot */}
          <g>
            {/* Pot rim */}
            <path
              d="M70,196 L170,196 L165,210 L75,210 Z"
              fill={p.potRim}
            />
            {/* Pot body */}
            <path
              d="M77,210 L163,210 L153,244 L87,244 Z"
              fill={p.pot}
            />
            {/* Pot shadow */}
            <path
              d="M153,244 L163,210 L161,210 L150,244 Z"
              fill={p.potShadow}
              opacity="0.5"
            />
            {/* Soil */}
            {!isDead && (
              <ellipse
                cx="120"
                cy="200"
                rx="48"
                ry="3.5"
                fill="#3A2618"
                opacity="0.85"
              />
            )}
          </g>
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

function Eye({
  x,
  y,
  mood,
  face,
}: {
  x: number
  y: number
  mood: PlantMood
  side: 'left' | 'right'
  face: string
}) {
  if (mood === 'dead') {
    // X eye
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
      <path
        d="M-7,8 Q0,15 7,8"
        stroke={face}
        strokeWidth="2.2"
        fill="none"
        strokeLinecap="round"
      />
    )
  }
  if (mood === 'needs-attention') {
    return (
      <path
        d="M-6,11 Q0,11 6,11"
        stroke={face}
        strokeWidth="2.2"
        fill="none"
        strokeLinecap="round"
      />
    )
  }
  if (mood === 'dying') {
    return (
      <path
        d="M-7,12 Q0,8 7,12"
        stroke={face}
        strokeWidth="2.2"
        fill="none"
        strokeLinecap="round"
      />
    )
  }
  // dead
  return (
    <path
      d="M-5,12 Q0,9 5,12"
      stroke={face}
      strokeWidth="2"
      fill="none"
      strokeLinecap="round"
    />
  )
}

const ANIM_CSS = `
.stera-plant { display: inline-block; width: 100%; max-width: 320px; }
.stera-plant__svg { width: 100%; height: auto; }

/* Healthy: cheerful sway + bouncing top leaf + occasional blink */
.stera-plant--healthy .stera-plant__body {
  animation: stera-sway 4s ease-in-out infinite;
}
.stera-plant--healthy .stera-plant__leaf--top {
  transform-origin: 120px 90px;
  animation: stera-bounce 2.4s ease-in-out infinite;
}
.stera-plant--healthy .stera-plant__leaf--left {
  transform-origin: 88px 132px;
  animation: stera-wiggle 3.2s ease-in-out infinite;
}
.stera-plant--healthy .stera-plant__leaf--right {
  transform-origin: 152px 122px;
  animation: stera-wiggle 3.2s 0.4s ease-in-out infinite reverse;
}
.stera-plant--healthy .stera-plant__eye {
  animation: stera-blink 5s ease-in-out infinite;
  transform-origin: center;
}
.stera-plant--healthy .stera-plant__sparkle {
  animation: stera-sparkle 3s ease-in-out infinite;
}
.stera-plant--healthy .stera-plant__sparkle.s2 { animation-delay: 0.6s; }
.stera-plant--healthy .stera-plant__sparkle.s3 { animation-delay: 1.2s; }

/* Needs attention: gentler sway, no bounce */
.stera-plant--needs-attention .stera-plant__body {
  animation: stera-sway-slow 6s ease-in-out infinite;
}
.stera-plant--needs-attention .stera-plant__eye {
  animation: stera-blink 7s ease-in-out infinite;
}

/* Dying: very slow breathing, drooping leaves, falling tear */
.stera-plant--dying .stera-plant__body {
  animation: stera-breathe 5s ease-in-out infinite;
  transform-origin: 120px 200px;
}
.stera-plant--dying .stera-plant__tear {
  transform-origin: -9px 4px;
  animation: stera-tear 4s ease-in-out infinite;
}

/* Dead: no animation */

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

/* Reduced motion: stop all */
@media (prefers-reduced-motion: reduce) {
  .stera-plant__body,
  .stera-plant__leaf--top,
  .stera-plant__leaf--left,
  .stera-plant__leaf--right,
  .stera-plant__eye,
  .stera-plant__sparkle,
  .stera-plant__tear {
    animation: none !important;
  }
}
`
