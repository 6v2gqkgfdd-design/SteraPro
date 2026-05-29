/**
 * Klein illustratie-SVG voor de "Levering en installatie"-regel op
 * offertes. Een vriendelijk busje met twee plantjes die er bovenuit
 * steken — op-merk en visueel aangenamer dan een leeg foto-vakje.
 *
 * Wordt gebruikt op meerdere plekken (intern in de offerte-bouwer en
 * detailpagina, extern op de klant-pagina) zodat het uitzicht
 * consistent blijft. Maat sturen we met className/Tailwind.
 */

export default function DeliveryIllustration({
  className,
  title = 'Levering en installatie',
}: {
  className?: string
  title?: string
}) {
  return (
    <svg
      viewBox="0 0 100 80"
      role="img"
      aria-label={title}
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <title>{title}</title>
      {/* Achtergrondvlak */}
      <rect
        x="0"
        y="0"
        width="100"
        height="80"
        rx="6"
        fill="#fff8e7"
      />

      {/* Plantjes die uit de laadbak steken */}
      <g stroke="#3f6b4f" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 20 C 18 12, 22 6, 26 8 C 30 10, 28 18, 28 22" fill="#9fc8a6" />
        <path d="M40 22 C 36 10, 44 4, 48 7 C 50 12, 46 20, 46 24" fill="#9fc8a6" />
        <path d="M32 22 C 30 14, 34 10, 36 12 C 38 14, 36 20, 36 24" fill="#bfdcb9" />
      </g>

      {/* Cabine */}
      <path
        d="M60 32 L60 56 L94 56 L94 44 L82 32 Z"
        fill="#ffffff"
        stroke="#3f6b4f"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      {/* Cabineraam */}
      <path
        d="M64 34 L78 34 L88 44 L64 44 Z"
        fill="#cfe6cf"
        stroke="#3f6b4f"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      {/* Koplamp */}
      <rect
        x="90"
        y="48"
        width="4"
        height="3"
        rx="0.5"
        fill="#f4c95d"
        stroke="#3f6b4f"
        strokeWidth="0.8"
      />

      {/* Laadbak */}
      <rect
        x="6"
        y="22"
        width="56"
        height="34"
        rx="3"
        fill="#ffffff"
        stroke="#3f6b4f"
        strokeWidth="2"
      />
      {/* Stera-streepje op de zijkant */}
      <rect
        x="14"
        y="38"
        width="40"
        height="4"
        rx="1"
        fill="#3f6b4f"
        opacity="0.85"
      />

      {/* Wielen */}
      <g stroke="#3f6b4f" strokeWidth="2">
        <circle cx="22" cy="62" r="8" fill="#2f3a32" />
        <circle cx="22" cy="62" r="3" fill="#ffffff" />
        <circle cx="78" cy="62" r="8" fill="#2f3a32" />
        <circle cx="78" cy="62" r="3" fill="#ffffff" />
      </g>
    </svg>
  )
}
