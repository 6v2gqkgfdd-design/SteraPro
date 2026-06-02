'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import SteraLogo from '@/components/stera-logo'

const FIELDS: Array<{ key: string; label: string; type?: string; half?: boolean }> = [
  { key: 'name', label: 'Bedrijfsnaam' },
  { key: 'contact_name', label: 'Contactpersoon', half: true },
  { key: 'phone', label: 'Telefoon', type: 'tel', half: true },
  { key: 'email', label: 'E-mail', type: 'email', half: true },
  { key: 'billing_email', label: 'Facturatie-e-mail', type: 'email', half: true },
  { key: 'vat_number', label: 'BTW-nummer', half: true },
  { key: 'street', label: 'Straat', half: true },
  { key: 'house_number', label: 'Nummer', half: true },
  { key: 'postal_code', label: 'Postcode', half: true },
  { key: 'city', label: 'Gemeente', half: true },
  { key: 'country', label: 'Land', half: true },
]

export default function PortalProfilePage() {
  const supabase = createClient()
  const router = useRouter()
  const [form, setForm] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    supabase.rpc('my_portal_profile').then(({ data }) => {
      if (cancelled) return
      if (!data) {
        router.replace('/portal')
        return
      }
      const d = data as Record<string, unknown>
      const next: Record<string, string> = {}
      for (const f of FIELDS) next[f.key] = (d[f.key] as string) ?? ''
      setForm(next)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [supabase, router])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setMsg('')
    setError('')
    const { error } = await supabase.rpc('update_my_portal_profile', { _data: form })
    setSaving(false)
    if (error) setError(error.message)
    else setMsg('Je gegevens zijn opgeslagen.')
  }

  return (
    <main className="min-h-screen bg-stera-cream text-stera-ink">
      <header className="flex items-center justify-between border-b border-stera-line px-5 py-4 sm:px-10">
        <SteraLogo variant="default" href={null} />
        <Link href="/portal" className="text-sm text-stera-green hover:underline">
          ← Portaal
        </Link>
      </header>
      <div className="mx-auto w-full max-w-2xl px-5 py-8 sm:px-10">
        <p className="stera-eyebrow text-stera-green mb-2">Mijn gegevens</p>
        <h1 className="text-2xl font-bold sm:text-3xl">Bedrijfs- en contactgegevens</h1>

        {loading ? (
          <p className="mt-6 text-sm text-stera-ink-soft">Laden…</p>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 rounded-xl border border-stera-line bg-white p-5">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {FIELDS.map((f) => (
                <div key={f.key} className={f.half ? '' : 'sm:col-span-2'}>
                  <label className="stera-eyebrow text-stera-ink-soft mb-1 block">{f.label}</label>
                  <input
                    type={f.type ?? 'text'}
                    value={form[f.key] ?? ''}
                    onChange={(e) => setForm((p) => ({ ...p, [f.key]: e.target.value }))}
                    className="w-full rounded-lg border border-stera-line bg-white p-3"
                  />
                </div>
              ))}
            </div>
            {error ? (
              <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
            ) : null}
            {msg ? (
              <p className="mt-4 rounded-lg border border-stera-green/30 bg-stera-green/5 px-3 py-2 text-sm text-stera-green">{msg}</p>
            ) : null}
            <button type="submit" disabled={saving} className="stera-cta stera-cta-primary mt-5 w-full disabled:opacity-60 sm:w-auto">
              {saving ? 'Opslaan…' : 'Wijzigingen opslaan'}
            </button>
          </form>
        )}
      </div>
    </main>
  )
}
