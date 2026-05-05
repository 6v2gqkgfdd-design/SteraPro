'use client'

import { useState } from 'react'
import { submitPlantReport, type ReportIssueType } from './actions'

const ISSUE_OPTIONS: { value: ReportIssueType; label: string; helper?: string }[] = [
  {
    value: 'replace',
    label: 'Plant moet vervangen worden',
    helper: 'Lijkt dood of voorbij redding.',
  },
  {
    value: 'sick',
    label: 'Plant lijkt ziek',
    helper: 'Verkleurde of gele bladeren, slappe stengel.',
  },
  {
    value: 'damaged',
    label: 'Plant is beschadigd',
    helper: 'Gebroken takken, omgevallen pot.',
  },
  {
    value: 'pest',
    label: 'Ongedierte of aantasting',
    helper: 'Insecten, schimmel, kleverig blad.',
  },
  {
    value: 'other',
    label: 'Andere opmerking',
    helper: 'Beschrijf kort wat je ziet.',
  },
]

export default function PlantReportForm({ slug }: { slug: string }) {
  const [open, setOpen] = useState(false)
  const [issueType, setIssueType] = useState<ReportIssueType | ''>('')
  const [message, setMessage] = useState('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!issueType) {
      setError('Kies eerst wat er aan de hand is.')
      return
    }
    setSubmitting(true)
    setError('')

    const result = await submitPlantReport({
      slug,
      issueType,
      message,
      reporterName: name,
      reporterEmail: email,
    })

    setSubmitting(false)

    if (!result.ok) {
      setError(result.error)
      return
    }

    setSuccess(true)
  }

  if (success) {
    return (
      <div className="stera-card border-stera-green/40 bg-stera-cream-deep/40">
        <p className="stera-eyebrow mb-2">Bedankt voor je melding</p>
        <p className="text-sm text-stera-ink">
          Stera heeft je melding ontvangen en neemt zo nodig contact op of komt
          bij het volgende onderhoud langs.
        </p>
      </div>
    )
  }

  if (!open) {
    return (
      <div className="rounded-xl border border-stera-line bg-white p-4">
        <p className="text-sm font-medium text-stera-ink">
          Iets mis met deze plant?
        </p>
        <p className="mt-1 text-sm text-stera-ink-soft">
          Laat het ons weten — we kijken er bij het volgende bezoek naar of
          plannen indien nodig een tussentijdse interventie.
        </p>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="stera-cta stera-cta-primary mt-3"
        >
          Probleem melden →
        </button>
      </div>
    )
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="stera-card space-y-5 border-stera-green/40"
    >
      <div>
        <p className="stera-eyebrow mb-2">Probleem melden</p>
        <p className="text-sm text-stera-ink-soft">
          Vink aan wat het beste past en voeg eventueel uitleg toe. Stera krijgt
          de melding meteen door.
        </p>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-stera-ink">
          Wat is er aan de hand?
        </legend>
        {ISSUE_OPTIONS.map((opt) => (
          <label
            key={opt.value}
            className={`flex cursor-pointer gap-3 rounded-lg border p-3 transition ${
              issueType === opt.value
                ? 'border-stera-green bg-stera-cream-deep'
                : 'border-stera-line bg-white hover:border-stera-green/60'
            }`}
          >
            <input
              type="radio"
              name="issue_type"
              value={opt.value}
              checked={issueType === opt.value}
              onChange={() => setIssueType(opt.value)}
              className="mt-1"
            />
            <span className="min-w-0 flex-1">
              <span className="block font-medium text-stera-ink">
                {opt.label}
              </span>
              {opt.helper ? (
                <span className="block text-xs text-stera-ink-soft">
                  {opt.helper}
                </span>
              ) : null}
            </span>
          </label>
        ))}
      </fieldset>

      <div className="space-y-2">
        <label htmlFor="report_message" className="block text-sm font-medium">
          Toelichting (optioneel
          {issueType === 'other' ? ', maar nuttig' : ''})
        </label>
        <textarea
          id="report_message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={3}
          className="w-full rounded-lg border border-stera-line bg-white px-3 py-3"
          placeholder="Bijv. bladeren worden geel sinds vorige week, plant staat in de zon."
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <label htmlFor="report_name" className="block text-sm font-medium">
            Je naam (optioneel)
          </label>
          <input
            id="report_name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border border-stera-line bg-white px-3 py-3"
            placeholder="Voor- en achternaam"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="report_email" className="block text-sm font-medium">
            E-mail (optioneel)
          </label>
          <input
            id="report_email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-stera-line bg-white px-3 py-3"
            placeholder="zodat we kunnen terugkoppelen"
          />
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={submitting}
          className="stera-cta stera-cta-primary disabled:opacity-50"
        >
          {submitting ? 'Versturen...' : 'Melding versturen →'}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="stera-cta stera-cta-ghost"
        >
          Annuleren
        </button>
      </div>
    </form>
  )
}
