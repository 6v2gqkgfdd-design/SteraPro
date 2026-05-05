import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const MODEL = 'claude-haiku-4-5-20251001'

const SYSTEM_PROMPT = [
  'Je bent een ervaren plantenverzorger en helpt de Stera-app',
  'verzorgingstips genereren voor kamerplanten in een professionele setting.',
  'Antwoord altijd uitsluitend met één geldig JSON-object — geen markdown,',
  'geen code-fences, geen extra tekst. Het object heeft deze velden:',
  '  "summary":  string  // 1 zin in het Nederlands die de plant intro\'eert',
  '  "light":    string  // korte zin over lichtbehoefte',
  '  "water":    string  // korte zin over water geven',
  '  "humidity": string  // korte zin over luchtvochtigheid',
  '  "feeding":  string  // korte zin over voeding',
  '  "extra":    string  // optionele extra aandachtspunten of waarschuwingen',
  'Houd elk veld onder de 150 tekens en gebruik dagelijkse taal.',
].join(' ')

type CareTipsPayload = {
  summary?: string
  light?: string
  water?: string
  humidity?: string
  feeding?: string
  extra?: string
}

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

function formatCareTips(payload: CareTipsPayload): string {
  const lines: string[] = []
  if (payload.summary) lines.push(payload.summary.trim())
  const detail = (label: string, value?: string) =>
    value && value.trim() ? `${label}: ${value.trim()}` : null

  const details = [
    detail('Licht', payload.light),
    detail('Water', payload.water),
    detail('Vocht', payload.humidity),
    detail('Voeding', payload.feeding),
    detail('Extra', payload.extra),
  ].filter((line): line is string => Boolean(line))

  if (details.length > 0) {
    if (lines.length > 0) lines.push('')
    lines.push(...details)
  }

  return lines.join('\n')
}

export async function POST(req: Request) {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        { error: 'ANTHROPIC_API_KEY ontbreekt op de server.' },
        { status: 500 }
      )
    }

    const body = await req.json().catch(() => null)
    const plantId =
      body && typeof body.plantId === 'string' ? body.plantId : null
    const force = Boolean(body?.force)
    if (!plantId) {
      return NextResponse.json(
        { error: 'plantId ontbreekt.' },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json(
        { error: 'Niet ingelogd.' },
        { status: 401 }
      )
    }

    const { data: plant, error: plantError } = await supabase
      .from('plants')
      .select(
        'id, species, nickname, care_tips, care_tips_species, care_tips_updated_at'
      )
      .eq('id', plantId)
      .maybeSingle()

    if (plantError || !plant) {
      return NextResponse.json(
        { error: plantError?.message || 'Plant niet gevonden.' },
        { status: 404 }
      )
    }

    const species =
      typeof plant.species === 'string' ? plant.species.trim() : ''
    if (!species) {
      return NextResponse.json(
        {
          error:
            'Plant heeft nog geen soort. Vul eerst de soort in om verzorgingstips te genereren.',
        },
        { status: 400 }
      )
    }

    if (
      !force &&
      plant.care_tips &&
      plant.care_tips_species === species
    ) {
      return NextResponse.json({
        care_tips: plant.care_tips,
        cached: true,
      })
    }

    const userPrompt = [
      `Plantnaam: ${species}.`,
      plant.nickname ? `Bijnaam in de app: ${plant.nickname}.` : '',
      'Geef in JSON-vorm beknopte verzorgingstips.',
    ]
      .filter(Boolean)
      .join(' ')

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
          max_tokens: 512,
          system: SYSTEM_PROMPT,
          messages: [
            {
              role: 'user',
              content: [{ type: 'text', text: userPrompt }],
            },
          ],
        }),
      }
    )

    if (!anthropicResponse.ok) {
      const errorBody = await anthropicResponse.text()
      console.error(
        'Anthropic care-tips error:',
        anthropicResponse.status,
        errorBody
      )
      return NextResponse.json(
        { error: 'Verzorgingstips genereren mislukt.' },
        { status: anthropicResponse.status }
      )
    }

    const data = await anthropicResponse.json()
    const rawText = extractJsonText(data?.content)
    if (!rawText) {
      console.error('Anthropic care-tips response without text:', data)
      return NextResponse.json(
        { error: 'AI gaf geen tekstoutput terug.' },
        { status: 500 }
      )
    }

    let parsed: CareTipsPayload
    try {
      parsed = JSON.parse(stripCodeFences(rawText))
    } catch (parseErr) {
      console.error('Anthropic care-tips non-JSON:', rawText, parseErr)
      return NextResponse.json(
        { error: 'AI-antwoord kon niet gelezen worden.' },
        { status: 500 }
      )
    }

    const formatted = formatCareTips(parsed)
    if (!formatted.trim()) {
      return NextResponse.json(
        { error: 'AI gaf een leeg antwoord.' },
        { status: 500 }
      )
    }

    const { error: updateError } = await supabase
      .from('plants')
      .update({
        care_tips: formatted,
        care_tips_species: species,
        care_tips_updated_at: new Date().toISOString(),
      })
      .eq('id', plantId)

    if (updateError) {
      console.error('care-tips update error:', updateError)
      return NextResponse.json(
        { error: updateError.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      care_tips: formatted,
      cached: false,
    })
  } catch (error) {
    console.error('care-tips route error:', error)
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Verzorgingstips genereren mislukt.',
      },
      { status: 500 }
    )
  }
}
