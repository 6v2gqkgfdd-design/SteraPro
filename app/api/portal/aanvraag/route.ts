import { postAanvraag } from '@/lib/portal-post'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const form = await req.formData()
  return postAanvraag(form)
}
