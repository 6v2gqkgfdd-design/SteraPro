'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function DeletePlantButton({
  plantId,
  locationId,
}: {
  plantId: string
  locationId: string
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
