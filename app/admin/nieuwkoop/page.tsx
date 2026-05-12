'use client'

import { useState } from 'react'
import Link from 'next/link'
import { getItemImageUrl, type NieuwkoopItem } from '@/lib/nieuwkoop'

type ApiResponse = {
  total?: number
  filtered?: number
  items?: NieuwkoopItem[]
  error?: string
}

export default function NieuwkoopTestPage() {
  const [search, setSearch] = useState('')
  const [height, setHeight] = useState('')
  const [potDiameter, setPotDiameter] = useState('')
  const [light, setLight] = useState<'' | 'high' | 'medium' | 'low'>('')

  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ApiResponse | null>(null)

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setResult(null)

    const params = new URLSearchParams()
    if (search.trim()) params.set('search', search.trim())
    if (height.trim()) params.set('height', height.trim())
    if (potDiameter.trim()) params.set('potDiameter', potDiameter.trim())
    if (light) params.set('light', light)

    try {
      const res = await fetch(`/api/nieuwkoop/items?${params.toString()}`)
      const data: ApiResponse = await res.json()
      setResult(data)
    } catch (err) {
      setResult({
        error: err instanceof Error ? err.message : 'Onbekende fout',
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="bg-stera-cream p-6">
      <div className="mx-auto max-w-4xl space-y-6">
        <div>
          <p className="stera-eyebrow mb-2">Admin · Nieuwkoop API</p>
          <h1 className="stera-display text-3xl sm:text-4xl">
            Catalogus testen
          </h1>
          <p className="mt-2 text-sm text-stera-ink-soft">
            Zoek in de Nieuwkoop-catalogus (Playground-data). Vul één of
            meer filters in en klik op zoeken. Maximaal 50 resultaten
            getoond.
          </p>
        </div>

        <form onSubmit={handleSearch} className="stera-card space-y-4">
          <div className="space-y-1">
            <label htmlFor="search" className="text-xs font-semibold uppercase tracking-wider text-stera-green">
              Zoekterm
            </label>
            <input
              id="search"
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="bv. Ficus, Monstera, Sansevieria"
              className="w-full rounded-lg border border-stera-line bg-white p-3"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <label htmlFor="height" className="text-xs font-semibold uppercase tracking-wider text-stera-green">
                Hoogte (cm)
              </label>
              <input
                id="height"
                type="number"
                value={height}
                onChange={(e) => setHeight(e.target.value)}
                placeholder="bv. 120"
                className="w-full rounded-lg border border-stera-line bg-white p-3"
              />
              <p className="text-[10px] text-stera-ink-soft">Tolerantie ±20%</p>
            </div>

            <div className="space-y-1">
              <label htmlFor="potDiameter" className="text-xs font-semibold uppercase tracking-wider text-stera-green">
                Pot Ø (cm)
              </label>
              <input
                id="potDiameter"
                type="number"
                value={potDiameter}
                onChange={(e) => setPotDiameter(e.target.value)}
                placeholder="bv. 24"
                className="w-full rounded-lg border border-stera-line bg-white p-3"
              />
              <p className="text-[10px] text-stera-ink-soft">Tolerantie ±2 cm</p>
            </div>

            <div className="space-y-1">
              <label htmlFor="light" className="text-xs font-semibold uppercase tracking-wider text-stera-green">
                Licht
              </label>
              <select
                id="light"
                value={light}
                onChange={(e) =>
                  setLight(e.target.value as typeof light)
                }
                className="w-full rounded-lg border border-stera-line bg-white p-3"
              >
                <option value="">Alle</option>
                <option value="high">Veel licht (zon)</option>
                <option value="medium">Matig licht</option>
                <option value="low">Weinig licht (schaduw)</option>
              </select>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="stera-cta stera-cta-primary disabled:opacity-50"
          >
            {loading ? 'Zoeken…' : 'Zoeken'}
          </button>
        </form>

        {result?.error ? (
          <div className="stera-card border-red-200 bg-red-50 text-sm text-red-700">
            <p className="font-semibold">Fout van Nieuwkoop API</p>
            <p className="mt-1 break-words font-mono text-xs">
              {result.error}
            </p>
            <p className="mt-3 text-stera-ink-soft">
              Check of <code>NIEUWKOOP_USERNAME</code>,{' '}
              <code>NIEUWKOOP_PASSWORD</code> en{' '}
              <code>NIEUWKOOP_BASE_URL</code> correct in{' '}
              <code>.env.local</code> staan (en op Vercel).
            </p>
          </div>
        ) : null}

        {result && !result.error ? (
          <div className="space-y-3">
            <p className="text-sm text-stera-ink-soft">
              {result.filtered} van {result.total} items komen door de
              filter. Eerste 50 hieronder.
            </p>
            <ul className="grid gap-3 sm:grid-cols-2">
              {result.items?.map((it) => (
                <li key={it.Itemcode} className="rounded-xl border border-stera-line bg-white p-3 text-sm">
                  <div className="flex gap-3">
                    {it.ItemPictureName ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={getItemImageUrl(it.Itemcode)}
                        alt={it.Description}
                        className="h-24 w-24 shrink-0 rounded object-cover"
                      />
                    ) : (
                      <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded border border-dashed border-stera-line text-xs text-stera-ink-soft">
                        geen foto
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-stera-ink">
                        {it.ItemVariety_NL || it.Description}
                      </p>
                      <p className="font-mono text-xs text-stera-ink-soft">
                        {it.Itemcode}
                      </p>
                      <dl className="mt-2 grid grid-cols-2 gap-x-2 gap-y-0.5 text-xs">
                        {it.Height ? (
                          <>
                            <dt className="text-stera-ink-soft">Hoogte</dt>
                            <dd>{it.Height} cm</dd>
                          </>
                        ) : null}
                        {it.DiameterCulturePot ?? it.Diameter ? (
                          <>
                            <dt className="text-stera-ink-soft">Pot Ø</dt>
                            <dd>{it.DiameterCulturePot ?? it.Diameter} cm</dd>
                          </>
                        ) : null}
                        {it.PotSize ? (
                          <>
                            <dt className="text-stera-ink-soft">Maat</dt>
                            <dd>{it.PotSize}</dd>
                          </>
                        ) : null}
                        {it.Salesprice != null ? (
                          <>
                            <dt className="text-stera-ink-soft">Prijs</dt>
                            <dd>€ {it.Salesprice.toFixed(2)}</dd>
                          </>
                        ) : null}
                        {it.LocationIcon_NL ? (
                          <>
                            <dt className="text-stera-ink-soft">Licht</dt>
                            <dd className="truncate">{it.LocationIcon_NL}</dd>
                          </>
                        ) : null}
                        {it.IsStockItem !== undefined ? (
                          <>
                            <dt className="text-stera-ink-soft">Voorraad</dt>
                            <dd>{it.IsStockItem ? 'ja' : 'op aanvraag'}</dd>
                          </>
                        ) : null}
                      </dl>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="pt-4 text-sm">
          <Link
            href="/dashboard"
            className="text-stera-green underline-offset-4 hover:underline"
          >
            ← Terug naar dashboard
          </Link>
        </div>
      </div>
    </main>
  )
}
