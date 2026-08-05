import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import FullCatalogClient from './FullCatalogClient'

export const dynamic = 'force-dynamic'

export default async function CatalogusPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: staff } = await supabase.rpc('is_staff')
  if (!staff) {
    return (
      <main className="bg-stera-cream p-6">
        <div className="mx-auto max-w-md">
          <div className="stera-card text-sm">
            <p className="font-semibold text-stera-ink">Geen toegang</p>
            <p className="mt-1 text-stera-ink-soft">
              Je bent ingelogd als <code>{user.email}</code>, maar dit is geen
              beheerder-account.
            </p>
          </div>
        </div>
      </main>
    )
  }

  return <FullCatalogClient />
}
