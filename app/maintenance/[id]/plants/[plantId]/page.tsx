'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import SteraLogo from '@/components/stera-logo'
import {
  ACTIVE_POT_SIZES,
  findPotSize,
  formatPotSize,
  nextPotSize,
} from '@/lib/pot-sizes'
import { recomputeAutoConsumables } from '@/lib/auto-consumables'

// Markers in `notes` om verbruiksregels te herkennen die automatisch
// zijn aangemaakt bij een "Verpot"-actie. Worden verborgen in de UI
// (zie cleanNotes in visit-consumables.tsx) en gebruikt om bij elke
// save de juiste aggregaten te herbouwen.
//   [auto:repot-pot:<visit_id>]  → per visit, één per pot-maat
//   [auto:repot-soil:<visit_id>] → per visit, één voor de potgrond
// Oude formaat (verwijderd, maar wordt nog opgekuist bij save):
//   [auto:repot:<plant_id>]      → per plant (legacy)

function parseIntOrNull(value: string): number | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  const parsed = parseInt(trimmed, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

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
  // Telefoonfoto's zijn vaak 3-12 MB groot. We verkleinen elke foto naar
  // een lange zijde van max 1600px en encoderen als JPEG — ook foto's die
  // al JPEG zijn. Dat scheelt enorm in upload- én laadtijd door de app.
  const MAX_EDGE = 1600
  const QUALITY = 0.82

  const image = await loadImageFromFile(file)
  const naturalW = image.naturalWidth || image.width
  const naturalH = image.naturalHeight || image.height
  if (!naturalW || !naturalH) throw new Error('Afbeelding zonder afmetingen.')

  // Alleen verkleinen, nooit oprekken.
  const scale = Math.min(1, MAX_EDGE / Math.max(naturalW, naturalH))
  const width = Math.round(naturalW * scale)
  const height = Math.round(naturalH * scale)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas niet beschikbaar.')
  ctx.drawImage(image, 0, 0, width, height)

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, 'image/jpeg', QUALITY)
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
        © {new Date().getFullYear()} Stera Pro · Plantbeheer voor professionals
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
  const [polished, setPolished] = useState(false)
  const [repotted, setRepotted] = useState(false)
  const [currentPotSize, setCurrentPotSize] = useState<string | null>(null)
  const [newPotSize, setNewPotSize] = useState('')
  const [replaced, setReplaced] = useState(false)
  const [checked, setChecked] = useState(true)
  const [healthStatus, setHealthStatus] = useState('healthy')
  const [notes, setNotes] = useState('')

  const [followupRepot, setFollowupRepot] = useState(false)
  const [followupPrune, setFollowupPrune] = useState(false)
  const [followupReplace, setFollowupReplace] = useState(false)
  const [followupTreat, setFollowupTreat] = useState(false)
  const [followupNotes, setFollowupNotes] = useState('')

  // Vervangingsspecs — alleen relevant als followupReplace = true
  const [replacementLight, setReplacementLight] = useState<
    '' | 'high' | 'medium' | 'low'
  >('')
  const [replacementHeight, setReplacementHeight] = useState('')
  const [replacementPotDiameter, setReplacementPotDiameter] = useState('')
  const [replacementHanging, setReplacementHanging] = useState(false)
  const [replacementCareLevel, setReplacementCareLevel] = useState<
    '' | 'easy' | 'hard'
  >('')
  const [replacementOuterPot, setReplacementOuterPot] = useState(false)
  const [replacementNotes, setReplacementNotes] = useState('')

  const [existingPhotoUrl, setExistingPhotoUrl] = useState<string | null>(null)
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState('')
  const [photoError, setPhotoError] = useState('')

  // Foto van de ruimte (waar de nieuwe vervangings-plant moet komen).
  // Wordt later gebruikt om een AI-render te maken met de voorgestelde
  // plant op dezelfde locatie.
  const [existingRoomPhotoUrl, setExistingRoomPhotoUrl] = useState<
    string | null
  >(null)
  const [roomPhotoFile, setRoomPhotoFile] = useState<File | null>(null)
  const [roomPhotoPreview, setRoomPhotoPreview] = useState('')

  const [state, setState] = useState<LoadState>({ kind: 'loading' })
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  // Werkbon getekend of gefactureerd? Dan staat alles vast.
  const [workOrderLocked, setWorkOrderLocked] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function loadData() {
      if (!visitId || !plantId) {
        setState({ kind: 'invalid-params' })
        return
      }

      setState({ kind: 'loading' })

      try {
        const [visitResult, plantResult, existingResult, workOrderResult] =
          await Promise.all([
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
              location_id,
              pot_size_code
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

          supabase
            .from('work_orders')
            .select('status')
            .eq('visit_id', visitId)
            .maybeSingle(),
        ])

        if (cancelled) return

        const { data: visit, error: visitError } = visitResult
        const { data: plant, error: plantError } = plantResult
        const { data: existingVisitPlant, error: visitPlantError } =
          existingResult
        const { data: workOrder } = workOrderResult
        setWorkOrderLocked(
          workOrder?.status === 'signed' ||
            workOrder?.status === 'invoiced'
        )

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
        setCurrentPotSize(plant.pot_size_code ?? null)
        // Default voor nieuwe maat: één maat groter dan de huidige.
        // Geen huidige maat bekend? Laat leeg — Jelle kiest zelf.
        setNewPotSize(
          nextPotSize(plant.pot_size_code)?.code ?? plant.pot_size_code ?? ''
        )

        if (existingVisitPlant) {
          setNotes(existingVisitPlant.notes || '')
          setWatered(Boolean(existingVisitPlant.action_watered))
          setPruned(Boolean(existingVisitPlant.action_pruned))
          setFed(Boolean(existingVisitPlant.action_fed))
          setCleaned(Boolean(existingVisitPlant.action_cleaned))
          setRotated(Boolean(existingVisitPlant.action_rotated))
          setPolished(Boolean(existingVisitPlant.action_polished))
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
          setFollowupRepot(Boolean(existingVisitPlant.followup_repot))
          setFollowupPrune(Boolean(existingVisitPlant.followup_prune))
          setFollowupReplace(Boolean(existingVisitPlant.followup_replace))
          setFollowupTreat(Boolean(existingVisitPlant.followup_treat))
          setFollowupNotes(existingVisitPlant.followup_notes || '')
          setReplacementLight(
            existingVisitPlant.replacement_light_level === 'high' ||
              existingVisitPlant.replacement_light_level === 'medium' ||
              existingVisitPlant.replacement_light_level === 'low'
              ? existingVisitPlant.replacement_light_level
              : ''
          )
          setReplacementHeight(
            existingVisitPlant.replacement_height_cm
              ? String(existingVisitPlant.replacement_height_cm)
              : ''
          )
          setReplacementPotDiameter(
            existingVisitPlant.replacement_pot_diameter_cm
              ? String(existingVisitPlant.replacement_pot_diameter_cm)
              : ''
          )
          setReplacementHanging(
            Boolean(existingVisitPlant.replacement_is_hanging)
          )
          setReplacementCareLevel(
            existingVisitPlant.replacement_care_level === 'easy' ||
              existingVisitPlant.replacement_care_level === 'hard'
              ? existingVisitPlant.replacement_care_level
              : ''
          )
          setReplacementOuterPot(
            Boolean(existingVisitPlant.replacement_needs_outer_pot)
          )
          setReplacementNotes(existingVisitPlant.replacement_notes || '')
          setExistingPhotoUrl(existingVisitPlant.photo_url ?? null)
          setExistingRoomPhotoUrl(
            existingVisitPlant.replacement_room_photo_url ?? null
          )
        } else {
          // Geen bestaand visit_plant — pre-vul met de standaard
          // onderhoudsacties zodat Jelle alleen hoeft uit te vinken wat
          // hij vandaag NIET deed (sneller dan alles aanvinken).
          setNotes('')
          setWatered(true)
          setPruned(true)
          setFed(true)
          setCleaned(true) // bladeren reinigen valt in standaard (incl. bladglans)
          setRotated(true)
          setPolished(false) // niet langer apart — onder cleaned
          setRepotted(false)
          setReplaced(false)
          setChecked(true)
          setHealthStatus(plant.status || 'healthy')
          setFollowupRepot(false)
          setFollowupPrune(false)
          setFollowupReplace(false)
          setFollowupTreat(false)
          setFollowupNotes('')
          setReplacementLight('')
          setReplacementHeight('')
          setReplacementPotDiameter('')
          setReplacementHanging(false)
          setReplacementCareLevel('')
          setReplacementOuterPot(false)
          setReplacementNotes('')
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

  useEffect(() => {
    return () => {
      if (roomPhotoPreview) URL.revokeObjectURL(roomPhotoPreview)
    }
  }, [roomPhotoPreview])

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

  async function handleRoomPhotoChange(file: File | null) {
    if (!file) {
      if (roomPhotoPreview) URL.revokeObjectURL(roomPhotoPreview)
      setRoomPhotoFile(null)
      setRoomPhotoPreview('')
      return
    }
    try {
      const jpeg = await fileToJpeg(file)
      if (roomPhotoPreview) URL.revokeObjectURL(roomPhotoPreview)
      setRoomPhotoFile(jpeg)
      setRoomPhotoPreview(URL.createObjectURL(jpeg))
    } catch {
      // Ruimtefoto is optioneel — stil falen volstaat.
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!visitId || !plantId) return
    if (workOrderLocked) {
      setSaveError(
        'Werkbon staat vast — geen wijzigingen meer mogelijk op deze beurt.'
      )
      return
    }

    setSaving(true)
    setSaveError('')

    try {
      // Wanneer de plant vervangen moet worden, hebben we een actuele
      // foto van de slechte staat nodig — die komt op de werkbon om
      // de klant te tonen waarom we vervangen.
      if (followupReplace && !photoFile && !existingPhotoUrl) {
        throw new Error(
          'Neem een foto van de plant in haar huidige staat — die hebben we nodig op de werkbon om de vervanging te onderbouwen.'
        )
      }

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

      // Optionele ruimte-foto voor vervangingsplant (Phase 1 offerte).
      let roomPhotoPath: string | null | undefined = undefined
      let roomPhotoUrl: string | null | undefined = undefined
      if (followupReplace && roomPhotoFile) {
        const fileName = `visits/${visitId}/${plantId}-room-${Date.now()}.jpg`
        const { error: uploadError } = await supabase.storage
          .from('plant-photos')
          .upload(fileName, roomPhotoFile, {
            upsert: false,
            contentType: 'image/jpeg',
          })
        if (uploadError) throw new Error(uploadError.message)
        roomPhotoPath = fileName
        const { data: publicUrlData } = supabase.storage
          .from('plant-photos')
          .getPublicUrl(fileName)
        roomPhotoUrl = publicUrlData.publicUrl
      }

      // Een plant die dood is of voor vervanging staat, is niet
      // verpot — corrigeer dat hier zodat de DB consistent blijft
      // en de verbruiks-aggregatie niets vals optelt.
      const effectiveRepotted =
        repotted && healthStatus !== 'dead' && !followupReplace

      const payload: Record<string, unknown> = {
        visit_id: visitId,
        plant_id: plantId,
        notes: notes.trim() || null,
        action_watered: watered,
        action_pruned: pruned,
        action_fed: fed,
        action_cleaned: cleaned,
        action_rotated: rotated,
        action_polished: polished,
        action_repotted: effectiveRepotted,
        action_replaced: replaced,
        action_checked: checked,
        health_status: healthStatus,
        followup_repot: followupRepot,
        followup_prune: followupPrune,
        followup_replace: followupReplace,
        followup_treat: followupTreat,
        followup_notes: followupNotes.trim() || null,
        // Vervangingsspecs — alleen bewaren als de plant ook effectief
        // gemarkeerd is om vervangen te worden, anders nullen.
        replacement_light_level: followupReplace
          ? replacementLight || null
          : null,
        replacement_height_cm: followupReplace
          ? parseIntOrNull(replacementHeight)
          : null,
        replacement_pot_diameter_cm: followupReplace
          ? parseIntOrNull(replacementPotDiameter)
          : null,
        replacement_is_hanging: followupReplace ? replacementHanging : false,
        replacement_care_level: followupReplace
          ? replacementCareLevel || null
          : null,
        replacement_needs_outer_pot: followupReplace
          ? replacementOuterPot
          : false,
        // Notitie hoort bij elke dode plant — ook als hij NIET vervangen
        // wordt (dan staat hier waarom).
        replacement_notes:
          healthStatus === 'dead'
            ? replacementNotes.trim() || null
            : null,
      }

      if (photoPath !== undefined) {
        payload.photo_path = photoPath
        payload.photo_url = photoUrl
      }
      if (roomPhotoPath !== undefined) {
        payload.replacement_room_photo_path = roomPhotoPath
        payload.replacement_room_photo_url = roomPhotoUrl
      } else if (!followupReplace) {
        // Geen vervanging meer aangevinkt → ruimte-foto niet meer relevant.
        payload.replacement_room_photo_path = null
        payload.replacement_room_photo_url = null
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

      const plantUpdatePayload: Record<string, unknown> = {
        status: healthStatus,
        notes: notes.trim() || null,
      }
      // Verpot + nieuwe maat gekozen? → potmaat van de plant bijwerken
      // zodat de "next size up"-suggestie volgende keer klopt. Niet
      // doen als de plant intussen als dood/te-vervangen gemarkeerd is.
      if (effectiveRepotted && newPotSize) {
        plantUpdatePayload.pot_size_code = newPotSize
      }

      const { error: plantUpdateError } = await supabase
        .from('plants')
        .update(plantUpdatePayload)
        .eq('id', plantId)

      if (plantUpdateError) {
        throw plantUpdateError
      }

      // Automatische verbruiksgoederen voor de hele beurt opnieuw
      // berekenen. Eén centrale helper handelt zowel het oude per-
      // plant formaat als de aggregaten (binnenpot per maat, potgrond,
      // standaard bladglans/voeding, neemolie bij zieke planten).
      try {
        await recomputeAutoConsumables(supabase, visitId)
      } catch (autoErr) {
        console.error(
          '[maintenance plant save] recompute auto consumables',
          autoErr
        )
      }

      toast.success(`${plantName || 'Plant'} opgeslagen`)
      router.push(`/maintenance/${visitId}`)
      router.refresh()
    } catch (err) {
      console.error('[maintenance plant save]', err)
      const msg = err instanceof Error ? err.message : 'Opslaan mislukt.'
      setSaveError(msg)
      toast.error(msg)
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
                    href={`/maintenance/${state.visitId}/plants/select`}
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
              href={`/maintenance/${visitId}`}
              className="stera-cta stera-cta-ghost"
            >
              Terug
            </Link>

            </div>
        </div>

        {workOrderLocked ? (
          <div className="rounded-xl border border-stera-green/40 bg-stera-green/5 p-4 text-sm">
            <p className="font-semibold text-stera-green">
              Werkbon staat vast
            </p>
            <p className="mt-1 text-stera-ink-soft">
              De klant heeft de werkbon goedgekeurd of de beurt is al
              gefactureerd — wijzigingen aan deze plant zijn niet meer
              mogelijk.
            </p>
          </div>
        ) : null}

        <form
          onSubmit={handleSubmit}
          className="stera-card space-y-6 [&:has(fieldset[disabled])]:opacity-70"
        >
          <fieldset disabled={workOrderLocked} className="space-y-6 contents">
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
          </div>

          {repotted && (
            <div className="space-y-2 rounded-lg border border-stera-line bg-stera-cream-deep/40 p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <label
                  htmlFor="new_pot_size"
                  className="text-sm font-medium text-stera-ink"
                >
                  Nieuwe binnenpot
                </label>
                <span className="text-xs text-stera-ink-soft">
                  {currentPotSize
                    ? `Huidige maat: ${currentPotSize}`
                    : 'Geen huidige maat geregistreerd'}
                </span>
              </div>
              <select
                id="new_pot_size"
                value={newPotSize}
                onChange={(e) => setNewPotSize(e.target.value)}
                className="w-full rounded-lg border border-stera-line bg-white p-3"
              >
                <option value="">Kies een nieuwe potmaat</option>
                {ACTIVE_POT_SIZES.map((p) => (
                  <option key={p.code} value={p.code}>
                    {formatPotSize(p)}
                  </option>
                ))}
              </select>
              <p className="text-xs text-stera-ink-soft">
                We voegen deze pot automatisch toe aan de verbruiksgoederen
                van deze beurt.
              </p>
            </div>
          )}

          <div className="space-y-2">
            <label className="block text-sm font-medium">
              Foto van de plant
            </label>
            <p className="text-xs text-stera-ink-soft">
              Neem een foto na het onderhoud — die wordt bewaard bij deze beurt
              zodat klant en Stera Pro de evolutie zien.
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
              onChange={(e) => {
                const value = e.target.value
                setHealthStatus(value)
                // Vervanging hoort enkel bij een dode plant. Bij 'dood'
                // staat de vervangingsvraag standaard op 'Ja'.
                setFollowupReplace(value === 'dead')
              }}
              className="w-full rounded-lg border border-stera-line bg-white px-3 py-3"
            >
              <option value="healthy">Gezond</option>
              <option value="needs_attention">Ziek</option>
              <option value="dead">Dood</option>
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

          {/* Opvolging — acties voor een plant die nog leeft. */}
          {healthStatus !== 'dead' && (
          <div className="space-y-3 rounded-lg border border-stera-line bg-stera-cream-deep/40 p-4">
            <div>
              <p className="text-sm font-semibold text-stera-ink">
                Opvolging nodig?
              </p>
              <p className="text-xs text-stera-ink-soft">
                Vink aan wat er met deze plant moet gebeuren. Dit komt op de
                voorbereidingslijst van de volgende beurt.
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="flex items-center gap-3 rounded-lg border border-stera-line bg-white p-3 text-sm">
                <input
                  type="checkbox"
                  checked={followupRepot}
                  onChange={(e) => setFollowupRepot(e.target.checked)}
                />
                <span>Verpotten</span>
              </label>
              <label className="flex items-center gap-3 rounded-lg border border-stera-line bg-white p-3 text-sm">
                <input
                  type="checkbox"
                  checked={followupPrune}
                  onChange={(e) => setFollowupPrune(e.target.checked)}
                />
                <span>Snoeien</span>
              </label>
              <label className="flex items-center gap-3 rounded-lg border border-stera-line bg-white p-3 text-sm">
                <input
                  type="checkbox"
                  checked={followupTreat}
                  onChange={(e) => setFollowupTreat(e.target.checked)}
                />
                <span>Behandelen</span>
              </label>
            </div>
            <div className="space-y-1">
              <label
                htmlFor="followup_notes"
                className="block text-sm font-medium text-stera-ink"
              >
                Opvolgingsnotitie
              </label>
              <textarea
                id="followup_notes"
                value={followupNotes}
                onChange={(e) => setFollowupNotes(e.target.value)}
                rows={2}
                className="w-full rounded-lg border border-stera-line bg-white px-3 py-2 text-sm"
                placeholder="Bijv. plant verzwakt, klant verwittigen..."
              />
            </div>
          </div>
          )}

          {/* Dode plant: moet ze vervangen worden? */}
          {healthStatus === 'dead' && (
            <div className="space-y-2 rounded-lg border border-stera-green/40 bg-stera-green/5 p-4">
              <p className="text-sm font-semibold text-stera-ink">
                Deze plant is dood. Moet ze vervangen worden?
              </p>
              <p className="text-xs text-stera-ink-soft">
                Bij &ldquo;Ja&rdquo; verschijnt deze beurt als voorstel
                onder Offertes.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setFollowupReplace(true)}
                  className={
                    followupReplace
                      ? 'flex-1 rounded-lg bg-stera-green px-3 py-2.5 text-sm font-semibold text-white'
                      : 'flex-1 rounded-lg border border-stera-line bg-white px-3 py-2.5 text-sm font-medium text-stera-ink'
                  }
                >
                  Ja, vervangen
                </button>
                <button
                  type="button"
                  onClick={() => setFollowupReplace(false)}
                  className={
                    !followupReplace
                      ? 'flex-1 rounded-lg bg-stera-ink px-3 py-2.5 text-sm font-semibold text-white'
                      : 'flex-1 rounded-lg border border-stera-line bg-white px-3 py-2.5 text-sm font-medium text-stera-ink'
                  }
                >
                  Nee
                </button>
              </div>

              <div className="space-y-1">
                <label
                  htmlFor="dead_replacement_notes"
                  className="block text-sm font-medium text-stera-ink"
                >
                  Toelichting / opmerking
                </label>
                <textarea
                  id="dead_replacement_notes"
                  value={replacementNotes}
                  onChange={(e) => setReplacementNotes(e.target.value)}
                  rows={2}
                  className="w-full rounded-lg border border-stera-line bg-white px-3 py-2 text-sm"
                  placeholder={
                    followupReplace
                      ? 'Bv. zelfde stijl als de andere planten, kleuraccent...'
                      : 'Bv. klant wil ze niet vervangen, te weinig licht...'
                  }
                />
                <p className="text-xs text-stera-ink-soft">
                  Verschijnt in de offerte als reden bij deze plant.
                </p>
              </div>
            </div>
          )}

          {/* Condities voor de vervangingsplant — sturen het offertevoorstel */}
          {followupReplace && (
            <div className="space-y-4 rounded-lg border border-stera-green/40 bg-stera-green/5 p-4">
              <div>
                <p className="text-sm font-semibold text-stera-green">
                  Condities voor de vervangingsplant
                </p>
                <p className="text-xs text-stera-ink-soft">
                  Deze gegevens gebruiken we om in de offerte automatisch een
                  passende hydrocultuur-plant voor te stellen.
                </p>
              </div>

              <div className="space-y-1">
                <label
                  htmlFor="replacement_light"
                  className="block text-sm font-medium text-stera-ink"
                >
                  Lichtbehoefte op deze plek
                </label>
                <select
                  id="replacement_light"
                  value={replacementLight}
                  onChange={(e) =>
                    setReplacementLight(
                      e.target.value as '' | 'high' | 'medium' | 'low'
                    )
                  }
                  className="w-full rounded-lg border border-stera-line bg-white px-3 py-2.5 text-sm"
                >
                  <option value="">— Kies lichtbehoefte —</option>
                  <option value="high">Zon</option>
                  <option value="medium">Half-schaduw</option>
                  <option value="low">Schaduw</option>
                </select>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <label
                    htmlFor="replacement_height"
                    className="block text-sm font-medium text-stera-ink"
                  >
                    Hoogte plant (cm)
                  </label>
                  <input
                    id="replacement_height"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    value={replacementHeight}
                    onChange={(e) => setReplacementHeight(e.target.value)}
                    placeholder="bv. 150"
                    className="w-full rounded-lg border border-stera-line bg-white px-3 py-2.5 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <label
                    htmlFor="replacement_pot"
                    className="block text-sm font-medium text-stera-ink"
                  >
                    Binnenpot maat (Ø cm)
                  </label>
                  <input
                    id="replacement_pot"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    value={replacementPotDiameter}
                    onChange={(e) =>
                      setReplacementPotDiameter(e.target.value)
                    }
                    placeholder="bv. 21"
                    className="w-full rounded-lg border border-stera-line bg-white px-3 py-2.5 text-sm"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label
                  htmlFor="replacement_care"
                  className="block text-sm font-medium text-stera-ink"
                >
                  Onderhoud
                </label>
                <select
                  id="replacement_care"
                  value={replacementCareLevel}
                  onChange={(e) =>
                    setReplacementCareLevel(
                      e.target.value as '' | 'easy' | 'hard'
                    )
                  }
                  className="w-full rounded-lg border border-stera-line bg-white px-3 py-2.5 text-sm"
                >
                  <option value="">— Maakt niet uit —</option>
                  <option value="easy">Makkelijk in onderhoud</option>
                  <option value="hard">Mag moeilijker zijn</option>
                </select>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <label className="flex items-center gap-3 rounded-lg border border-stera-line bg-white p-3 text-sm">
                  <input
                    type="checkbox"
                    checked={replacementHanging}
                    onChange={(e) => setReplacementHanging(e.target.checked)}
                  />
                  <span>Hangplant</span>
                </label>
                <label className="flex items-center gap-3 rounded-lg border border-stera-line bg-white p-3 text-sm">
                  <input
                    type="checkbox"
                    checked={replacementOuterPot}
                    onChange={(e) =>
                      setReplacementOuterPot(e.target.checked)
                    }
                  />
                  <span>Buitenpot nodig</span>
                </label>
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium text-stera-ink">
                  Foto van de plek (optioneel)
                </label>
                <p className="text-xs text-stera-ink-soft">
                  Een foto van de ruimte waar de nieuwe plant komt — handig
                  bij de offerte.
                </p>
                {(roomPhotoPreview || existingRoomPhotoUrl) && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={roomPhotoPreview || existingRoomPhotoUrl || ''}
                    alt="Foto van de plek"
                    className="max-h-56 w-full rounded-lg border border-stera-line object-cover"
                  />
                )}
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(e) =>
                    handleRoomPhotoChange(e.target.files?.[0] || null)
                  }
                  className="w-full rounded-lg border border-stera-line bg-white p-3 text-sm"
                />
              </div>

            </div>
          )}

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
          </fieldset>
        </form>
      </div>
    </main>
  )
}
