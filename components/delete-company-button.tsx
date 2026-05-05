'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function DeleteCompanyButton({
  companyId,
}: {
  companyId: string
}) {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(false)

  async function handleDelete() {
    const confirmed = window.confirm(
      'Ben je zeker dat je dit bedrijf wilt verwijderen?'
    )

    if (!confirmed) return

    setLoading(true)

    const { error } = await supabase
      .from('companies')
      .delete()
      .eq('id', companyId)

    if (error) {
      alert(error.message)
      setLoading(false)
      return
    }

    router.push('/dashboard')
    router.refresh()
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={loading}
      className="stera-cta stera-cta-danger disabled:opacity-50"
    >
      {loading ? 'Verwijderen...' : 'Bedrijf verwijderen'}
    </button>
  )
}
