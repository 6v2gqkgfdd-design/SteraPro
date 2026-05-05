'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

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

function generatePlayfulNickname() {
  const firstParts = [
    'Captain',
    'Mister',
    'Lady',
    'Sunny',
    'Tiny',
    'Jungle',
    'Green',
    'Happy',
    'Fancy',
    'Professor',
    'Sir',
    'Dancing',
  ]

  const secondParts = [
    'Leaf',
    'Sprout',
    'Fern',
    'Buddy',
    'Queen',
    'Prince',
    'Pearl',
    'Shadow',
    'Mango',
    'Coco',
    'Bamboo',
    'Monstera',
  ]

  const first =
    firstParts[Math.floor(Math.random() * firstParts.length)]
  const second =
    secondParts[Math.floor(Math.random() * secondParts.length)]

  return `${first} ${second}`
}

async function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  const objectUrl = URL.createObjectURL(file)

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()

      img.onload = () => resolve(img)
      img.onerror = () =>
        reject(
          new Error(
            'Deze afbeelding kon niet gelezen worden. Gebruik bij voorkeur een JPG of PNG foto.'
          )
        )

      img.src = objectUrl
    })

    return image
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

async function fileToJpeg(file: File): Promise<File> {
  if (file.type === 'image/jpeg') {
    return file
  }

  const image = await loadImageFromFile(file)

  const width = image.naturalWidth || image.width
  const height = image.naturalHeight || image.height

  if (!width || !height) {
    throw new Error('Afbeelding heeft geen geldige afmetingen.')
  }

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Canvas context niet beschikbaar.')
  }

  ctx.drawImage(image, 0, 0, width, height)

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, 'image/jpeg', 0.9)
  })

  if (!blob) {
    throw new Error('Kon afbeelding niet converteren naar JPEG.')
  }

  const baseName = file.name.replace(/\.[^.]+$/, '') || 'photo'
  return new File([blob], `${baseName}.jpg`, { type: 'image/jpeg' })
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
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState('')
  const [aiSuggestedSpecies, setAiSuggestedSpecies] = useState('')
  const [aiConfidence, setAiConfidence] = useState<number | null>(null)
  const [isIdentifying, setIsIdentifying] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setReferenceCode(generateReferenceCode())
    setNickname(generatePlayfulNickname())
  }, [])

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
      const jpegFile = await fileToJpeg(file)

      if (photoPreview) {
        URL.revokeObjectURL(photoPreview)
      }

      const previewUrl = URL.createObjectURL(jpegFile)
      setPhotoPreview(previewUrl)
      setPhotoFile(jpegFile)

      const tempFileName = `temp/${params.id}-${Date.now()}.jpg`

      const { error: uploadError } = await supabase.storage
        .from('plant-photos')
        .upload(tempFileName, jpegFile, {
          upsert: false,
          contentType: 'image/jpeg',
        })

      if (uploadError) {
        throw new Error(uploadError.message)
      }

      const { data: publicUrlData } = supabase.storage
        .from('plant-photos')
        .getPublicUrl(tempFileName)

      const imageUrl = publicUrlData?.publicUrl

      if (!imageUrl) {
        throw new Error('Kon geen publieke afbeeldings-URL ophalen.')
      }

      const response = await fetch('/api/plants/identify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          imageUrl,
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

      const { error } = await supabase.from('plants').insert([
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
        },
      ])

      if (error) {
        throw new Error(error.message)
      }

      // Genereer verzorgingstips in de achtergrond (fire-and-forget) als
      // we de soort kennen. We hebben hier geen plant-id terug omdat de
      // insert geen .select() heeft, maar de care-tips route kan ook later
      // door het openen van /plants/<id> getriggerd worden.
      if (species.trim()) {
        const { data: latest } = await supabase
          .from('plants')
          .select('id')
          .eq('reference_code', referenceCode)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (latest?.id) {
          fetch('/api/plants/care-tips', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ plantId: latest.id }),
          }).catch(() => {})
        }
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
            <label className="text-xs font-semibold uppercase tracking-wider text-stera-blue">
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
            <div className="rounded-lg bg-stera-blue/10 border border-stera-blue/30 p-3 text-sm">
              AI suggestie: <strong>{aiSuggestedSpecies}</strong>
              {typeof aiConfidence === 'number' && (
                <span> ({Math.round(aiConfidence * 100)}% zekerheid)</span>
              )}
            </div>
          )}

          <input
            type="text"
            placeholder="Bijnaam / plantnaam"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            className="w-full rounded-lg border border-stera-line bg-white p-3"
          />

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
