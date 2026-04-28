'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function DeleteLocationButton({
  locationId,
  companyId,
}: {
  locationId: string
  companyId: string
}) {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(false)

  async function handleDelete() {
    const confirmed = window.confirm(
      'Ben je zeker dat je deze locatie wilt verwijderen?'
    )

    if (!confirmed) return

    setLoading(true)

    const { error } = await supabase
      .from('locations')
      .delete()
      .eq('id', locationId)

    if (error) {
      alert(error.message)
      setLoading(false)
      return
    }

    router.push(`/companies/${companyId}`)
    router.refresh()
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={loading}
      className="rounded-lg bg-red-600 px-4 py-2 text-white"
    >
      {loading ? 'Verwijderen...' : 'Locatie verwijderen'}
    </button>
  )
}
