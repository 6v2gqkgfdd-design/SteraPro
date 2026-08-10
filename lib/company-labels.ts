/** Gedeelde labels voor klant-subpagina's. */

export function plantStatusLabel(status: string | null | undefined): string {
  switch (status) {
    case 'healthy':
      return 'Gezond'
    case 'needs_attention':
      return 'Aandacht'
    case 'maintenance_due':
      return 'Onderhoud nodig'
    case 'replacement_needed':
      return 'Vervanging'
    case 'dead':
      return 'Dood'
    default:
      return status || 'Onbekend'
  }
}

export function plantStatusClass(status: string | null | undefined): string {
  switch (status) {
    case 'healthy':
      return 'bg-stera-green/10 text-stera-green border-stera-green/30'
    case 'needs_attention':
    case 'maintenance_due':
      return 'bg-amber-50 text-amber-900 border-amber-200'
    case 'replacement_needed':
    case 'dead':
      return 'bg-red-50 text-red-800 border-red-200'
    default:
      return 'bg-stera-cream-deep text-stera-ink-soft border-stera-line'
  }
}

export function visitStatusLabel(status: string): string {
  switch (status) {
    case 'scheduled':
      return 'Gepland'
    case 'in_progress':
      return 'Bezig'
    case 'paused':
      return 'Gepauzeerd'
    case 'completed':
      return 'Voltooid'
    case 'cancelled':
      return 'Geannuleerd'
    default:
      return status
  }
}

export function visitStatusClass(status: string): string {
  switch (status) {
    case 'scheduled':
      return 'bg-stera-green/10 text-stera-green border-stera-green/30'
    case 'in_progress':
      return 'bg-amber-100 text-amber-800 border-amber-200'
    case 'paused':
      return 'bg-purple-100 text-purple-800 border-purple-200'
    case 'completed':
      return 'bg-stera-green text-white border-stera-green'
    case 'cancelled':
      return 'bg-red-100 text-red-800 border-red-200'
    default:
      return 'bg-stera-cream-deep text-stera-ink-soft border-stera-line'
  }
}

export function woStatusLabel(status: string): string {
  switch (status) {
    case 'draft':
      return 'Te versturen'
    case 'sent':
      return 'Te tekenen'
    case 'signed':
      return 'Te factureren'
    case 'invoiced':
      return 'Gefactureerd'
    case 'cancelled':
      return 'Geannuleerd'
    case 'archived':
      return 'Gearchiveerd'
    default:
      return status
  }
}

export function woStatusClass(status: string): string {
  switch (status) {
    case 'draft':
    case 'signed':
      return 'bg-amber-50 text-amber-900 border-amber-200'
    case 'sent':
      return 'bg-blue-50 text-blue-900 border-blue-200'
    case 'invoiced':
      return 'bg-stera-green/10 text-stera-green border-stera-green/30'
    case 'cancelled':
      return 'bg-red-50 text-red-800 border-red-200'
    default:
      return 'bg-stera-cream-deep text-stera-ink-soft border-stera-line'
  }
}

export function deliveryStatusLabel(status: string): string {
  switch (status) {
    case 'unscheduled':
      return 'Nog in te plannen'
    case 'scheduled':
      return 'Gepland'
    case 'in_progress':
      return 'Bezig'
    case 'delivered':
      return 'Geleverd'
    case 'cancelled':
      return 'Geannuleerd'
    default:
      return status
  }
}

export function formatEurFromCents(cents: number | null | undefined, currency = 'EUR') {
  if (cents == null) return '—'
  return new Intl.NumberFormat('nl-BE', {
    style: 'currency',
    currency,
  }).format(cents / 100)
}

export function formatDayTime(iso: string | null | undefined) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('nl-BE', {
    timeZone: 'Europe/Brussels',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatDay(iso: string | null | undefined) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('nl-BE', {
    timeZone: 'Europe/Brussels',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}
