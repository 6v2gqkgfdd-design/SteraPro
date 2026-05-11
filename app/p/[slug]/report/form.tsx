'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { submitPlantReport, type ReportIssueType } from '../actions'

const ISSUE_CHIPS: { value: ReportIssueType; label: string }[] = [
  { value: 'replace', label: 'Vervangen' },
  { value: 'sick', label: 'Ziek' },
  { value: 'damaged', label: 'Beschadigd' },
  { value: 'pest', label: 'Ongedierte' },
  { value: 'other', label: 'Andere' },
]

const ISSUE_HELPER: Record<ReportIssueType, string> = {
  replace: 'Lijkt dood of voorbij redding.',
  sick: 'Verkleurde of gele bladeren, slappe stengel.',
  damaged: 'Gebroken takken, omgevallen pot.',
  pest: 'Insecten, schimmel, kleverig blad.',
  other: 'Beschrijf kort wat je ziet.',
}

export default function PlantReportPageForm({ slug }: { slug: string }) {
  const supabase = createClient()
  const [issueType, setIssueType] = useState<ReportIssueType | ''>('')
  const [message, setMessage] = useState('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    return () => {
      if (photoPreview) URL.revokeObjectURL(photoPreview)
    }
  }, [photoPreview])

  function handlePhoto(f: File | null) {
    if (photoPreview) URL.revokeObjectURL(photoPreview)
    if (!f) {
      setPhotoFile(null)
      setPhotoPreview('')
      return
    }
    setPhotoFile(f)
    setPhotoPreview(URL.createObjectURL(f))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!issueType) {
      setError('Kies eerst wat er aan de hand is.')
      return
    }
    setSubmitting(true)
    setError('')

    let photoPath: string | null = null
    let photoUrl: string | null = null

    if (photoFile) {
      const fileName = `reports/${slug}/${Date.now()}.jpg`
      const { error: uploadError } = await supabase.storage
        .from('plant-photos')
        .upload(fileName, photoFile, {
          upsert: false,
          contentType: photoFile.type || 'image/jpeg',
        })
      if (uploadError) {
        setError(`Foto uploaden mislukt: ${uploadError.message}`)
        setSubmitting(false)
        return
      }
      photoPath = fileName
      const { data: publicUrlData } = supabase.storage
        .from('plant-photos')
        .getPublicUrl(fileName)
      photoUrl = publicUrlData.publicUrl
    }

    const result = await submitPlantReport({
      slug,
      issueType,
      message,
      reporterName: name,
      reporterEmail: email,
      photoPath,
      photoUrl,
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
      <div className="space-y-4 text-center">
        <div className="rounded-2xl border border-stera-green/40 bg-stera-cream-deep/40 p-5">
          <p className="text-2xl">✓</p>
          <p className="mt-2 font-semibold text-stera-ink">
            Bedankt voor je melding
          </p>
          <p className="mt-1 text-sm text-stera-ink-soft">
            Stera heeft je melding ontvangen en kijkt er bij het volgende
            bezoek naar, of plant indien nodig een tussentijdse interventie in.
          </p>
        </div>
        <Link
          href={`/p/${slug}`}
          className="stera-cta stera-cta-primary inline-flex"
        >
          Terug naar plant
        </Link>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {/* Issue-chips */}
      <div>
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-stera-ink-soft">
          Wat is er aan de hand?
        </p>
        <div className="flex flex-wrap gap-1.5">
          {ISSUE_CHIPS.map((opt) => {
            const selected = issueType === opt.value
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setIssueType(opt.value)}
                className={
                  selected
                    ? 'rounded-full bg-stera-green px-3 py-1.5 text-xs font-semibold text-white'
                    : 'rounded-full border border-stera-line bg-white px-3 py-1.5 text-xs font-medium text-stera-ink hover:border-stera-green'
                }
              >
                {opt.label}
              </button>
            )
          })}
        </div>
        {issueType ? (
          <p className="mt-1 text-[11px] text-stera-ink-soft">
            {ISSUE_HELPER[issueType]}
          </p>
        ) : null}
      </div>

      {/* Foto */}
      <div>
        <label
          htmlFor="report_photo"
          className="flex h-14 cursor-pointer items-center gap-3 rounded-xl border border-dashed border-stera-line bg-white px-4 transition hover:border-stera-green"
        >
          {photoPreview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photoPreview}
              alt=""
              className="h-10 w-10 rounded object-cover"
            />
          ) : (
            <span className="text-xl">📷</span>
          )}
          <span className="flex-1 text-sm text-stera-ink">
            {photoFile ? photoFile.name : 'Foto toevoegen (optioneel)'}
          </span>
          {photoFile ? (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault()
                handlePhoto(null)
              }}
              className="text-xs text-stera-ink-soft hover:text-red-600"
            >
              wissen
            </button>
          ) : null}
        </label>
        <input
          id="report_photo"
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => handlePhoto(e.target.files?.[0] || null)}
        />
      </div>

      {/* Toelichting */}
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        rows={2}
        className="w-full rounded-xl border border-stera-line bg-white px-3 py-2 text-sm"
        placeholder={
          issueType === 'other'
            ? 'Beschrijf kort wat er aan de hand is...'
            : 'Toelichting (optioneel)'
        }
      />

      {/* Naam + email */}
      <div className="grid grid-cols-2 gap-2">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-xl border border-stera-line bg-white px-3 py-2 text-sm"
          placeholder="Je naam"
        />
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-xl border border-stera-line bg-white px-3 py-2 text-sm"
          placeholder="E-mail"
        />
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      ) : null}

      <button
        type="submit"
        disabled={submitting || !issueType}
        className="stera-cta stera-cta-primary w-full disabled:opacity-50"
      >
        {submitting ? 'Versturen...' : 'Melding versturen →'}
      </button>
    </form>
  )
}
