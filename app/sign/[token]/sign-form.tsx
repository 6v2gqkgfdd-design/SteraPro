'use client'

import { useEffect, useRef, useState } from 'react'
import { signWorkOrder } from './actions'

export default function SignForm({ token }: { token: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const drawing = useRef(false)
  const lastPoint = useRef<{ x: number; y: number } | null>(null)
  const hasInk = useRef(false)

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  // Setup canvas: schaal naar device pixel ratio voor scherp tekenen,
  // wit als achtergrond, dunne donkergroene lijn.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    canvas.width = Math.round(rect.width * dpr)
    canvas.height = Math.round(rect.height * dpr)
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.scale(dpr, dpr)
    ctx.fillStyle = '#FFFFFF'
    ctx.fillRect(0, 0, rect.width, rect.height)
    ctx.lineWidth = 2.2
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    ctx.strokeStyle = '#1c2924'
  }, [])

  function pointerPos(ev: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    return {
      x: ev.clientX - rect.left,
      y: ev.clientY - rect.top,
    }
  }

  function onPointerDown(ev: React.PointerEvent<HTMLCanvasElement>) {
    ev.preventDefault()
    canvasRef.current?.setPointerCapture(ev.pointerId)
    drawing.current = true
    lastPoint.current = pointerPos(ev)
  }

  function onPointerMove(ev: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx || !lastPoint.current) return
    const next = pointerPos(ev)
    ctx.beginPath()
    ctx.moveTo(lastPoint.current.x, lastPoint.current.y)
    ctx.lineTo(next.x, next.y)
    ctx.stroke()
    lastPoint.current = next
    hasInk.current = true
  }

  function onPointerUp() {
    drawing.current = false
    lastPoint.current = null
  }

  function clearSignature() {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const rect = canvas.getBoundingClientRect()
    ctx.fillStyle = '#FFFFFF'
    ctx.fillRect(0, 0, rect.width, rect.height)
    hasInk.current = false
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (!name.trim()) {
      setError('Vul je naam in.')
      return
    }
    if (!hasInk.current) {
      setError('Plaats eerst je handtekening in het kader hierboven.')
      return
    }

    const canvas = canvasRef.current
    if (!canvas) return

    // Naar PNG → base64 zonder data:URL prefix.
    const dataUrl = canvas.toDataURL('image/png')
    const comma = dataUrl.indexOf(',')
    const signature = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl

    setSubmitting(true)
    const res = await signWorkOrder({
      token,
      name,
      email,
      signature,
    })
    setSubmitting(false)

    if (!res.ok) {
      setError(res.error)
      return
    }
    setSuccess(true)
  }

  if (success) {
    return (
      <div className="rounded-xl border border-stera-green/40 bg-stera-green/5 p-6 text-stera-ink">
        <p className="stera-eyebrow text-stera-green mb-2">Bedankt</p>
        <h2 className="text-xl font-semibold">
          Werkbon goedgekeurd
        </h2>
        <p className="mt-2 text-sm text-stera-ink-soft">
          Je handtekening is geregistreerd. Stera Pro ontvangt automatisch een
          melding en stelt op basis hiervan de factuur op.
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <p className="stera-eyebrow text-stera-green mb-2">Handtekening</p>
        <p className="mb-3 text-xs text-stera-ink-soft">
          Teken hieronder met je vinger of muis. Klik op &ldquo;Wissen&rdquo;
          als je opnieuw wil beginnen.
        </p>
        <div
          className="rounded-xl border border-stera-line bg-white"
          style={{ touchAction: 'none' }}
        >
          <canvas
            ref={canvasRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerUp}
            className="block h-40 w-full sm:h-48"
          />
        </div>
        <button
          type="button"
          onClick={clearSignature}
          className="mt-2 text-sm text-stera-green underline-offset-4 hover:underline"
        >
          Wissen
        </button>
      </div>

      <div className="space-y-2">
        <label htmlFor="signer_name" className="block text-sm font-medium">
          Volledige naam
        </label>
        <input
          id="signer_name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          placeholder="Voor- en achternaam"
          className="w-full rounded-lg border border-stera-line bg-white p-3 text-base"
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="signer_email" className="block text-sm font-medium">
          E-mail (optioneel)
        </label>
        <input
          id="signer_email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="zodat Stera Pro je een kopie kan sturen"
          className="w-full rounded-lg border border-stera-line bg-white p-3 text-base"
        />
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <button
        type="submit"
        disabled={submitting}
        className="stera-cta stera-cta-primary w-full sm:w-auto disabled:opacity-50"
      >
        {submitting
          ? 'Versturen...'
          : 'Werkbon ondertekenen en versturen →'}
      </button>
    </form>
  )
}
