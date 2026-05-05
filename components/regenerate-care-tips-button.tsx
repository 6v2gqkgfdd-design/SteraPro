'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function RegenerateCareTipsButton({
  plantId,
  hasTips,
}: {
  plantId: string
  hasTips: boolean
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleClick() {
    setLoading(true)
    setError('')

    try {
      const response = await fetch('/api/plants/care-tips', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ plantId, force: true }),
      })

      if (!response.ok) {
        const body = await response.json().catch(() => null)
        throw new Error(
          body?.error || 'Verzorgingstips genereren mislukt.'
        )
      }

      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Mislukt.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className="stera-cta stera-cta-ghost disabled:opacity-50"
      >
        {loading
          ? 'Tips genereren...'
          : hasTips
            ? 'Tips opnieuw genereren'
            : 'Verzorgingstips genereren'}
      </button>

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  )
}
