'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type SearchResult = {
  id: string
  nickname: string | null
  species: string | null
  reference_code: string | null
  plant_code: string | null
  qr_slug: string | null
  status: string | null
  rooms: { id: string; name: string | null } | null
  locations: {
    id: string
    name: string | null
    companies: { id: string; name: string | null } | null
  } | null
}

export default function PlantSearchPage() {
  const supabase = createClient()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const term = query.trim()
    if (term.length < 2) {
      setResults([])
      setError('')
      return
    }

    let cancelled = false
    setLoading(true)
    setError('')

    const handle = setTimeout(async () => {
      const escaped = term.replace(/%/g, '\\%').replace(/_/g, '\\_')
      const pattern = `%${escaped}%`

      const { data, error: queryError } = await supabase
        .from('plants')
        .select(
          `
          id, nickname, species, reference_code, plant_code, qr_slug, status,
          rooms ( id, name ),
          locations ( id, name, companies ( id, name ) )
          `
        )
        .or(
          `nickname.ilike.${pattern},species.ilike.${pattern},reference_code.ilike.${pattern},plant_code.ilike.${pattern},qr_slug.ilike.${pattern}`
        )
        .limit(40)

      if (cancelled) return

      if (queryError) {
        setError(queryError.message)
        setLoading(false)
        return
      }

      const normalized = (data ?? []).map((row: any) => ({
        ...row,
        rooms: Array.isArray(row.rooms) ? row.rooms[0] ?? null : row.rooms,
        locations: Array.isArray(row.locations)
          ? row.locations[0] ?? null
          : row.locations,
      })) as SearchResult[]

      setResults(normalized)
      setLoading(false)
    }, 250)

    return () => {
      cancelled = true
      clearTimeout(handle)
    }
  }, [query, supabase])

  return (
    <main className="bg-stera-cream p-6">
      <div className="mx-auto max-w-3xl space-y-6">
        <Link href="/dashboard" className="text-sm text-stera-blue underline">
          ← Terug naar dashboard
        </Link>

        <div>
          <p className="stera-eyebrow mb-2">Zoeken</p>
          <h1 className="stera-display text-3xl sm:text-4xl">Plant opzoeken</h1>
          <p className="mt-2 text-sm text-stera-ink-soft">
            Zoek op bijnaam, soort, referentiecode of QR-slug.
          </p>
        </div>

        <input
          type="search"
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Bv. monstera, Captain Mango of PLT-2026..."
          className="w-full rounded-lg border border-stera-line bg-white p-3"
        />

        {loading && (
          <p className="text-sm text-stera-ink-soft">Zoeken...</p>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}

        {!loading && query.trim().length >= 2 && results.length === 0 && (
          <p className="text-sm text-stera-ink-soft">
            Geen planten gevonden voor &laquo;{query}&raquo;.
          </p>
        )}

        {results.length > 0 && (
          <ul className="space-y-3">
            {results.map((p) => {
              const company = p.locations?.companies?.name
              const location = p.locations?.name
              const room = p.rooms?.name
              const trail = [company, location, room].filter(Boolean).join(' · ')
              return (
                <li
                  key={p.id}
                  className="stera-card transition hover:border-stera-blue"
                >
                  <Link href={`/plants/${p.id}`} className="block">
                    <p className="font-semibold text-stera-ink">
                      {p.nickname || p.reference_code || p.plant_code || 'Plant'}
                    </p>
                    {p.species && (
                      <p className="mt-1 text-sm text-stera-ink-soft">
                        {p.species}
                      </p>
                    )}
                    {trail && (
                      <p className="mt-2 text-xs text-stera-ink-soft">{trail}</p>
                    )}
                    {p.reference_code && (
                      <p className="mt-1 font-mono text-xs text-stera-ink-soft">
                        {p.reference_code}
                      </p>
                    )}
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </main>
  )
}
