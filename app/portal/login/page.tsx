import PortalLoginForm from './login-form'

export const dynamic = 'force-dynamic'

function cleanEmail(raw: string | undefined): string {
  if (!raw) return ''
  const value = raw.trim().slice(0, 200)
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? value : ''
}

export default async function PortalLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; notice?: string }>
}) {
  const params = await searchParams
  const email = cleanEmail(typeof params.email === 'string' ? params.email : undefined)
  const notice = params.notice === 'pending' ? 'pending' : null
  return <PortalLoginForm initialEmail={email} notice={notice} />
}
