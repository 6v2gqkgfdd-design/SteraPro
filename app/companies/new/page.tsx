'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function NewCompanyPage() {
  const router = useRouter()
  const supabase = createClient()

  const [name, setName] = useState('')
  const [contactName, setContactName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { error } = await supabase.from('companies').insert([
      {
        name,
        contact_name: contactName,
        email,
        phone,
        notes,
      },
    ])

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    router.push('/dashboard')
    router.refresh()
  }

  return (
    <main className="bg-stera-cream p-6">
      <div className="mx-auto max-w-2xl space-y-6">
        <div>
          <p className="stera-eyebrow mb-2">Klant</p>
          <h1 className="stera-display text-3xl sm:text-4xl">Nieuwe klant</h1>
        </div>

        <form onSubmit={handleSubmit} className="stera-card space-y-4">
          <input
            type="text"
            placeholder="Naam klant"
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

          <button
            type="submit"
            disabled={loading}
            className="stera-cta stera-cta-primary disabled:opacity-50"
          >
            {loading ? 'Opslaan...' : 'Klant opslaan'}
          </button>

          {error && <p className="text-red-600">{error}</p>}
        </form>
      </div>
    </main>
  )
}
