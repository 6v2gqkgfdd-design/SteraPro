'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function DeleteLocationButton({
  locationId,
  companyId,
  variant = 'cta',
}: {
  locationId: string
  companyId: string
  variant?: 'cta' | 'menu'
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

  if (variant === 'menu') {
    return (
      <button
        type="button"
        onClick={handleDelete}
        disabled={loading}
        className="block w-full px-4 py-3 text-left text-sm text-red-700 transition hover:bg-red-50 disabled:opacity-50"
      >
        {loading ? 'Verwijderen...' : 'Locatie verwijderen'}
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
      {loading ? 'Verwijderen...' : 'Locatie verwijderen'}
    </button>
  )
}
