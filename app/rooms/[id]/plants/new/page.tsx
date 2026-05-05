'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
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
    'Captain', 'Mister', 'Lady', 'Sunny', 'Tiny', 'Jungle', 'Green',
    'Happy', 'Fancy', 'Professor', 'Sir', 'Dancing',
  ]
  const secondParts = [
    'Leaf', 'Sprout', 'Fern', 'Buddy', 'Queen', 'Prince', 'Pearl',
    'Shadow', 'Mango', 'Coco', 'Bamboo', 'Monstera',
  ]
  const first = firstParts[Math.floor(Math.random() * firstParts.length)]
  const second = secondParts[Math.floor(Math.random() * secondParts.length)]
  return `${first} ${second}`
}

async function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  const objectUrl = URL.createObjectURL(file)
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () =>
        reject(new Error('Deze afbeelding kon niet gelezen worden.'))
      img.src = objectUrl
    })
    return image
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
  if (!blob) throw new Error('Kon afbeelding niet converteren.')

  const baseName = file.name.replace(/\.[^.]+$/, '') || 'photo'
  return new File([blob], `${baseName}.jpg`, { type: 'image/jpeg' })
}

export default function NewPlantInRoomPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const supabase = createClient()

  const roomId = params?.id

  const [roomName, setRoomName] = useState('')
  const [locationId, setLocationId] = useState('')
  const [locationName, setLocationName] = useState('')
  const [companyId, setCompanyId] = useState('')
  const [contextLoading, setContextLoading] = useState(true)

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
    if (!roomId) return

    let cancelled = false

    async function loadContext() {
      const { data, error } = await supabase
        .from('rooms')
        .select(
          `
          id,
          name,
          location_id,
          locations (
            id,
            name,
            company_id
          )
          `
        )
        .eq('id', roomId)
        .maybeSingle()

      if (cancelled) return

      if (error || !data) {
        setError(error?.message || 'Ruimte niet gevonden.')
        setContextLoading(false)
        return
      }

      const loc = Array.isArray(data.locations)
        ? data.locations[0]
        : data.locations

      setRoomName(data.name ?? '')
      setLocationId(data.location_id ?? '')
      setLocationName(loc?.name ?? '')
      setCompanyId(loc?.company_id ?? '')
      setContextLoading(false)
    }

    loadContext()

    return () => {
      cancelled = true
    }
  }, [roomId, supabase])

  useEffect(() => {
    return () => {
      if (photoPreview) URL.revokeObjectURL(photoPreview)
    }
  }, [photoPreview])

  async function handlePhotoChange(file: File | null) {
    setAiSuggestedSpecies('')
    setAiConfidence(null)
    setError('')

    if (!file) {
      if (photoPreview) URL.revokeObjectURL(photoPreview)
      setPhotoFile(null)
      setPhotoPreview('')
      return
    }

    setIsIdentifying(true)

    try {
      const jpegFile = await fileToJpeg(file)
      if (photoPreview) URL.revokeObjectURL(photoPreview)
      setPhotoPreview(URL.createObjectURL(jpegFile))
      setPhotoFile(jpegFile)

      const tempFileName = `temp/${roomId}-${Date.now()}.jpg`
      const { error: uploadError } = await supabase.storage
        .from('plant-photos')
        .upload(tempFileName, jpegFile, {
          upsert: false,
          contentType: 'image/jpeg',
        })

      if (uploadError) throw new Error(uploadError.message)

      const { data: publicUrlData } = supabase.storage
        .from('plant-photos')
        .getPublicUrl(tempFileName)

      const imageUrl = publicUrlData?.publicUrl
      if (!imageUrl) throw new Error('Geen publieke URL.')

      const response = await fetch('/api/plants/identify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl }),
      })

      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'AI-herkenning mislukt.')

      setAiSuggestedSpecies(result.suggested_species || '')
      setAiConfidence(typeof result.confidence === 'number' ? result.confidence : null)
      if (result.suggested_species) setSpecies(result.suggested_species)
    } catch (err) {
      console.error(err)
      setError(err instanceof Error ? err.message : 'AI-herkenning mislukt.')
    } finally {
      setIsIdentifying(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!roomId || !locationId || !companyId) return

    setLoading(true)
    setError('')

    try {
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

        if (uploadError) throw new Error(uploadError.message)

        photoPath = fileName
        const { data: publicUrlData } = supabase.storage
          .from('plant-photos')
          .getPublicUrl(fileName)
        photoUrl = publicUrlData.publicUrl
      }

      const baseValue = nickname.trim() || species.trim() || referenceCode
      const qrSlug = slugify(baseValue)

      const { data: insertedPlant, error: plantError } = await supabase
        .from('plants')
        .insert([
          {
            company_id: companyId,
            location_id: locationId,
            room_id: roomId,
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
        .select('id')
        .single()

      if (plantError || !insertedPlant) {
        throw new Error(plantError?.message || 'Plant opslaan mislukt.')
      }

      router.push(`/plants/${insertedPlant.id}`)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Opslaan mislukt.')
      setLoading(false)
    }
  }

  return (
    <main className="bg-stera-cream p-6">
      <div className="mx-auto max-w-2xl space-y-6">
        <Link
          href={`/rooms/${roomId}`}
          className="text-sm text-stera-blue underline"
        >
          ← Terug naar ruimte
        </Link>

        <div>
          <p className="stera-eyebrow mb-2">Plant</p>
          <h1 className="stera-display text-3xl sm:text-4xl">Nieuwe plant</h1>
          {contextLoading ? (
            <p className="mt-2 text-sm text-stera-ink-soft">Context laden...</p>
          ) : (
            <p className="mt-2 text-sm text-stera-ink-soft">
              Locatie: {locationName} · Ruimte: {roomName}
            </p>
          )}
        </div>

        <form onSubmit={handleSubmit} className="stera-card space-y-4">
          <div className="rounded-lg bg-stera-cream-deep p-3 text-sm">
            Referentiecode:{' '}
            <strong>{referenceCode || 'Wordt gegenereerd...'}</strong>
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
              alt="Preview"
              className="rounded-lg border border-stera-line"
            />
          )}

          {isIdentifying && (
            <p className="text-sm text-stera-ink-soft">
              AI analyseert de plantfoto...
            </p>
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
            placeholder="Bijnaam"
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
            <option value="healthy">Gezond</option>
            <option value="needs_attention">Vraagt aandacht</option>
            <option value="maintenance_due">Onderhoud vereist</option>
            <option value="replacement_needed">Vervanging nodig</option>
            <option value="dead">Dood</option>
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
            disabled={loading || contextLoading || !companyId || !locationId || !roomId}
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
