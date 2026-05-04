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

export default function MaintenanceNewPlantPage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const supabase = createClient()

  const visitId = params.id

  const [visitTitle, setVisitTitle] = useState('')
  const [locationId, setLocationId] = useState('')
  const [locationName, setLocationName] = useState('')
  const [companyId, setCompanyId] = useState('')

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
          )
        `)
        .eq('id', visitId)
        .single()

      if (error || !data) {
        setError('Kon onderhoudsbeurt niet ophalen.')
        return
      }

      setVisitTitle(data.title || '')
      setLocationId(data.location_id || '')
      setCompanyId(data.company_id || '')
      setLocationName(data.locations?.name || '')
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
      const jpegFile = await fileToJpeg(file)

      if (photoPreview) {
        URL.revokeObjectURL(photoPreview)
      }

      const previewUrl = URL.createObjectURL(jpegFile)
      setPhotoPreview(previewUrl)
      setPhotoFile(jpegFile)

      const tempFileName = `temp/${visitId}-${Date.now()}.jpg`

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
      if (!companyId || !locationId) {
        throw new Error('Locatie of bedrijf ontbreekt voor deze onderhoudsbeurt.')
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

      const baseValue =
        nickname.trim() || species.trim() || referenceCode
      const qrSlug = slugify(baseValue)

      const { data: insertedPlant, error: plantError } = await supabase
        .from('plants')
        .insert([
          {
            company_id: companyId,
            location_id: locationId,
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

      router.push(`/maintenance/${visitId}/plants/${insertedPlant.id}`)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Opslaan mislukt.')
      setLoading(false)
      return
    }
  }

  return (
    <main className="p-6">
      <div className="mx-auto max-w-xl">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="mb-2 text-2xl font-bold">Nieuwe plant</h1>
            {visitTitle && (
              <p className="text-sm text-gray-600">
                Onderhoud: {visitTitle}
              </p>
            )}
            {locationName && (
              <p className="text-sm text-gray-600">
                Locatie: {locationName}
              </p>
            )}
          </div>

          <div className="flex gap-3">
            <Link
              href={`/maintenance/${visitId}/plants`}
              className="rounded-lg border px-4 py-2 text-sm"
            >
              Terug
            </Link>

            <Link
              href="/dashboard"
              className="rounded-lg bg-black px-4 py-2 text-sm text-white"
            >
              Dashboard
            </Link>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border p-6">
          <div className="rounded-lg bg-gray-50 p-3 text-sm">
            Referentiecode: <strong>{referenceCode || 'Wordt gegenereerd...'}</strong>
          </div>

          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(e) => handlePhotoChange(e.target.files?.[0] || null)}
            className="w-full rounded-lg border p-3"
          />

          {photoPreview && (
            <img
              src={photoPreview}
              alt="Preview van plantfoto"
              className="rounded-lg border"
            />
          )}

          {isIdentifying && (
            <p className="text-sm text-gray-600">AI analyseert de plantfoto...</p>
          )}

          {aiSuggestedSpecies && (
            <div className="rounded-lg bg-green-50 p-3 text-sm">
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
            className="w-full rounded-lg border p-3"
          />

          <input
            type="text"
            placeholder="Soort"
            value={species}
            onChange={(e) => setSpecies(e.target.value)}
            className="w-full rounded-lg border p-3"
          />

          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="w-full rounded-lg border p-3"
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
            className="w-full rounded-lg border p-3"
            rows={4}
          />

          <button
            type="submit"
            disabled={loading || !companyId || !locationId || !referenceCode}
            className="rounded-lg bg-black px-4 py-3 text-white disabled:opacity-50"
          >
            {loading ? 'Opslaan...' : 'Plant opslaan'}
          </button>

          {error && <p className="text-red-600">{error}</p>}
        </form>
      </div>
    </main>
  )
}
