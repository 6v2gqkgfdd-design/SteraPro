import { NextResponse } from 'next/server'

/**
 * Genereert één speelse Nederlandse bijnaam voor een kamerplant.
 * Werkt het best als de soort al bekend is — die wordt mee in de
 * prompt gestopt zodat de naam erbij past (bv. "Bertha de Banaanplant"
 * voor een Musa).
 *
 * Body:
 *   { species?: string, avoid?: string[] }
 * Output:
 *   { nickname: string }
 */

const MODEL = 'claude-haiku-4-5-20251001'

const SYSTEM_PROMPT = [
  'Je verzint speelse Nederlandse bijnamen voor kamerplanten.',
  'Eén bijnaam per opdracht. Maximaal 3 woorden lang.',
  'Stijl: warm, charmant, lichte knipoog. Vaak een Vlaamse of',
  'Nederlandse voornaam gevolgd door een plant-thematisch woord',
  'dat naar de soort verwijst, eventueel met een lidwoord ("de", "het").',
  'Voorbeelden: "Bertha de Banaanplant", "Sieger de Yucca",',
  '"Madame Klimop", "Roger Rubber", "Stien de Varen".',
  'Vermijd anglicismen of clichés zoals "Lady Monstera", "Captain Leaf".',
  'Antwoord met enkel de naam. Geen uitleg, geen aanhalingstekens, geen punt op het einde.',
].join(' ')

export async function POST(req: Request) {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        { error: 'ANTHROPIC_API_KEY ontbreekt.' },
        { status: 500 }
      )
    }

    const body = await req.json().catch(() => ({}))
    const species: string =
      typeof body?.species === 'string' ? body.species.trim().slice(0, 100) : ''
    const avoidRaw = Array.isArray(body?.avoid) ? body.avoid : []
    const avoid: string[] = avoidRaw
      .filter((v: unknown) => typeof v === 'string')
      .map((v: string) => v.trim())
      .filter(Boolean)
      .slice(0, 30)

    const userPrompt = [
      species
        ? `Verzin één bijnaam voor een ${species}.`
        : 'Verzin één bijnaam voor een kamerplant. De soort is niet bekend.',
      avoid.length
        ? `Vermijd deze bestaande bijnamen: ${avoid.join(', ')}.`
        : '',
      'Antwoord met enkel de naam.',
    ]
      .filter(Boolean)
      .join(' ')

    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 5000)

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
          max_tokens: 60,
          temperature: 1.0,
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: userPrompt }],
        }),
        signal: ctrl.signal,
      }
    ).finally(() => clearTimeout(timer))

    if (!anthropicResponse.ok) {
      const errorBody = await anthropicResponse.text().catch(() => '')
      console.error(
        'Anthropic nickname error',
        anthropicResponse.status,
        errorBody
      )
      return NextResponse.json(
        { error: 'AI-bijnaam mislukt.' },
        { status: anthropicResponse.status }
      )
    }

    const data = await anthropicResponse.json()
    const text = Array.isArray(data?.content)
      ? (data.content.find((c: any) => c?.type === 'text')?.text ?? '')
      : ''

    let nickname = String(text).trim()
    // Verwijder aanhalingstekens of punten die het model er soms toch
    // bij plakt.
    nickname = nickname.replace(/^["'`]+|["'`]+$/g, '').replace(/\.+$/, '').trim()
    // Als het model toch een mini-uitleg gaf, neem enkel de eerste regel
    nickname = nickname.split(/\r?\n/)[0].trim()
    // Limiet op lengte
    if (nickname.length > 60) nickname = nickname.slice(0, 60).trim()

    if (!nickname) {
      return NextResponse.json(
        { error: 'AI gaf geen bruikbare bijnaam terug.' },
        { status: 500 }
      )
    }

    return NextResponse.json({ nickname })
  } catch (err) {
    console.error('AI nickname route error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Onbekende fout.' },
      { status: 500 }
    )
  }
}
