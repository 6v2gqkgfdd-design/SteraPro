/**
 * Productmedia: Nieuwkoop-origineel vs Stera-studio.
 *
 * Storage-bucket: nieuwkoop-images
 *  - origineel:  {itemcode}.jpg   (lazy cache via /api/nieuwkoop/image/…)
 *  - studio:     studio/{itemcode}.jpg|.png  (via enrichment.studio_image_path)
 *
 * size=thumb → klein (~320px) voor lijsten
 * size=full  → volledige resolutie (lightbox / detail)
 *
 * Cache-bust: geef altijd `v` mee (photosetGeneratedAt of timestamp) na regeneratie,
 * anders toont de browser de oude JPEG (zelfde pad, zelfde URL).
 */

export const MEDIA_BUCKET = 'nieuwkoop-images'

export type MediaSize = 'thumb' | 'full'

/** Normaliseer versie voor querystring (ISO-datum → epoch ms, of ruwe string/number). */
export function mediaVersion(
  v?: string | number | null
): string | undefined {
  if (v == null || v === '') return undefined
  if (typeof v === 'number' && Number.isFinite(v)) return String(Math.trunc(v))
  const s = String(v)
  const t = Date.parse(s)
  if (Number.isFinite(t)) return String(t)
  return encodeURIComponent(s)
}

function withVersion(url: string, v?: string | number | null): string {
  const ver = mediaVersion(v)
  if (!ver) return url
  return `${url}${url.includes('?') ? '&' : '?'}v=${ver}`
}

export function originalImageApiUrl(
  itemcode: string,
  size: MediaSize = 'full',
  version?: string | number | null
): string {
  const q = size === 'thumb' ? '?size=thumb' : ''
  return withVersion(
    `/api/nieuwkoop/image/${encodeURIComponent(itemcode)}${q}`,
    version
  )
}

/** Studio of fallback origineel — voor lijst-thumbnails (altijd klein). */
export function catalogThumbUrl(
  itemcode: string,
  hasStudioImage?: boolean,
  version?: string | number | null
): string {
  if (hasStudioImage) {
    return productMediaUrl(itemcode, 'studio', 'thumb', version)
  }
  return originalImageApiUrl(itemcode, 'thumb', version)
}

/** Volledige studiofoto (lightbox / hoofdafbeelding). */
export function studioImageApiUrl(
  itemcode: string,
  size: MediaSize = 'full',
  version?: string | number | null
): string {
  return productMediaUrl(itemcode, 'studio', size, version)
}

export function productMediaUrl(
  itemcode: string,
  variant: 'studio' | 'detail' | 'maat' | 'original',
  size: MediaSize = 'full',
  version?: string | number | null
): string {
  if (variant === 'original') return originalImageApiUrl(itemcode, size, version)
  return withVersion(
    `/api/product-media/${encodeURIComponent(itemcode)}?variant=${variant}&size=${size}`,
    version
  )
}

/** Default pad bij upload (jpg). */
export function defaultStudioPath(itemcode: string, ext = 'jpg'): string {
  const safe = itemcode.replace(/[^A-Za-z0-9_-]/g, '')
  return `studio/${safe}.${ext.replace(/^\./, '')}`
}
