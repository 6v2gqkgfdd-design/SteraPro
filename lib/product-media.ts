/**
 * Productmedia: Nieuwkoop-origineel vs Stera-studio.
 *
 * Storage-bucket: nieuwkoop-images
 *  - origineel:  {itemcode}.jpg   (lazy cache via /api/nieuwkoop/image/…)
 *  - studio:     studio/{itemcode}.jpg|.png  (via enrichment.studio_image_path)
 *
 * size=thumb → klein (~320px) voor lijsten
 * size=full  → volledige resolutie (lightbox / detail)
 */

export const MEDIA_BUCKET = 'nieuwkoop-images'

export type MediaSize = 'thumb' | 'full'

export function originalImageApiUrl(
  itemcode: string,
  size: MediaSize = 'full'
): string {
  const q = size === 'thumb' ? '?size=thumb' : ''
  return `/api/nieuwkoop/image/${encodeURIComponent(itemcode)}${q}`
}

/** Studio of fallback origineel — voor lijst-thumbnails (altijd klein). */
export function catalogThumbUrl(itemcode: string, hasStudioImage?: boolean): string {
  if (hasStudioImage) {
    return `/api/product-media/${encodeURIComponent(itemcode)}?variant=studio&size=thumb`
  }
  return originalImageApiUrl(itemcode, 'thumb')
}

/** Volledige studiofoto (lightbox / hoofdafbeelding). */
export function studioImageApiUrl(
  itemcode: string,
  size: MediaSize = 'full'
): string {
  return `/api/product-media/${encodeURIComponent(itemcode)}?variant=studio&size=${size}`
}

export function productMediaUrl(
  itemcode: string,
  variant: 'studio' | 'detail' | 'maat' | 'original',
  size: MediaSize = 'full'
): string {
  if (variant === 'original') return originalImageApiUrl(itemcode, size)
  return `/api/product-media/${encodeURIComponent(itemcode)}?variant=${variant}&size=${size}`
}

/** Default pad bij upload (jpg). */
export function defaultStudioPath(itemcode: string, ext = 'jpg'): string {
  const safe = itemcode.replace(/[^A-Za-z0-9_-]/g, '')
  return `studio/${safe}.${ext.replace(/^\./, '')}`
}
