'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { ConfirmModal } from '@/components/confirm-modal'

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
  const [open, setOpen] = useState(false)

  async function doDelete() {
    setOpen(false)
    setLoading(true)

    const { data, error } = await supabase
      .from('plants')
      .delete()
      .eq('id', plantId)
      .select()

    if (error) {
      toast.error(`Verwijderen mislukt: ${error.message}`)
      setLoading(false)
      return
    }

    if (!data || data.length === 0) {
      toast.error(
        'Plant niet verwijderd — waarschijnlijk blokkeert een Supabase policy (RLS) de delete.'
      )
      setLoading(false)
      return
    }

    toast.success('Plant verwijderd')
    router.push(`/locations/${locationId}`)
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
        {loading ? 'Verwijderen...' : 'Plant verwijderen'}
      </button>
    ) : (
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={loading}
        className="stera-cta stera-cta-danger disabled:opacity-50"
      >
        {loading ? 'Verwijderen...' : 'Plant verwijderen'}
      </button>
    )

  return (
    <>
      {trigger}
      <ConfirmModal
        open={open}
        title="Plant verwijderen?"
        description="Deze plant en haar onderhoudsgeschiedenis worden permanent verwijderd. Niet ongedaan te maken."
        confirmLabel="Plant verwijderen"
        tone="danger"
        onConfirm={doDelete}
        onCancel={() => setOpen(false)}
      />
    </>
  )
}
