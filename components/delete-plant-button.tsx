'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function DeletePlantButton({
  plantId,
  locationId,
  variant = 'cta',
}: {
  plantId: string
  locationId: string
  variant?: 'cta' | 'menu'
}) {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(false)

  async function handleDelete() {
    const confirmed = window.confirm(
      'Ben je zeker dat je deze plant wilt verwijderen?'
    )

    if (!confirmed) return

    setLoading(true)

    const { data, error } = await supabase
      .from('plants')
      .delete()
      .eq('id', plantId)
      .select()

    if (error) {
      alert(`Delete fout: ${error.message}`)
      setLoading(false)
      return
    }

    if (!data || data.length === 0) {
      alert(
        'De plant werd niet verwijderd. Waarschijnlijk blokkeert een Supabase policy (RLS) de delete.'
      )
      setLoading(false)
      return
    }

    router.push(`/locations/${locationId}`)
    router.refresh()
  }

  if (variant === 'menu') {
    return (
      <button
        type="button"
        onClick={handleDelete}
        disabled={loading}
        className="block w-full px-4 py-3 text-left text-sm text-red-700 transition hover:bg-red-50 disabled:opacity-50"
      >
        {loading ? 'Verwijderen...' : 'Plant verwijderen'}
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={loading}
      className="stera-cta stera-cta-danger disabled:opacity-50"
    >
      {loading ? 'Verwijderen...' : 'Plant verwijderen'}
    </button>
  )
}
