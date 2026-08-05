/**
 * Productmedia: Nieuwkoop-origineel vs Stera-studio.
 *
 * Storage-bucket: nieuwkoop-images
 *  - origineel:  {itemcode}.jpg   (lazy cache via /api/nieuwkoop/image/…)
 *  - studio:     studio/{itemcode}.jpg|.png  (via enrichment.studio_image_path)
 */

export const MEDIA_BUCKET = 'nieuwkoop-images'

export function originalImageApiUrl(itemcode: string): string {
  return `/api/nieuwkoop/image/${encodeURIComponent(itemcode)}`
}

/** Studio of fallback origineel — voor lijst-thumbnails. */
export function catalogThumbUrl(itemcode: string, hasStudioImage?: boolean): string {
  if (hasStudioImage) {
    return `/api/product-media/${encodeURIComponent(itemcode)}?variant=studio`
  }
  return originalImageApiUrl(itemcode)
}

export function studioImageApiUrl(itemcode: string): string {
  return `/api/product-media/${encodeURIComponent(itemcode)}?variant=studio`
}

/** Default pad bij upload (jpg). */
export function defaultStudioPath(itemcode: string, ext = 'jpg'): string {
  const safe = itemcode.replace(/[^A-Za-z0-9_-]/g, '')
  return `studio/${safe}.${ext.replace(/^\./, '')}`
}
