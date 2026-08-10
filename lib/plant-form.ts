/**
 * Plantvorm-filters (hangplant, toef, stam, …).
 * Gebaseerd op Nieuwkoop item_variety_nl + tags PlantShape / BasicShapeTrunk / ArtificialShape.
 */

export type PlantFormId =
  | 'hang'
  | 'toef'
  | 'bush'
  | 'stam'
  | 'bol'
  | 'piramide'
  | 'zuil'
  | 'bonsai'
  | 'vertakt'
  | 'klim'

export const PLANT_FORM_OPTIONS: { id: PlantFormId | ''; label: string }[] = [
  { id: '', label: 'Vorm: alles' },
  { id: 'hang', label: 'Hangplanten' },
  { id: 'toef', label: 'Toef' },
  { id: 'bush', label: 'Bush / struik' },
  { id: 'stam', label: 'Op stam' },
  { id: 'vertakt', label: 'Vertakt' },
  { id: 'bol', label: 'Bolvorm' },
  { id: 'piramide', label: 'Piramide' },
  { id: 'zuil', label: 'Zuil' },
  { id: 'bonsai', label: 'Bonsai' },
  { id: 'klim', label: 'Klimplant' },
]

/** Labels voor detail/lijst (meerdere vormen mogelijk). */
export function plantFormLabels(row: {
  item_variety_nl?: string | null
  variety?: string | null
  description?: string | null
  tags?: unknown
}): string[] {
  const ids: PlantFormId[] = [
    'hang',
    'toef',
    'bush',
    'stam',
    'vertakt',
    'bol',
    'piramide',
    'zuil',
    'bonsai',
    'klim',
  ]
  const labels: string[] = []
  for (const id of ids) {
    if (matchesPlantForm(row, id)) {
      const opt = PLANT_FORM_OPTIONS.find((o) => o.id === id)
      if (opt?.id) labels.push(opt.label.replace(/^Vorm: /, ''))
    }
  }
  return labels
}

function tagShapeText(tags: unknown): string {
  if (!Array.isArray(tags)) return ''
  const parts: string[] = []
  for (const t of tags as Array<{
    Code?: string
    Values?: Array<{ Description_NL?: string | null; Description_EN?: string | null }>
  }>) {
    const code = (t?.Code || '').toLowerCase()
    if (
      code !== 'plantshape' &&
      code !== 'basicshapetrunk' &&
      code !== 'artificialshape'
    ) {
      continue
    }
    for (const v of t.Values ?? []) {
      parts.push(`${code}:${(v.Description_NL || '').toLowerCase()}`)
      parts.push(`${code}:${(v.Description_EN || '').toLowerCase()}`)
    }
  }
  return parts.join(' | ')
}

/**
 * Zelfde semantiek als SQL nk_matches_plant_form (voor client-side badges e.d.).
 */
export function matchesPlantForm(
  row: {
    item_variety_nl?: string | null
    variety?: string | null
    description?: string | null
    tags?: unknown
  },
  form: PlantFormId | string
): boolean {
  if (!form) return true
  const variety = (
    row.item_variety_nl ||
    row.variety ||
    ''
  ).toLowerCase()
  const desc = (row.description || '').toLowerCase()
  const shapes = tagShapeText(row.tags)

  // Hangpotten / bakken uitsluiten bij hang-filter
  const isHangPlanter =
    /hanging (basket|bowl|globe)|balkonhanger|flowerpot hanger|hanging pot/i.test(
      variety
    )

  switch (form) {
    case 'hang':
      if (isHangPlanter) return false
      return (
        /\bhangers?\b|\bhangplant\b|\bhanging(\s+bush)?\b|\bampel|\bhangend\b/.test(
          variety
        ) ||
        /\bhangplant\b|\bhanger\b|\bhanging\s+plant\b|\bampelplant\b/.test(desc) ||
        /plantshape:hang\b|artificialshape:hang/.test(shapes)
      )
    case 'toef':
      return /\btoef\b/.test(variety) || /plantshape:toef\b/.test(shapes)
    case 'bush':
      return (
        /\bbush\b|\bstruik/.test(variety) ||
        /plantshape:bush|artificialshape:bush/.test(shapes)
      )
    case 'stam':
      return (
        /(^|\s)(op\s+)?stam(\s|$)|multistam|gevlochten|2-stam|multi\s*stam/.test(
          variety
        ) || /basicshapetrunk:(recht|multistam|gevlochten|spiraal)\b/.test(shapes)
      )
    case 'vertakt':
      return (
        /\bvertakt\b/.test(variety) ||
        /basicshapetrunk:vertakt|plantshape:bush vertakt|artificialshape:vertakt/.test(
          shapes
        )
      )
    case 'bol':
      return (
        (/(^|\s)bol(vormig)?(\s|$)/.test(variety) &&
          !/pot bol|vaas bol|bolmos|bola /.test(variety)) ||
        /plantshape:bol\b|artificialshape:bol/.test(shapes)
      )
    case 'piramide':
      return /\bpiramide\b/.test(variety) || /plantshape:piramide\b/.test(shapes)
    case 'zuil':
      return (
        /\bzuil\b|draadzuil|zuilvorm/.test(variety) || /plantshape:zuil\b/.test(shapes)
      )
    case 'bonsai':
      return /\bbonsai\b/.test(variety) || /plantshape:bonsai\b/.test(shapes)
    case 'klim':
      return /\bklim\b|klimplant|climbing/.test(variety + ' ' + desc)
    default:
      return true
  }
}
