import OpenAI from 'openai'
import { NextResponse } from 'next/server'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const imageUrl = body?.imageUrl

    if (!imageUrl || typeof imageUrl !== 'string') {
      return NextResponse.json(
        { error: 'Geen afbeeldings-URL ontvangen.' },
        { status: 400 }
      )
    }

    const response = await openai.responses.create({
      model: 'gpt-4.1-mini',
      input: [
        {
          role: 'system',
          content: [
            {
              type: 'input_text',
              text: 'Je herkent kamerplanten. Geef een kort JSON-antwoord met suggested_species, confidence en is_uncertain. Gebruik Latijnse of gangbare plantnaam. Als je niet zeker bent, zet is_uncertain op true en suggested_species op lege string.',
            },
          ],
        },
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: 'Herken deze plant op basis van de foto.',
            },
            {
              type: 'input_image',
              image_url: imageUrl,
              detail: 'auto',
            },
          ],
        },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'plant_identification',
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              suggested_species: { type: 'string' },
              confidence: { type: 'number' },
              is_uncertain: { type: 'boolean' },
            },
            required: ['suggested_species', 'confidence', 'is_uncertain'],
          },
        },
      },
    })

    const raw = response.output_text

    if (!raw) {
      console.error('OpenAI response without output_text:', response)
      return NextResponse.json(
        { error: 'OpenAI gaf geen tekstoutput terug.' },
        { status: 500 }
      )
    }

    const parsed = JSON.parse(raw)

    return NextResponse.json(parsed)
  } catch (error: any) {
    console.error('AI route error:', error)

    const quotaExceeded =
      error?.code === 'insufficient_quota' ||
      error?.error?.code === 'insufficient_quota' ||
      error?.type === 'insufficient_quota' ||
      error?.error?.type === 'insufficient_quota'

    return NextResponse.json(
      {
        error: quotaExceeded
          ? 'AI-herkenning is tijdelijk niet beschikbaar: OpenAI API-credits zijn opgebruikt of billing staat niet correct ingesteld.'
          : error?.message ||
            error?.error?.message ||
            'AI-herkenning mislukt.',
      },
      { status: error?.status || 500 }
    )
  }
}
