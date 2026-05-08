'use client'

import { useState } from 'react'

export default function CopyLinkButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback voor oudere browsers: prompt om te kopiëren
      window.prompt('Kopieer deze link:', url)
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="stera-cta stera-cta-secondary shrink-0"
    >
      {copied ? 'Gekopieerd!' : 'Kopiëer link'}
    </button>
  )
}
