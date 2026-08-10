import Link from 'next/link'
import type { OpsSnapshot } from '@/lib/ops-overview'

type Tile = {
  href: string
  label: string
  count: number
  hint: string
  tone?: 'default' | 'amber' | 'green' | 'blue'
}

function toneClass(tone: Tile['tone'], has: boolean) {
  if (!has) return 'border-stera-line bg-white text-stera-ink-soft'
  switch (tone) {
    case 'amber':
      return 'border-amber-200 bg-amber-50 text-amber-900 hover:border-amber-400'
    case 'green':
      return 'border-stera-green/30 bg-stera-green/5 text-stera-green hover:border-stera-green'
    case 'blue':
      return 'border-blue-200 bg-blue-50 text-blue-900 hover:border-blue-400'
    default:
      return 'border-stera-line bg-white text-stera-ink hover:border-stera-green'
  }
}

/**
 * Compacte werkbon-pipeline op Home.
 * Geen snelle navigatie-links (die zitten al in de sidebar) en geen
 * offertes/vervangingen meer — die gaan via portaal → Shopify.
 */
export default function OpsActionBoard({
  ops,
  compact = false,
}: {
  ops: OpsSnapshot
  compact?: boolean
}) {
  const tiles: Tile[] = [
    {
      href: '/work-orders?tab=draft',
      label: 'Te versturen',
      count: ops.woDraft,
      hint: 'werkbonnen',
      tone: ops.woDraft > 0 ? 'amber' : 'default',
    },
    {
      href: '/work-orders?tab=sent',
      label: 'Te tekenen',
      count: ops.woSent,
      hint: 'werkbonnen',
      tone: ops.woSent > 0 ? 'blue' : 'default',
    },
    {
      href: '/work-orders?tab=signed',
      label: 'Te factureren',
      count: ops.woSigned,
      hint: 'goedgekeurd',
      tone: ops.woSigned > 0 ? 'amber' : 'default',
    },
  ]

  return (
    <section className="space-y-2">
      {!compact ? (
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-stera-ink-soft">
              Werkbonnen
            </p>
            <p className="text-sm text-stera-ink-soft">
              Openstaande stappen in de facturatie-pipeline.
            </p>
          </div>
          {ops.woDraft + ops.woSent + ops.woSigned > 0 ? (
            <p className="text-sm font-semibold text-amber-800">
              {ops.woDraft + ops.woSent + ops.woSigned} open
            </p>
          ) : (
            <p className="text-sm font-medium text-stera-green">Alles bij</p>
          )}
        </div>
      ) : null}

      <div className="grid grid-cols-3 gap-2">
        {tiles.map((t) => (
          <Link
            key={t.href + t.label}
            href={t.href}
            className={`rounded-xl border px-3 py-3 transition ${toneClass(
              t.tone,
              t.count > 0
            )}`}
          >
            <p className="text-2xl font-semibold tabular-nums leading-none">
              {t.count}
            </p>
            <p className="mt-1.5 text-xs font-semibold leading-snug">{t.label}</p>
            <p className="mt-0.5 text-[10px] opacity-70">{t.hint}</p>
          </Link>
        ))}
      </div>
    </section>
  )
}
