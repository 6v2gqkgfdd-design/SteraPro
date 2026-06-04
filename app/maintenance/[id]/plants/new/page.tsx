'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { fetchPlayfulNickname, pickLocalNickname } from '@/lib/nicknames'
import { prepareImage } from '@/lib/image'
import {
  STANDARD_MAINTENANCE_ACTIONS,
  STANDARD_MAINTENANCE_HEALTH_STATUS,
} from '@/lib/standard-maintenance'
import { ACTIVE_POT_SIZES, formatPotSize } from '@/lib/pot-sizes'
import { formatRoomLabel } from '@/lib/rooms'

type RoomOption = {
  id: string
  name: string | null
  floor: string | null
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function generateReferenceCode() {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  const random = Math.random().toString(36).slice(2, 6).toUpperCase()
  return `PLT-${y}${m}${d}-${random}`
}

export default function MaintenanceNewPlantPage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const supabase = createClient()

  const visitId = params.id

  const [visitTitle, setVisitTitle] = useState('')
  const [locationId, setLocationId] = useState('')
  const [locationName, setLocationName] = useState('')
  const [companyId, setCompanyId] = useState('')
  const [rooms, setRooms] = useState<RoomOption[]>([])
  const [roomId, setRoomId] = useState('')

  const [nickname, setNickname] = useState('')
  const [referenceCode, setReferenceCode] = useState('')
  const [species, setSpecies] = useState('')
  const [status, setStatus] = useState('healthy')
  const [notes, setNotes] = useState('')
  const [potSizeCode, setPotSizeCode] = useState('')
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState('')
  const [aiSuggestedSpecies, setAiSuggestedSpecies] = useState('')
  const [aiConfidence, setAiConfidence] = useState<number | null>(null)
  const [isIdentifying, setIsIdentifying] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const [nicknameLoading, setNicknameLoading] = useState(false)
  const [nicknameEditedByUser, setNicknameEditedByUser] = useState(false)
  const [workOrderLocked, setWorkOrderLocked] = useState(false)

  useEffect(() => {
    setReferenceCode(generateReferenceCode())
    setNickname(pickLocalNickname())
  }, [])

  async function regenerateNickname() {
    if (nicknameLoading) return
    setNicknameLoading(true)
    try {
      const next = await fetchPlayfulNickname({
        species,
        avoid: nickname ? [nickname] : [],
      })
      setNickname(next)
    } finally {
      setNicknameLoading(false)
    }
  }

  useEffect(() => {
    async function loadVisit() {
      const { data, error } = await supabase
        .from('maintenance_visits')
        .select(`
          id,
          title,
          location_id,
          company_id,
          locations (
            id,
            name
          ),
          maintenance_visit_rooms (
            rooms ( id, name, floor )
          )
        `)
        .eq('id', visitId)
        .single()

      if (error || !data) {
        setError('Kon onderhoudsbeurt niet ophalen.')
        return
      }

      const locationData = data.locations as any
      const resolvedLocationName = Array.isArray(locationData)
        ? (locationData[0]?.name || '')
        : (locationData?.name || '')

      setVisitTitle(data.title || '')
      setLocationId(data.location_id || '')
      setCompanyId(data.company_id || '')
      setLocationName(resolvedLocationName)

      // Werkbon-status: gelockt voor goedgekeurde of gefactureerde beurten
      const { data: wo } = await supabase
        .from('work_orders')
        .select('status')
        .eq('visit_id', visitId)
        .maybeSingle()
      setWorkOrderLocked(
        wo?.status === 'signed' || wo?.status === 'invoiced'
      )

      // Ruimtes scopen tot wat in deze beurt gepland staat.
      // Geen ruimtes gekoppeld? → fallback naar alle ruimtes van de locatie.
      const visitRooms: RoomOption[] = Array.isArray(
        data.maintenance_visit_rooms
      )
        ? (data.maintenance_visit_rooms as any[])
            .map((mvr) => {
              const r = Array.isArray(mvr.rooms) ? mvr.rooms[0] : mvr.rooms
              return r as RoomOption | null
            })
            .filter((r): r is RoomOption => Boolean(r))
        : []

      let roomList: RoomOption[] = []

      if (visitRooms.length > 0) {
        roomList = visitRooms
      } else if (data.location_id) {
        const { data: allRooms } = await supabase
          .from('rooms')
          .select('id, name, floor')
          .eq('location_id', data.location_id)
          .order('name', { ascending: true })
        roomList = (allRooms ?? []) as RoomOption[]
      }

      setRooms(roomList)
      if (roomList.length > 0) {
        setRoomId(roomList[0].id)
      }
    }

    if (visitId) {
      loadVisit()
    }
  }, [visitId, supabase])

  useEffect(() => {
    return () => {
      if (photoPreview) {
        URL.revokeObjectURL(photoPreview)
      }
    }
  }, [photoPreview])

  async function handlePhotoChange(file: File | null) {
    setAiSuggestedSpecies('')
    setAiConfidence(null)
    setError('')

    if (!file) {
      if (photoPreview) {
        URL.revokeObjectURL(photoPreview)
      }

      setPhotoFile(null)
      setPhotoPreview('')
      return
    }

    setIsIdentifying(true)

    try {
      const prepared = await prepareImage(file)

      if (photoPreview) {
        URL.revokeObjectURL(photoPreview)
      }

      const previewUrl = URL.createObjectURL(prepared.file)
      setPhotoPreview(previewUrl)
      setPhotoFile(prepared.file)

      // Stuur de foto rechtstreeks als base64 naar de identify-route.
      // Geen tussen-upload meer naar Storage — sneller én onafhankelijk
      // van de bucket-toegang.
      const response = await fetch('/api/plants/identify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          imageBase64: {
            data: prepared.base64,
            media_type: prepared.mediaType,
          },
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'AI-herkenning mislukt.')
      }

      setAiSuggestedSpecies(result.suggested_species || '')
      setAiConfidence(
        typeof result.confidence === 'number' ? result.confidence : null
      )

      if (result.suggested_species) {
        setSpecies(result.suggested_species)
        // Bijnaam afstemmen op de herkende soort, tenzij gebruiker al
        // zelf een bijnaam heeft getypt.
        if (!nicknameEditedByUser) {
          setNicknameLoading(true)
          try {
            const next = await fetchPlayfulNickname({
              species: result.suggested_species,
              avoid: nickname ? [nickname] : [],
            })
            setNickname(next)
          } finally {
            setNicknameLoading(false)
          }
        }
      }
    } catch (err) {
      console.error(err)
      setError(err instanceof Error ? err.message : 'AI-herkenning mislukt.')
    } finally {
      setIsIdentifying(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (workOrderLocked) {
      setError('Werkbon staat vast — geen nieuwe planten toevoegen.')
      return
    }
    setLoading(true)
    setError('')

    try {
      if (!companyId || !locationId) {
        throw new Error('Locatie of klant ontbreekt voor deze onderhoudsbeurt.')
      }
      if (!photoFile) {
        throw new Error(
          'Neem een foto van de plant. Dit is de referentiefoto die we voortaan tonen op de plantfiche.'
        )
      }

      let photoPath: string | null = null
      let photoUrl: string | null = null

      if (photoFile) {
        const fileName = `${locationId}/${referenceCode}-${Date.now()}.jpg`

        const { error: uploadError } = await supabase.storage
          .from('plant-photos')
          .upload(fileName, photoFile, {
            upsert: false,
            contentType: 'image/jpeg',
          })

        if (uploadError) {
          throw new Error(uploadError.message)
        }

        photoPath = fileName

        const { data: publicUrlData } = supabase.storage
          .from('plant-photos')
          .getPublicUrl(fileName)

        photoUrl = publicUrlData.publicUrl
      }

      const baseValue = nickname.trim() || species.trim() || referenceCode
      // Leesbare basis + cryptografisch sterke token → niet raadbaar/afloopbaar.
      const qrSlug = `${slugify(baseValue)}-${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`

      const { data: insertedPlant, error: plantError } = await supabase
        .from('plants')
        .insert([
          {
            company_id: companyId,
            location_id: locationId,
            room_id: roomId || null,
            plant_code: referenceCode,
            nickname: nickname.trim() || null,
            species: species.trim() || null,
            status,
            notes: notes.trim() || null,
            qr_slug: qrSlug,
            reference_code: referenceCode,
            photo_path: photoPath,
            photo_url: photoUrl,
            ai_suggested_species: aiSuggestedSpecies || null,
            ai_confidence: aiConfidence,
            pot_size_code: potSizeCode || null,
          },
        ])
        .select('id')
        .single()

      if (plantError || !insertedPlant) {
        throw new Error(plantError?.message || 'Plant opslaan mislukt.')
      }

      // Een nieuwe plant tijdens een onderhoud krijgt automatisch het
      // standaard onderhoud (water, voeding, snoei, controle, draaien,
      // bladglans). Jelle kan op de volgende pagina nog corrigeren als
      // de plant ziek is of speciaal behandeld moet worden.
      const { error: visitPlantError } = await supabase
        .from('maintenance_visit_plants')
        .insert([
          {
            visit_id: visitId,
            plant_id: insertedPlant.id,
            health_status: STANDARD_MAINTENANCE_HEALTH_STATUS,
            ...STANDARD_MAINTENANCE_ACTIONS,
          },
        ])

      if (visitPlantError && visitPlantError.code !== '23505') {
        // 23505 = al bestaand record (uniek-constraint), geen issue.
        console.error(
          '[maintenance-plants-new] visit_plant insert failed',
          visitPlantError
        )
      }

      if (species.trim()) {
        fetch('/api/plants/care-tips', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ plantId: insertedPlant.id }),
        }).catch(() => {})
      }

      router.push(`/maintenance/${visitId}/plants/${insertedPlant.id}`)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Opslaan mislukt.')
      setLoading(false)
      return
    }
  }

  return (
    <main className="bg-stera-cream p-6">
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="stera-eyebrow mb-2">Onderhoud · Nieuwe plant</p>
            <h1 className="stera-display text-3xl sm:text-4xl">Nieuwe plant</h1>
            {visitTitle && (
              <p className="mt-2 text-sm text-stera-ink-soft">
                Onderhoud: {visitTitle}
              </p>
            )}
            {locationName && (
              <p className="text-sm text-stera-ink-soft">
                Locatie: {locationName}
              </p>
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
              Geen nieuwe planten meer toevoegen aan deze beurt — de
              werkbon is goedgekeurd of gefactureerd.
            </p>
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="stera-card space-y-4">
          <fieldset disabled={workOrderLocked} className="space-y-4 contents">
          <div className="rounded-lg bg-stera-cream-deep p-3 text-sm">
            Referentiecode: <strong>{referenceCode || 'Wordt gegenereerd...'}</strong>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase tracking-wider text-stera-green">
              Ruimte
            </label>
            <select
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              className="w-full rounded-lg border border-stera-line bg-white p-3"
              required
              disabled={rooms.length === 0}
            >
              <option value="">
                {rooms.length === 0
                  ? 'Geen ruimtes — voeg er eerst een toe op de locatie'
                  : 'Kies een ruimte'}
              </option>
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {formatRoomLabel(r.name, r.floor)}
                </option>
              ))}
            </select>
          </div>

          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(e) => handlePhotoChange(e.target.files?.[0] || null)}
            className="w-full rounded-lg border border-stera-line bg-white p-3"
          />

          {photoPreview && (
            <img
              src={photoPreview}
              alt="Preview van plantfoto"
              className="rounded-lg border border-stera-line"
            />
          )}

          {isIdentifying && (
            <p className="text-sm text-stera-ink-soft">AI analyseert de plantfoto...</p>
          )}

          {aiSuggestedSpecies && (
            <div className="rounded-lg bg-stera-green/10 border border-stera-green/30 p-3 text-sm">
              AI suggestie: <strong>{aiSuggestedSpecies}</strong>
              {typeof aiConfidence === 'number' && (
                <span> ({Math.round(aiConfidence * 100)}% zekerheid)</span>
              )}
            </div>
          )}

          <div className="space-y-1">
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Bijnaam / plantnaam"
                value={nickname}
                onChange={(e) => {
                  setNickname(e.target.value)
                  setNicknameEditedByUser(true)
                }}
                className="flex-1 rounded-lg border border-stera-line bg-white p-3"
              />
              <button
                type="button"
                onClick={regenerateNickname}
                disabled={nicknameLoading}
                className="shrink-0 rounded-lg border border-stera-line bg-white px-3 text-sm font-medium text-stera-ink transition hover:border-stera-green disabled:opacity-50"
                title={
                  species
                    ? `Verzin bijnaam op basis van ${species}`
                    : 'Verzin nieuwe bijnaam'
                }
              >
                {nicknameLoading ? '...' : 'Andere'}
              </button>
            </div>
            {species ? (
              <p className="text-xs text-stera-ink-soft">
                Bijnaam wordt afgestemd op de soort als je op &ldquo;Andere&rdquo; tikt.
              </p>
            ) : null}
          </div>

          <input
            type="text"
            placeholder="Soort"
            value={species}
            onChange={(e) => setSpecies(e.target.value)}
            className="w-full rounded-lg border border-stera-line bg-white p-3"
          />

          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="w-full rounded-lg border border-stera-line bg-white p-3"
          >
            <option value="healthy">Healthy</option>
            <option value="needs_attention">Needs attention</option>
            <option value="maintenance_due">Maintenance due</option>
            <option value="replacement_needed">Replacement needed</option>
            <option value="dead">Dead</option>
          </select>

          <select
            value={potSizeCode}
            onChange={(e) => setPotSizeCode(e.target.value)}
            className="w-full rounded-lg border border-stera-line bg-white p-3"
          >
            <option value="">Potmaat (optioneel)</option>
            {ACTIVE_POT_SIZES.map((p) => (
              <option key={p.code} value={p.code}>
                {formatPotSize(p)}
              </option>
            ))}
          </select>

          <textarea
            placeholder="Notities"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full rounded-lg border border-stera-line bg-white p-3"
            rows={4}
          />

          <button
            type="submit"
            disabled={loading || !companyId || !locationId || !referenceCode}
            className="stera-cta stera-cta-primary disabled:opacity-50"
          >
            {loading ? 'Opslaan...' : 'Plant opslaan'}
          </button>

          {error && <p className="text-red-600">{error}</p>}
          </fieldset>
        </form>
      </div>
    </main>
  )
}
