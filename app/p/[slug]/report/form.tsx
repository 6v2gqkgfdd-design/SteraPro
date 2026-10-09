import { mspApi, mspHref, mspStore } from '@/lib/msp-request'
import { REPORT_CHOICES } from '@/lib/report-issues'

export default function PlantReportForm({
  slug,
  known,
  title,
  place,
  error,
}: {
  slug: string
  known: boolean
  title: string
  place?: string | null
  error?: string
}) {
  const back = `${mspHref(`/p/${slug}/report`)}${known && mspStore().demo ? '?voorbeeld=1' : ''}`
  return (
    <form action={mspApi('melding')} method="post" encType="multipart/form-data">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="back" value={back} />
      {mspStore().demo ? <input type="hidden" name="demo" value="1" /> : null}
      <input className="msp-hp" type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" />
      <p className="msp-kicker">Stap 1 van 2</p>
      <section className="msp-panel">
        <h2>{title}</h2>
        <p>{place || 'Melding voor deze plant'}</p>
      </section>
      <p className="msp-label">Wat is er aan de hand?</p>
      <div className="msp-choices">
        {REPORT_CHOICES.map((choice) => (
          <label key={choice.value} className="msp-choice">
            <input type="radio" name="issue" value={choice.value} required />
            {choice.label}
          </label>
        ))}
      </div>
      <div className="msp-file" style={{ marginTop: 16 }}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
          <path d="M4 8h3l2-2h6l2 2h3v10H4z" />
          <circle cx="12" cy="13" r="3" />
        </svg>
        <span>Een foto helpt ons, dit is optioneel.</span>
        <label className="msp-upload">
          Foto toevoegen
          <input type="file" name="photo" accept="image/*" capture="environment" />
        </label>
      </div>
      <label className="msp-label" htmlFor="report-message">
        Toelichting
      </label>
      <textarea id="report-message" name="message" placeholder="Wat zie je?" />
      {known ? null : (
        <>
          <label className="msp-label" htmlFor="report-name">
            Je naam
          </label>
          <input id="report-name" className="msp-input" name="name" type="text" autoComplete="name" />
          <label className="msp-label" htmlFor="report-email">
            E-mail
          </label>
          <input id="report-email" className="msp-input" name="email" type="email" autoComplete="email" />
          <p className="msp-help">Voor ons antwoord.</p>
        </>
      )}
      {error ? <p className="msp-note">{error}</p> : null}
      <div className="msp-sticky">
        <button className="msp-btn msp-btn-block" type="submit">
          Melding versturen
        </button>
      </div>
    </form>
  )
}
