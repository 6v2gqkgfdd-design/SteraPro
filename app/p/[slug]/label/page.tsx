import { notFound } from 'next/navigation'
import { labelDocument } from '@/lib/plant-label'

export const dynamic = 'force-dynamic'

export default async function LabelPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const html = await labelDocument(slug, `/p/${slug}`)
  if (!html) notFound()
  const inner = html.replace(/^[\s\S]*<body>/, '').replace(/<\/body>[\s\S]*$/, '')
  return <div dangerouslySetInnerHTML={{ __html: inner }} />
}
