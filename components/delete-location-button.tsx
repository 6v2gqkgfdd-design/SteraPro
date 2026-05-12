'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { ConfirmModal } from '@/components/confirm-modal'

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
  const [open, setOpen] = useState(false)

  async function doDelete() {
    setOpen(false)
    setLoading(true)

    const { error } = await supabase
      .from('locations')
      .delete()
      .eq('id', locationId)

    if (error) {
      toast.error(error.message)
      setLoading(false)
      return
    }

    toast.success('Locatie verwijderd')
    router.push(`/companies/${companyId}`)
    router.refresh()
  }

  const trigger =
    variant === 'menu' ? (
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={loading}
        className="block w-full px-4 py-3 text-left text-sm text-red-700 transition hover:bg-red-50 disabled:opacity-50"
      >
        {loading ? 'Verwijderen...' : 'Locatie verwijderen'}
      </button>
    ) : (
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={loading}
        className="stera-cta stera-cta-danger disabled:opacity-50"
      >
        {loading ? 'Verwijderen...' : 'Locatie verwijderen'}
      </button>
    )

  return (
    <>
      {trigger}
      <ConfirmModal
        open={open}
        title="Locatie verwijderen?"
        description="Alle ruimtes, planten en historiek op deze locatie worden permanent verwijderd. Niet ongedaan te maken."
        confirmLabel="Locatie verwijderen"
        tone="danger"
        onConfirm={doDelete}
        onCancel={() => setOpen(false)}
      />
    </>
  )
}
