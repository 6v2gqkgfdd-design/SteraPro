'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { fetchPlayfulNickname, pickLocalNickname } from '@/lib/nicknames'
import { prepareImage } from '@/lib/image'
import { POT_SIZES, formatPotSize } from '@/lib/pot-sizes'

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

export default function NewPlantPage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const supabase = createClient()

  const [locationName, setLocationName] = useState('')
  const [companyId, setCompanyId] = useState('')
  const [rooms, setRooms] = useState<Array<{ id: string; name: string | null }>>([])
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
    async function loadContext() {
      const [{ data: location, error: locationErr }, { data: roomList }] =
        await Promise.all([
          supabase
            .from('locations')
            .select('id, name, company_id')
            .eq('id', params.id)
            .single(),
          supabase
            .from('rooms')
            .select('id, name')
            .eq('location_id', params.id)
            .order('created_at', { ascending: true }),
        ])

      if (locationErr || !location) {
        setError('Kon locatie niet ophalen.')
        return
      }

      setLocationName(location.name)
      setCompanyId(location.company_id)
      setRooms(roomList ?? [])
      // Default naar de eerste ruimte zodat de gebruiker meteen kan opslaan.
      if (roomList && roomList.length > 0) {
        setRoomId(roomList[0].id)
      }
    }

    loadContext()
  }, [params.id, supabase])

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
    setLoading(true)
    setError('')

    try {
      if (!photoFile) {
        throw new Error(
          'Neem een foto van de plant. Dit is de referentiefoto die we voortaan tonen op de plantfiche.'
        )
      }

      let photoPath: string | null = null
      let photoUrl: string | null = null

      if (photoFile) {
        const fileName = `${params.id}/${referenceCode}-${Date.now()}.jpg`

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

      const baseValue =
        nickname.trim() || species.trim() || referenceCode
      const qrSlug = slugify(baseValue)

      const { data: inserted, error } = await supabase
        .from('plants')
        .insert([
          {
            company_id: companyId,
            location_id: params.id,
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

      if (error) {
        throw new Error(error.message)
      }

      // Care-tips fire-and-forget — niet wachten op de Claude-call zodat
      // de redirect onmiddellijk gebeurt. We gebruiken het id dat de
      // insert teruggaf (geen extra round-trip meer naar de DB).
      if (species.trim() && inserted?.id) {
        fetch('/api/plants/care-tips', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ plantId: inserted.id }),
        }).catch(() => {})
      }

      router.push(`/locations/${params.id}`)
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
        <div>
          <p className="stera-eyebrow mb-2">Plant</p>
          <h1 className="stera-display text-3xl sm:text-4xl">Nieuwe plant</h1>
          {locationName && (
            <p className="mt-2 text-sm text-stera-ink-soft">
              Locatie: {locationName}
            </p>
          )}
        </div>

        <form onSubmit={handleSubmit} className="stera-card space-y-4">
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
                  ? 'Geen ruimtes — voeg er eerst een toe'
                  : 'Kies een ruimte'}
              </option>
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name || 'Ruimte'}
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
                onChange={(e) => setNickname(e.target.value)}
                className="flex-1 rounded-lg border border-stera-line bg-white p-3"
              />
              <button
                type="button"
                onClick={regenerateNickname}
                disabled={nicknameLoading}
                className="stera-cta stera-cta-ghost shrink-0"
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
            {POT_SIZES.map((p) => (
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
            disabled={loading || !companyId || !referenceCode}
            className="stera-cta stera-cta-primary disabled:opacity-50"
          >
            {loading ? 'Opslaan...' : 'Plant opslaan'}
          </button>

          {error && <p className="text-red-600">{error}</p>}
        </form>
      </div>
    </main>
  )
}
