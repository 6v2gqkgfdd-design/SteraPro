/** Klanttaal op het meldformulier, opgeslagen als de bestaande enums. */
export const REPORT_CHOICES = [
  { value: 'leaves', label: 'Gele of bruine bladeren' },
  { value: 'limp', label: 'Hangt slap' },
  { value: 'damaged', label: 'Beschadigd' },
  { value: 'pest', label: 'Beestjes' },
  { value: 'place', label: 'Pot of plaats' },
  { value: 'other', label: 'Iets anders' },
] as const

export type CustomerIssue = (typeof REPORT_CHOICES)[number]['value']

type DbIssue = 'replace' | 'sick' | 'damaged' | 'pest' | 'other'

const MAP: Record<string, { db: DbIssue; label: string }> = {
  leaves: { db: 'sick', label: 'Gele of bruine bladeren' },
  limp: { db: 'sick', label: 'Hangt slap' },
  damaged: { db: 'damaged', label: 'Beschadigd' },
  pest: { db: 'pest', label: 'Beestjes' },
  place: { db: 'other', label: 'Pot of plaats' },
  other: { db: 'other', label: 'Iets anders' },
  sick: { db: 'sick', label: 'Gele of bruine bladeren' },
  replace: { db: 'replace', label: 'Vervangen nodig' },
}

export function resolveIssue(value: string): { db: DbIssue; label: string } | null {
  return MAP[value] || null
}

export function issueLabel(value: string): string {
  return MAP[value]?.label || 'Melding'
}
