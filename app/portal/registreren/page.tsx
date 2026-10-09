import RegisterForm from './register-form'

export const dynamic = 'force-dynamic'

function cleanEmail(raw: string | undefined): string {
  if (!raw) return ''
  const value = raw.trim().slice(0, 200)
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? value : ''
}

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>
}) {
  const params = await searchParams
  const email = cleanEmail(typeof params.email === 'string' ? params.email : undefined)
  return <RegisterForm initialEmail={email} />
}
