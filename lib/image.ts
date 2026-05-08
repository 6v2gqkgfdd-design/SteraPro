/**
 * Browser-side image preparation: lees een File, schaal naar een
 * redelijke max-dimensie, encodeer als JPEG, en lever zowel een
 * uploadbaar File-object als de base64-payload op.
 *
 * Doel: minder data over 4G (sneller saven), én een base64 die we
 * direct aan Anthropic vision kunnen sturen zonder tussenkomst van
 * een publieke upload-bucket.
 */

export type PreparedImage = {
  /** JPEG File die je naar Supabase Storage kan uploaden. */
  file: File
  /** Pure base64 (zonder data:URL prefix). */
  base64: string
  /** Altijd "image/jpeg" voor de geretourneerde file. */
  mediaType: 'image/jpeg'
}

const DEFAULT_MAX_DIMENSION = 1600
const DEFAULT_QUALITY = 0.85

async function loadImage(file: File): Promise<HTMLImageElement> {
  const objectUrl = URL.createObjectURL(file)
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () =>
        reject(
          new Error(
            'Deze afbeelding kon niet gelezen worden. Gebruik bij voorkeur JPG of PNG.'
          )
        )
      img.src = objectUrl
    })
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Conversie naar base64 mislukt.'))
    reader.onload = () => {
      const result = reader.result
      if (typeof result !== 'string') {
        reject(new Error('Onverwachte FileReader-output.'))
        return
      }
      // result is "data:image/jpeg;base64,XXXX" — strip de prefix
      const comma = result.indexOf(',')
      resolve(comma >= 0 ? result.slice(comma + 1) : result)
    }
    reader.readAsDataURL(blob)
  })
}

export async function prepareImage(
  source: File,
  opts: { maxDimension?: number; quality?: number } = {}
): Promise<PreparedImage> {
  const maxDim = opts.maxDimension ?? DEFAULT_MAX_DIMENSION
  const quality = opts.quality ?? DEFAULT_QUALITY

  const image = await loadImage(source)
  const sourceWidth = image.naturalWidth || image.width
  const sourceHeight = image.naturalHeight || image.height
  if (!sourceWidth || !sourceHeight) {
    throw new Error('Afbeelding heeft geen geldige afmetingen.')
  }

  // Bepaal targetdimensies — alleen verkleinen, nooit oprekken
  const longSide = Math.max(sourceWidth, sourceHeight)
  const scale = longSide > maxDim ? maxDim / longSide : 1
  const targetWidth = Math.round(sourceWidth * scale)
  const targetHeight = Math.round(sourceHeight * scale)

  const canvas = document.createElement('canvas')
  canvas.width = targetWidth
  canvas.height = targetHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas context niet beschikbaar.')
  ctx.drawImage(image, 0, 0, targetWidth, targetHeight)

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', quality)
  )
  if (!blob) throw new Error('Conversie naar JPEG mislukt.')

  const baseName = source.name.replace(/\.[^.]+$/, '') || 'photo'
  const file = new File([blob], `${baseName}.jpg`, { type: 'image/jpeg' })
  const base64 = await blobToBase64(blob)

  return { file, base64, mediaType: 'image/jpeg' }
}
