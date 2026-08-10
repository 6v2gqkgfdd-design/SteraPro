import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { saveImportUrl, rotateFeedToken, runCalendarSyncNow } from './actions'
import SyncNowButton from './sync-now-button'

export const metadata = { title: 'Agenda-koppeling' }

export default async function AgendaSettingsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: isStaff } = await supabase.rpc('is_staff')
  if (!isStaff) redirect('/dashboard')

  // Zorg dat de singleton-rij bestaat
  await supabase.from('calendar_sync_settings').upsert({ id: 1 }, { onConflict: 'id' })

  const { data: settings } = await supabase
    .from('calendar_sync_settings')
    .select(
      'import_ics_url, feed_token, last_sync_at, last_sync_ok, last_sync_message'
    )
    .eq('id', 1)
    .maybeSingle()

  const siteUrl = (
    process.env.NEXT_PUBLIC_SITE_URL ||
    'https://app.sterapro.be'
  ).replace(/\/$/, '')

  const feedToken = settings?.feed_token || ''
  const feedUrl = feedToken
    ? `${siteUrl}/api/calendar/feed?token=${feedToken}`
    : ''

  const lastSyncLabel = settings?.last_sync_at
    ? new Date(settings.last_sync_at).toLocaleString('nl-BE', {
        timeZone: 'Europe/Brussels',
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null

  return (
    <main className="stera-page-pb bg-stera-cream px-5 pt-3 sm:px-8 sm:pt-10">
      <div className="mx-auto max-w-2xl space-y-6">
        <div>
          <Link
            href="/dashboard"
            className="text-xs font-medium text-stera-green underline-offset-4 hover:underline"
          >
            ← Home
          </Link>
          <h1 className="mt-2 font-serif text-3xl text-stera-green">
            Agenda-koppeling
          </h1>
          <p className="mt-1 text-sm text-stera-ink-soft">
            Koppel je iPhone-agenda &ldquo;SteraPro&rdquo; aan de app — afspraken
            die je op je telefoon zet komen hier binnen, en beurten uit de app
            verschijnen op je iPhone.
          </p>
        </div>

        {/* 1. iPhone → app */}
        <section className="space-y-3 rounded-xl border border-stera-line bg-white p-4 sm:p-5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-stera-ink-soft">
            1 · iPhone → app
          </p>
          <h2 className="font-serif text-xl text-stera-green">
            Importeer je SteraPro-kalender
          </h2>
          <ol className="list-decimal space-y-2 pl-5 text-sm text-stera-ink">
            <li>
              Op je iPhone: maak (of gebruik) een aparte agenda genaamd{' '}
              <strong>SteraPro</strong> (Agenda → Agenda&apos;s → Agenda
              toevoegen).
            </li>
            <li>
              Op een Mac of via{' '}
              <a
                href="https://www.icloud.com/calendar"
                target="_blank"
                rel="noopener noreferrer"
                className="text-stera-green underline"
              >
                iCloud.com/calendar
              </a>
              : deel die agenda en zet{' '}
              <strong>Publieke agenda</strong> aan. Kopieer de link
              (begint met <code className="text-xs">webcal://</code>).
            </li>
            <li>Plak de link hieronder en bewaar. Tik daarna op &ldquo;Nu synchroniseren&rdquo;.</li>
          </ol>

          <form action={saveImportUrl} className="space-y-3 pt-2">
            <label className="block text-xs font-medium text-stera-ink-soft">
              Publieke ICS-link (webcal of https)
              <input
                name="import_ics_url"
                type="url"
                defaultValue={settings?.import_ics_url ?? ''}
                placeholder="webcal://pXX-caldav.icloud.com/published/…"
                className="mt-1 w-full rounded-lg border border-stera-line bg-stera-cream px-3 py-2 text-sm text-stera-ink outline-none focus:border-stera-green"
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                className="rounded-full bg-stera-green px-4 py-2 text-sm font-medium text-white hover:opacity-90"
              >
                URL bewaren
              </button>
              <SyncNowButton action={runCalendarSyncNow} />
            </div>
          </form>

          {lastSyncLabel ? (
            <p
              className={`text-xs ${
                settings?.last_sync_ok ? 'text-stera-green' : 'text-amber-800'
              }`}
            >
              Laatste sync: {lastSyncLabel}
              {settings?.last_sync_message
                ? ` — ${settings.last_sync_message}`
                : ''}
            </p>
          ) : (
            <p className="text-xs text-stera-ink-soft">Nog niet gesynchroniseerd.</p>
          )}

          <p className="text-xs text-stera-ink-soft">
            Automatisch: elke 15 minuten (Vercel Cron). Afspraken waarvan de
            titel een klantnaam bevat, worden automatisch aan die klant
            gekoppeld. Je kunt de beurt later in Onderhoud nog een locatie
            geven.
          </p>
        </section>

        {/* 2. app → iPhone */}
        <section className="space-y-3 rounded-xl border border-stera-line bg-white p-4 sm:p-5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-stera-ink-soft">
            2 · App → iPhone
          </p>
          <h2 className="font-serif text-xl text-stera-green">
            Abonneer je iPhone op de app-agenda
          </h2>
          <ol className="list-decimal space-y-2 pl-5 text-sm text-stera-ink">
            <li>
              Op iPhone: <strong>Instellingen → Agenda → Accounts → Account
              toevoegen → Anders → Gecalonneerde agenda toevoegen</strong>
              (of in Agenda: Agenda&apos;s → Abonnement toevoegen).
            </li>
            <li>Plak de geheime feed-URL hieronder.</li>
            <li>
              Noem het abonnement bv. <strong>SteraPro App</strong>. Dit is
              alleen-lezen: beurten die je in de app plant, verschijnen hier.
            </li>
          </ol>

          {feedUrl ? (
            <div className="rounded-lg border border-stera-line bg-stera-cream p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-stera-ink-soft">
                Geheime feed-URL
              </p>
              <p className="mt-1 break-all font-mono text-xs text-stera-ink">
                {feedUrl}
              </p>
            </div>
          ) : (
            <p className="text-sm text-amber-800">
              Feed-token ontbreekt — draai de migratie of genereer een nieuw
              token.
            </p>
          )}

          <form action={rotateFeedToken}>
            <button
              type="submit"
              className="rounded-full border border-stera-line bg-white px-4 py-2 text-sm font-medium text-stera-ink hover:border-stera-green"
            >
              Nieuw feed-token genereren
            </button>
          </form>
          <p className="text-xs text-stera-ink-soft">
            Na een nieuw token moet je het abonnement op je iPhone opnieuw
            toevoegen. Deel deze URL met niemand — wie hem heeft, ziet al je
            geplande beurten.
          </p>
        </section>

        <section className="rounded-xl border border-dashed border-stera-line p-4 text-sm text-stera-ink-soft">
          <p className="font-medium text-stera-ink">Tip</p>
          <p className="mt-1">
            Gebruik twee agenda&apos;s op je iPhone: <em>SteraPro</em> (schrijven
            — afspraken die jij plant) en <em>SteraPro App</em> (abonnement —
            wat de app exporteert). Zo vermijd je dubbels en blijft alles
            synchroon.
          </p>
        </section>
      </div>
    </main>
  )
}
