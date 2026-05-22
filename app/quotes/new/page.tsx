import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import QuoteBuilder, { type LocationOption } from './quote-builder'

export const metadata = {
  title: 'Nieuwe offerte',
}

export default async function NewQuotePage() {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()
  if (error || !user) {
    redirect('/login')
  }

  const { data: locations } = await supabase
    .from('locations')
    .select('id, name, company_id, companies ( id, name )')
    .order('name')

  const locationOptions: LocationOption[] = (locations ?? []).map(
    (l: {
      id: string
      name: string | null
      company_id: string | null
      companies: { id: string; name: string | null }[] | { id: string; name: string | null } | null
    }) => {
      const c = Array.isArray(l.companies) ? l.companies[0] : l.companies
      return {
        id: l.id,
        companyId: c?.id ?? l.company_id ?? null,
        label:
          [c?.name, l.name].filter(Boolean).join(' — ') ||
          l.name ||
          'Locatie',
      }
    }
  )

  return (
    <main className="bg-stera-cream p-6">
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <p className="stera-eyebrow mb-2">Nieuwe offerte</p>
          <h1 className="text-3xl font-bold tracking-tight text-stera-ink">
            Offerte opstellen
          </h1>
          <p className="mt-2 text-sm text-stera-ink-soft">
            Kies de klant, voeg een hydrocultuur-plant en een buitenpot toe
            uit de Nieuwkoop-catalogus, en bewaar de offerte.
          </p>
        </div>
        <QuoteBuilder locations={locationOptions} />
      </div>
    </main>
  )
}
