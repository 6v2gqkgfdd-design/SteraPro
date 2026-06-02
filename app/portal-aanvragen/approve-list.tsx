'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { approvePortalRequest } from './actions'

type Contact = {
  id: string
  email: string
  request_data: Record<string, string> | null
  created_at: string
}
type Company = { id: string; name: string | null }

export default function ApproveList({
  contacts,
  companies,
}: {
  contacts: Contact[]
  companies: Company[]
}) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [choice, setChoice] = useState<Record<string, string>>({})
  const [error, setError] = useState('')

  async function approve(id: string) {
    const c = choice[id] || 'new'
    setBusy(id)
    setError('')
    const res = await approvePortalRequest(id, c)
    setBusy(null)
    if (!res.ok) setError(res.error)
    else router.refresh()
  }

  if (contacts.length === 0) {
    return <p className="text-sm text-stera-ink-soft">Geen openstaande aanvragen.</p>
  }

  return (
    <div className="space-y-4">
      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {contacts.map((c) => {
        const d = c.request_data ?? {}
        return (
          <div key={c.id} className="rounded-xl border border-stera-line bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-stera-ink">
                  {[d.first_name, d.last_name].filter(Boolean).join(' ') || c.email}
                </p>
                <p className="text-sm text-stera-ink-soft">{c.email}</p>
                <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-0.5 text-sm sm:grid-cols-2">
                  {[
                    ['Bedrijf', d.company_name],
                    ['BTW', d.vat_number],
                    ['Telefoon', d.phone],
                    ['Functie', d.role],
                    ['Adres', [d.street, d.house_number].filter(Boolean).join(' ')],
                    ['Plaats', [d.postal_code, d.city].filter(Boolean).join(' ')],
                    ['Land', d.country],
                    ['Facturatie', d.billing_email],
                  ]
                    .filter(([, v]) => v)
                    .map(([label, v]) => (
                      <div key={label as string} className="flex gap-2">
                        <dt className="text-stera-ink-soft">{label}:</dt>
                        <dd className="text-stera-ink">{v as string}</dd>
                      </div>
                    ))}
                </dl>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-stera-line pt-3">
              <select
                value={choice[c.id] ?? 'new'}
                onChange={(e) => setChoice((p) => ({ ...p, [c.id]: e.target.value }))}
                className="rounded-lg border border-stera-line bg-white p-2 text-sm"
              >
                <option value="new">➕ Nieuw bedrijf aanmaken</option>
                {companies.map((co) => (
                  <option key={co.id} value={co.id}>
                    Koppelen aan: {co.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => approve(c.id)}
                disabled={busy === c.id}
                className="stera-cta stera-cta-primary disabled:opacity-60"
              >
                {busy === c.id ? 'Bezig…' : 'Goedkeuren'}
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
