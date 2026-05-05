'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function EditCompanyPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const supabase = createClient()

  const companyId = params?.id

  const [name, setName] = useState('')
  const [contactName, setContactName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [notes, setNotes] = useState('')

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!companyId) return

    let cancelled = false

    async function load() {
      const { data, error } = await supabase
        .from('companies')
        .select('name, contact_name, email, phone, notes')
        .eq('id', companyId)
        .maybeSingle()

      if (cancelled) return

      if (error || !data) {
        setError(error?.message || 'Bedrijf niet gevonden.')
        setLoading(false)
        return
      }

      setName(data.name ?? '')
      setContactName(data.contact_name ?? '')
      setEmail(data.email ?? '')
      setPhone(data.phone ?? '')
      setNotes(data.notes ?? '')
      setLoading(false)
    }

    load()

    return () => {
      cancelled = true
    }
  }, [companyId, supabase])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!companyId) return

    setSaving(true)
    setError('')

    const { error } = await supabase
      .from('companies')
      .update({
        name: name.trim(),
        contact_name: contactName.trim() || null,
        email: email.trim() || null,
        phone: phone.trim() || null,
        notes: notes.trim() || null,
      })
      .eq('id', companyId)

    if (error) {
      setError(error.message)
      setSaving(false)
      return
    }

    router.push(`/companies/${companyId}`)
    router.refresh()
  }

  return (
    <main className="bg-stera-cream p-6">
      <div className="mx-auto max-w-2xl space-y-6">
        <Link href="/dashboard" className="stera-cta stera-cta-ghost">← Dashboard</Link>

        <div>
          <p className="stera-eyebrow mb-2">Bedrijf</p>
          <h1 className="stera-display text-3xl sm:text-4xl">Bedrijf bewerken</h1>
        </div>

        {loading ? (
          <p className="text-sm text-stera-ink-soft">Laden...</p>
        ) : (
          <form onSubmit={handleSubmit} className="stera-card space-y-4">
            <input
              type="text"
              placeholder="Bedrijfsnaam"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-stera-line bg-white p-3"
              required
            />

            <input
              type="text"
              placeholder="Contactpersoon"
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              className="w-full rounded-lg border border-stera-line bg-white p-3"
            />

            <input
              type="email"
              placeholder="E-mail"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-stera-line bg-white p-3"
            />

            <input
              type="text"
              placeholder="Telefoon"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full rounded-lg border border-stera-line bg-white p-3"
            />

            <textarea
              placeholder="Notities"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-lg border border-stera-line bg-white p-3"
              rows={4}
            />

            <div className="flex flex-wrap gap-3">
              <button
                type="submit"
                disabled={saving}
                className="stera-cta stera-cta-primary disabled:opacity-50"
              >
                {saving ? 'Opslaan...' : 'Wijzigingen opslaan'}
              </button>
              <Link
                href={`/companies/${companyId}`}
                className="stera-cta stera-cta-ghost"
              >
                Annuleren
              </Link>
            </div>

            {error && <p className="text-red-600">{error}</p>}
          </form>
        )}
      </div>
    </main>
  )
}
