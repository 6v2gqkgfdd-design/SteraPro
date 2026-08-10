import { redirect } from 'next/navigation'

/**
 * Facturatie-hub in de hoofdnavigatie.
 * De inhoud leeft op /work-orders (tabs per status).
 * Query `?tab=` blijft behouden bij redirect.
 */
export default async function FacturatiePage({
  searchParams,
}: {
  searchParams?: Promise<{ tab?: string }>
}) {
  const params = searchParams ? await searchParams : {}
  const tab = params?.tab?.trim()
  redirect(tab ? `/work-orders?tab=${encodeURIComponent(tab)}` : '/work-orders')
}
