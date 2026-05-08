import { NextResponse } from 'next/server'

/**
 * Plant species identification via Claude Haiku 4.5 (vision).
 * We call the Anthropic Messages API directly with fetch, so we don't
 * need an extra SDK dependency. The model is asked to reply with a
 * compact JSON object containing suggested_species, confidence and
 * is_uncertain.
 */

const MODEL = 'claude-haiku-4-5-20251001'

const SYSTEM_PROMPT = [
  'Je herkent kamerplanten op basis van foto’s.',
  'Antwoord ALTIJD met enkel één geldig JSON-object — geen extra tekst,',
  'geen uitleg, geen markdown of code-fences. Het JSON-object heeft',
  'precies deze velden:',
  '  "suggested_species": string  // Latijnse of gangbare plantnaam, leeg als onzeker',
  '  "confidence":        number  // van 0 tot 1',
  '  "is_uncertain":      boolean',
  'Als je niet zeker bent: zet is_uncertain op true en suggested_species op een lege string.',
].join(' ')

function extractJsonText(content: unknown): string | null {
  if (!Array.isArray(content)) return null
  for (const part of content) {
    if (
      part &&
      typeof part === 'object' &&
      (part as { type?: string }).type === 'text' &&
      typeof (part as { text?: unknown }).text === 'string'
    ) {
      return (part as { text: string }).text
    }
  }
  return null
}

function stripCodeFences(value: string): string {
  const trimmed = value.trim()
  if (trimmed.startsWith('```')) {
    return trimmed
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim()
  }
  return trimmed
}

export async function POST(req: Request) {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        {
          error:
            'ANTHROPIC_API_KEY ontbreekt in de server-omgeving. Voeg toe aan Vercel.',
        },
        { status: 500 }
      )
    }

    const body = await req.json()
    const imageUrl: string | undefined =
      typeof body?.imageUrl === 'string' ? body.imageUrl : undefined
    const imageBase64Data: string | undefined =
      typeof body?.imageBase64 === 'string'
        ? body.imageBase64
        : typeof body?.imageBase64?.data === 'string'
          ? body.imageBase64.data
          : undefined
    const imageBase64MediaType: string =
      typeof body?.imageBase64?.media_type === 'string'
        ? body.imageBase64.media_type
        : 'image/jpeg'

    if (!imageUrl && !imageBase64Data) {
      return NextResponse.json(
        {
          error:
            'Geen afbeelding ontvangen — stuur ofwel `imageUrl` of `imageBase64`.',
        },
        { status: 400 }
      )
    }

    // Voorkeur: base64 (geen afhankelijkheid van publieke bucket-toegang)
    const imageSource = imageBase64Data
      ? {
          type: 'base64' as const,
          media_type: imageBase64MediaType,
          data: imageBase64Data,
        }
      : { type: 'url' as const, url: imageUrl as string }

    const anthropicResponse = await fetch(
      'https://api.anthropic.com/v1/messages',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 256,
          system: SYSTEM_PROMPT,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'image',
                  source: imageSource,
                },
                {
                  type: 'text',
                  text: 'Herken deze plant. Antwoord enkel met het JSON-object zoals beschreven.',
                },
              ],
            },
          ],
        }),
      }
    )

    if (!anthropicResponse.ok) {
      const errorBody = await anthropicResponse.text()
      console.error('Anthropic vision error:', anthropicResponse.status, errorBody)
      // Snelle short-message extractie zodat de ontwikkelaar de
      // werkelijke oorzaak ziet i.p.v. enkel een generieke melding.
      let detail = ''
      try {
        const parsed = JSON.parse(errorBody)
        detail = parsed?.error?.message || ''
      } catch {
        // negeren — body was geen JSON
      }
      return NextResponse.json(
        {
          error:
            anthropicResponse.status === 401
              ? 'AI-herkenning niet geautoriseerd: controleer ANTHROPIC_API_KEY.'
              : detail
                ? `AI-herkenning mislukt: ${detail}`
                : 'AI-herkenning mislukt. Probeer opnieuw of vul de soort handmatig in.',
        },
        { status: anthropicResponse.status }
      )
    }

    const data = await anthropicResponse.json()
    const rawText = extractJsonText(data?.content)

    if (!rawText) {
      console.error('Anthropic response without text content:', data)
      return NextResponse.json(
        { error: 'AI gaf geen tekstoutput terug.' },
        { status: 500 }
      )
    }

    let parsed: {
      suggested_species?: unknown
      confidence?: unknown
      is_uncertain?: unknown
    }

    try {
      parsed = JSON.parse(stripCodeFences(rawText))
    } catch (parseErr) {
      console.error('Anthropic returned non-JSON:', rawText, parseErr)
      return NextResponse.json(
        { error: 'AI-antwoord kon niet gelezen worden.' },
        { status: 500 }
      )
    }

    const suggestedSpecies =
      typeof parsed.suggested_species === 'string'
        ? parsed.suggested_species.trim()
        : ''
    const confidence =
      typeof parsed.confidence === 'number'
        ? Math.max(0, Math.min(1, parsed.confidence))
        : null
    const isUncertain = Boolean(parsed.is_uncertain)

    return NextResponse.json({
      suggested_species: suggestedSpecies,
      confidence,
      is_uncertain: isUncertain,
    })
  } catch (error: unknown) {
    console.error('AI route error:', error)
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'AI-herkenning mislukt.',
      },
      { status: 500 }
    )
  }
}
