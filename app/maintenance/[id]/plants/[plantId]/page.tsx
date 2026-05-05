'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import SteraLogo from '@/components/stera-logo'

async function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  const objectUrl = URL.createObjectURL(file)
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('Afbeelding kon niet gelezen worden.'))
      img.src = objectUrl
    })
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

async function fileToJpeg(file: File): Promise<File> {
  if (file.type === 'image/jpeg') return file

  const image = await loadImageFromFile(file)
  const width = image.naturalWidth || image.width
  const height = image.naturalHeight || image.height
  if (!width || !height) throw new Error('Afbeelding zonder afmetingen.')

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas niet beschikbaar.')
  ctx.drawImage(image, 0, 0, width, height)

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, 'image/jpeg', 0.9)
  })
  if (!blob) throw new Error('Conversie naar JPEG mislukt.')

  const baseName = file.name.replace(/\.[^.]+$/, '') || 'photo'
  return new File([blob], `${baseName}.jpg`, { type: 'image/jpeg' })
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready' }
  | {
      kind: 'visit-not-found'
      visitId?: string
    }
  | {
      kind: 'plant-not-found'
      visitId?: string
      plantId?: string
    }
  | {
      kind: 'plant-wrong-location'
      visitId?: string
      plantId?: string
    }
  | {
      kind: 'fetch-error'
      message?: string
      visitId?: string
      plantId?: string
    }
  | { kind: 'invalid-params' }

function SteraShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-stera-cream text-stera-ink flex flex-col">
      <header className="px-5 py-5 sm:px-10 sm:py-8 border-b border-stera-line">
        <SteraLogo variant="default" />
      </header>
      <div className="flex-1 px-5 py-8 sm:px-10 sm:py-12">{children}</div>
      <footer className="px-5 py-5 sm:px-10 text-xs text-stera-ink-soft border-t border-stera-line">
        © {new Date().getFullYear()} Stera · Plantbeheer voor professionals
      </footer>
    </main>
  )
}

function FallbackCard({
  eyebrow,
  title,
  body,
  details,
  actions,
}: {
  eyebrow: string
  title: string
  body: string
  details?: React.ReactNode
  actions: React.ReactNode
}) {
  return (
    <div className="mx-auto w-full max-w-xl">
      <p className="stera-eyebrow text-stera-green mb-4">{eyebrow}</p>
      <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
        {title}
      </h1>
      <p className="text-base text-stera-ink-soft leading-relaxed mb-3">{body}</p>
      {details ? (
        <div className="text-sm text-stera-ink-soft mb-10">{details}</div>
      ) : (
        <div className="mb-10" />
      )}
      <div className="flex flex-col sm:flex-row gap-3">{actions}</div>
    </div>
  )
}

export default function MaintenancePlantDetailPage() {
  const params = useParams<{ id: string; plantId: string }>()
  const router = useRouter()
  const supabase = createClient()

  const visitId = params?.id
  const plantId = params?.plantId

  const [visitTitle, setVisitTitle] = useState('')
  const [locationName, setLocationName] = useState('')
  const [plantName, setPlantName] = useState('')
  const [plantCode, setPlantCode] = useState('')
  const [species, setSpecies] = useState('')
  const [existingVisitPlantId, setExistingVisitPlantId] = useState<string | null>(
    null
  )

  const [watered, setWatered] = useState(false)
  const [pruned, setPruned] = useState(false)
  const [fed, setFed] = useState(false)
  const [cleaned, setCleaned] = useState(false)
  const [rotated, setRotated] = useState(false)
  const [repotted, setRepotted] = useState(false)
  const [replaced, setReplaced] = useState(false)
  const [checked, setChecked] = useState(true)
  const [healthStatus, setHealthStatus] = useState('healthy')
  const [notes, setNotes] = useState('')

  const [existingPhotoUrl, setExistingPhotoUrl] = useState<string | null>(null)
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState('')
  const [photoError, setPhotoError] = useState('')

  const [state, setState] = useState<LoadState>({ kind: 'loading' })
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  useEffect(() => {
    let cancelled = false

    async function loadData() {
      if (!visitId || !plantId) {
        setState({ kind: 'invalid-params' })
        return
      }

      setState({ kind: 'loading' })

      try {
        const [visitResult, plantResult, existingResult] = await Promise.all([
          supabase
            .from('maintenance_visits')
            .select(
              `
              id,
              title,
              location_id,
              locations (
                id,
                name
              )
            `
            )
            .eq('id', visitId)
            .maybeSingle(),

          supabase
            .from('plants')
            .select(
              `
              id,
              nickname,
              plant_code,
              reference_code,
              species,
              status,
              notes,
              location_id
            `
            )
            .eq('id', plantId)
            .maybeSingle(),

          supabase
            .from('maintenance_visit_plants')
            .select('*')
            .eq('visit_id', visitId)
            .eq('plant_id', plantId)
            .maybeSingle(),
        ])

        if (cancelled) return

        const { data: visit, error: visitError } = visitResult
        const { data: plant, error: plantError } = plantResult
        const { data: existingVisitPlant, error: visitPlantError } =
          existingResult

        if (visitError) {
          setState({
            kind: 'fetch-error',
            message: visitError.message,
            visitId,
            plantId,
          })
          return
        }

        if (!visit) {
          setState({ kind: 'visit-not-found', visitId })
          return
        }

        if (plantError) {
          setState({
            kind: 'fetch-error',
            message: plantError.message,
            visitId,
            plantId,
          })
          return
        }

        if (!plant) {
          setState({ kind: 'plant-not-found', visitId, plantId })
          return
        }

        if (
          visit.location_id &&
          plant.location_id &&
          plant.location_id !== visit.location_id
        ) {
          setState({ kind: 'plant-wrong-location', visitId, plantId })
          return
        }

        const locationData = visit.locations as unknown
        const resolvedLocationName = Array.isArray(locationData)
          ? ((locationData[0] as { name?: string } | undefined)?.name ?? '')
          : ((locationData as { name?: string } | null | undefined)?.name ?? '')

        setVisitTitle(visit.title || '')
        setLocationName(resolvedLocationName)
        setPlantName(
          plant.nickname || plant.plant_code || plant.reference_code || 'Plant'
        )
        setPlantCode(plant.reference_code || plant.plant_code || '')
        setSpecies(plant.species || '')
        setExistingVisitPlantId(existingVisitPlant?.id ?? null)

        if (existingVisitPlant) {
          setNotes(existingVisitPlant.notes || '')
          setWatered(Boolean(existingVisitPlant.action_watered))
          setPruned(Boolean(existingVisitPlant.action_pruned))
          setFed(Boolean(existingVisitPlant.action_fed))
          setCleaned(Boolean(existingVisitPlant.action_cleaned))
          setRotated(Boolean(existingVisitPlant.action_rotated))
          setRepotted(Boolean(existingVisitPlant.action_repotted))
          setReplaced(Boolean(existingVisitPlant.action_replaced))
          setChecked(
            typeof existingVisitPlant.action_checked === 'boolean'
              ? existingVisitPlant.action_checked
              : true
          )
          setHealthStatus(
            existingVisitPlant.health_status || plant.status || 'healthy'
          )
          setExistingPhotoUrl(existingVisitPlant.photo_url ?? null)
        } else {
          setNotes('')
          setWatered(false)
          setPruned(false)
          setFed(false)
          setCleaned(false)
          setRotated(false)
          setRepotted(false)
          setReplaced(false)
          setChecked(true)
          setHealthStatus(plant.status || 'healthy')
          setExistingPhotoUrl(null)
        }

        if (visitPlantError) {
          setSaveError(
            'Bestaande onderhoudsregistratie kon niet opgehaald worden. Je kan een nieuwe maken.'
          )
        } else {
          setSaveError('')
        }

        setState({ kind: 'ready' })
      } catch (err) {
        if (cancelled) return
        console.error('[maintenance plant load]', err)
        setState({
          kind: 'fetch-error',
          message: err instanceof Error ? err.message : undefined,
          visitId,
          plantId,
        })
      }
    }

    loadData()

    return () => {
      cancelled = true
    }
  }, [visitId, plantId, supabase])

  useEffect(() => {
    return () => {
      if (photoPreview) URL.revokeObjectURL(photoPreview)
    }
  }, [photoPreview])

  async function handlePhotoChange(file: File | null) {
    setPhotoError('')

    if (!file) {
      if (photoPreview) URL.revokeObjectURL(photoPreview)
      setPhotoFile(null)
      setPhotoPreview('')
      return
    }

    try {
      const jpeg = await fileToJpeg(file)
      if (photoPreview) URL.revokeObjectURL(photoPreview)
      setPhotoFile(jpeg)
      setPhotoPreview(URL.createObjectURL(jpeg))
    } catch (err) {
      setPhotoError(
        err instanceof Error ? err.message : 'Foto kon niet ingeladen worden.'
      )
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!visitId || !plantId) return

    setSaving(true)
    setSaveError('')

    try {
      let photoPath: string | null | undefined = undefined
      let photoUrl: string | null | undefined = undefined

      if (photoFile) {
        const fileName = `visits/${visitId}/${plantId}-${Date.now()}.jpg`
        const { error: uploadError } = await supabase.storage
          .from('plant-photos')
          .upload(fileName, photoFile, {
            upsert: false,
            contentType: 'image/jpeg',
          })
        if (uploadError) throw new Error(uploadError.message)

        photoPath = fileName
        const { data: publicUrlData } = supabase.storage
          .from('plant-photos')
          .getPublicUrl(fileName)
        photoUrl = publicUrlData.publicUrl
      }

      const payload: Record<string, unknown> = {
        visit_id: visitId,
        plant_id: plantId,
        notes: notes.trim() || null,
        action_watered: watered,
        action_pruned: pruned,
        action_fed: fed,
        action_cleaned: cleaned,
        action_rotated: rotated,
        action_repotted: repotted,
        action_replaced: replaced,
        action_checked: checked,
        health_status: healthStatus,
      }

      if (photoPath !== undefined) {
        payload.photo_path = photoPath
        payload.photo_url = photoUrl
      }

      if (existingVisitPlantId) {
        const { error } = await supabase
          .from('maintenance_visit_plants')
          .update(payload)
          .eq('id', existingVisitPlantId)

        if (error) {
          throw error
        }
      } else {
        const { data, error } = await supabase
          .from('maintenance_visit_plants')
          .insert([payload])
          .select('id')
          .single()

        if (error) {
          throw error
        }

        setExistingVisitPlantId(data?.id ?? null)
      }

      const { error: plantUpdateError } = await supabase
        .from('plants')
        .update({
          status: healthStatus,
          notes: notes.trim() || null,
        })
        .eq('id', plantId)

      if (plantUpdateError) {
        throw plantUpdateError
      }

      router.push(`/maintenance/${visitId}`)
      router.refresh()
    } catch (err) {
      console.error('[maintenance plant save]', err)
      setSaveError(err instanceof Error ? err.message : 'Opslaan mislukt.')
      setSaving(false)
    }
  }

  if (state.kind === 'loading') {
    return (
      <SteraShell>
        <div className="mx-auto w-full max-w-2xl">
          <p className="stera-eyebrow text-stera-green mb-3">
            Onderhoud · Plant
          </p>
          <p className="text-sm text-stera-ink-soft">Plantgegevens laden...</p>
        </div>
      </SteraShell>
    )
  }

  if (state.kind === 'invalid-params') {
    return (
      <SteraShell>
        <FallbackCard
          eyebrow="Onderhoud · Ongeldige link"
          title="Onvolledige onderhoudslink"
          body="Deze link mist een onderhouds- of plant-id. Open de onderhoudsbeurt opnieuw of scan de QR-code van de plant."
          actions={
            <>
              <Link
                href="/maintenance"
                className="stera-cta inline-flex items-center justify-center bg-stera-green px-6 py-4 text-sm text-white hover:bg-stera-green-deep"
              >
                Onderhoudsoverzicht →
              </Link>
              </>
          }
        />
      </SteraShell>
    )
  }

  if (state.kind === 'visit-not-found') {
    return (
      <SteraShell>
        <FallbackCard
          eyebrow="Onderhoud · Niet gevonden"
          title="Onderhoudsbeurt niet gevonden"
          body="We konden geen onderhoudsbeurt vinden bij deze link. Mogelijk is de beurt verwijderd, of ben je niet aangemeld."
          details={
            state.visitId ? (
              <>
                Onderhouds-id:{' '}
                <span className="font-mono text-stera-ink break-all">
                  {state.visitId}
                </span>
              </>
            ) : null
          }
          actions={
            <>
              <Link
                href="/maintenance"
                className="stera-cta inline-flex items-center justify-center bg-stera-green px-6 py-4 text-sm text-white hover:bg-stera-green-deep"
              >
                Onderhoudsoverzicht →
              </Link>
              <Link
                href="/login"
                className="stera-cta inline-flex items-center justify-center border border-stera-green px-6 py-4 text-sm text-stera-ink hover:bg-stera-green hover:text-white"
              >
                Inloggen
              </Link>
              </>
          }
        />
      </SteraShell>
    )
  }

  if (state.kind === 'plant-not-found') {
    return (
      <SteraShell>
        <FallbackCard
          eyebrow="Plant · Niet gevonden"
          title="Plant niet gevonden"
          body="Deze plant bestaat niet meer of is niet toegankelijk met je huidige sessie. Scan de QR-code opnieuw of kies een plant uit de lijst."
          details={
            <>
              {state.plantId ? (
                <>
                  Gescande plant-id:{' '}
                  <span className="font-mono text-stera-ink break-all">
                    {state.plantId}
                  </span>
                </>
              ) : null}
            </>
          }
          actions={
            <>
              {state.visitId ? (
                <>
                  <Link
                    href={`/maintenance/${state.visitId}/plants/scan`}
                    className="stera-cta inline-flex items-center justify-center bg-stera-green px-6 py-4 text-sm text-white hover:bg-stera-green-deep"
                  >
                    Opnieuw scannen →
                  </Link>
                  <Link
                    href={`/maintenance/${state.visitId}/plants`}
                    className="stera-cta inline-flex items-center justify-center border border-stera-green px-6 py-4 text-sm text-stera-ink hover:bg-stera-green hover:text-white"
                  >
                    Plant kiezen
                  </Link>
                </>
              ) : (
                <Link
                  href="/maintenance"
                  className="stera-cta inline-flex items-center justify-center bg-stera-green px-6 py-4 text-sm text-white hover:bg-stera-green-deep"
                >
                  Onderhoudsoverzicht →
                </Link>
              )}
              </>
          }
        />
      </SteraShell>
    )
  }

  if (state.kind === 'plant-wrong-location') {
    return (
      <SteraShell>
        <FallbackCard
          eyebrow="Plant · Verkeerde locatie"
          title="Plant hoort niet bij deze onderhoudsbeurt"
          body="Deze plant staat op een andere locatie dan de huidige onderhoudsbeurt. Scan een plant van de juiste locatie, of voeg de plant eerst toe aan deze locatie."
          details={
            state.plantId ? (
              <>
                Plant-id:{' '}
                <span className="font-mono text-stera-ink break-all">
                  {state.plantId}
                </span>
              </>
            ) : null
          }
          actions={
            <>
              {state.visitId ? (
                <Link
                  href={`/maintenance/${state.visitId}/plants/scan`}
                  className="stera-cta inline-flex items-center justify-center bg-stera-green px-6 py-4 text-sm text-white hover:bg-stera-green-deep"
                >
                  Opnieuw scannen →
                </Link>
              ) : null}
              {state.visitId ? (
                <Link
                  href={`/maintenance/${state.visitId}`}
                  className="stera-cta inline-flex items-center justify-center border border-stera-green px-6 py-4 text-sm text-stera-ink hover:bg-stera-green hover:text-white"
                >
                  Terug naar onderhoud
                </Link>
              ) : null}
              </>
          }
        />
      </SteraShell>
    )
  }

  if (state.kind === 'fetch-error') {
    return (
      <SteraShell>
        <FallbackCard
          eyebrow="Onderhoud · Fout"
          title="Deze onderhoudspagina kon niet geladen worden"
          body="Er ging iets mis bij het ophalen van deze plant. Dit kan een tijdelijke storing zijn, of je sessie is verlopen."
          details={
            <>
              {state.message ? (
                <p className="break-words">{state.message}</p>
              ) : null}
              {state.plantId ? (
                <p className="mt-1">
                  Plant-id:{' '}
                  <span className="font-mono text-stera-ink break-all">
                    {state.plantId}
                  </span>
                </p>
              ) : null}
            </>
          }
          actions={
            <>
              <button
                type="button"
                onClick={() => router.refresh()}
                className="stera-cta inline-flex items-center justify-center bg-stera-green px-6 py-4 text-sm text-white hover:bg-stera-green-deep"
              >
                Opnieuw proberen →
              </button>
              {state.visitId ? (
                <Link
                  href={`/maintenance/${state.visitId}`}
                  className="stera-cta inline-flex items-center justify-center border border-stera-green px-6 py-4 text-sm text-stera-ink hover:bg-stera-green hover:text-white"
                >
                  Terug naar onderhoud
                </Link>
              ) : null}
              <Link
                href="/login"
                className="stera-cta inline-flex items-center justify-center border border-stera-green px-6 py-4 text-sm text-stera-ink hover:bg-stera-green hover:text-white"
              >
                Inloggen
              </Link>
            </>
          }
        />
      </SteraShell>
    )
  }

  return (
    <main className="p-6">
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Onderhoud registreren</h1>
            {visitTitle ? (
              <p className="text-sm text-gray-600">Onderhoud: {visitTitle}</p>
            ) : null}
            {locationName ? (
              <p className="text-sm text-stera-ink-soft">Locatie: {locationName}</p>
            ) : null}
            {plantName ? (
              <p className="text-sm text-stera-ink-soft">
                Plant: {plantName}
                {plantCode ? ` (${plantCode})` : ''}
              </p>
            ) : null}
            {species && (
              <p className="text-sm text-stera-ink-soft">Soort: {species}</p>
            )}
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href={`/maintenance/${visitId}/plants`}
              className="stera-cta stera-cta-ghost"
            >
              Terug
            </Link>

            </div>
        </div>

        <form onSubmit={handleSubmit} className="stera-card space-y-6">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex items-center gap-3 rounded-lg border border-stera-line bg-white p-3">
              <input
                type="checkbox"
                checked={checked}
                onChange={(e) => setChecked(e.target.checked)}
              />
              <span>Plant gecontroleerd</span>
            </label>

            <label className="flex items-center gap-3 rounded-lg border border-stera-line bg-white p-3">
              <input
                type="checkbox"
                checked={watered}
                onChange={(e) => setWatered(e.target.checked)}
              />
              <span>Water gegeven</span>
            </label>

            <label className="flex items-center gap-3 rounded-lg border border-stera-line bg-white p-3">
              <input
                type="checkbox"
                checked={pruned}
                onChange={(e) => setPruned(e.target.checked)}
              />
              <span>Gesnoeid</span>
            </label>

            <label className="flex items-center gap-3 rounded-lg border border-stera-line bg-white p-3">
              <input
                type="checkbox"
                checked={fed}
                onChange={(e) => setFed(e.target.checked)}
              />
              <span>Voeding toegevoegd</span>
            </label>

            <label className="flex items-center gap-3 rounded-lg border border-stera-line bg-white p-3">
              <input
                type="checkbox"
                checked={cleaned}
                onChange={(e) => setCleaned(e.target.checked)}
              />
              <span>Bladeren gereinigd</span>
            </label>

            <label className="flex items-center gap-3 rounded-lg border border-stera-line bg-white p-3">
              <input
                type="checkbox"
                checked={rotated}
                onChange={(e) => setRotated(e.target.checked)}
              />
              <span>Gedraaid</span>
            </label>

            <label className="flex items-center gap-3 rounded-lg border border-stera-line bg-white p-3">
              <input
                type="checkbox"
                checked={repotted}
                onChange={(e) => setRepotted(e.target.checked)}
              />
              <span>Verpot</span>
            </label>

            <label className="flex items-center gap-3 rounded-lg border border-stera-line bg-white p-3">
              <input
                type="checkbox"
                checked={replaced}
                onChange={(e) => setReplaced(e.target.checked)}
              />
              <span>Vervangen</span>
            </label>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium">
              Foto van de plant
            </label>
            <p className="text-xs text-stera-ink-soft">
              Neem een foto na het onderhoud — die wordt bewaard bij deze beurt
              zodat klant en Stera de evolutie zien.
            </p>

            {(photoPreview || existingPhotoUrl) && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={photoPreview || existingPhotoUrl || ''}
                alt="Plantfoto"
                className="rounded-lg border border-stera-line max-h-72 w-full object-cover"
              />
            )}

            <div className="flex flex-wrap items-center gap-3">
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(e) => handlePhotoChange(e.target.files?.[0] || null)}
                className="w-full rounded-lg border border-stera-line bg-white p-3"
              />
              {photoFile && (
                <button
                  type="button"
                  onClick={() => handlePhotoChange(null)}
                  className="text-sm text-stera-green underline"
                >
                  Wissen
                </button>
              )}
            </div>

            {photoError && (
              <p className="text-sm text-red-600">{photoError}</p>
            )}

            {existingPhotoUrl && !photoFile && (
              <p className="text-xs text-stera-ink-soft">
                Bestaande foto blijft behouden tot je een nieuwe neemt.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <label htmlFor="health_status" className="block text-sm font-medium">
              Status na onderhoud
            </label>
            <select
              id="health_status"
              value={healthStatus}
              onChange={(e) => setHealthStatus(e.target.value)}
              className="w-full rounded-lg border border-stera-line bg-white px-3 py-3"
            >
              <option value="healthy">Healthy</option>
              <option value="needs_attention">Needs attention</option>
              <option value="maintenance_due">Maintenance due</option>
              <option value="replacement_needed">Replacement needed</option>
              <option value="dead">Dead</option>
            </select>
          </div>

          <div className="space-y-2">
            <label htmlFor="notes" className="block text-sm font-medium">
              Onderhoudsnotities
            </label>
            <textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={5}
              className="w-full rounded-lg border border-stera-line bg-white px-3 py-3"
              placeholder="Bijv. water gegeven, bladeren gereinigd, voeding toegevoegd..."
            />
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={saving}
              className="stera-cta stera-cta-primary disabled:opacity-50"
            >
              {saving ? 'Opslaan...' : 'Onderhoud opslaan'}
            </button>

            <Link
              href={`/maintenance/${visitId}`}
              className="stera-cta stera-cta-ghost"
            >
              Annuleren
            </Link>
          </div>

          {saveError && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {saveError}
            </div>
          )}
        </form>
      </div>
    </main>
  )
}
