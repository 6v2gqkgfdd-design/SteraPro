import WhyAccount from '@/components/why-account'

export function MspGate({ demo }: { demo: boolean }) {
  return (
    <div className="msp-root">
      <div className="msp-login">
        <WhyAccount />
        <section>
          <h1 className="msp-title">Inloggen</h1>
          <p className="msp-lead">
            Log in via de shop. Daarna opent Mijn SteraPro op sterapro.be, in dezelfde header en footer.
          </p>
          <p style={{ marginTop: 20 }}>
            <a className="msp-btn" href="https://sterapro.be/account/login">
              Inloggen via de shop
            </a>
          </p>
          {demo ? (
            <p style={{ marginTop: 12 }}>
              <a className="msp-btn msp-btn-ghost" href="/apps/mijn/voorbeeld">
                Demo Kantoor openen
              </a>
            </p>
          ) : null}
          <p className="msp-lead">
            Nog geen account?{' '}
            <a className="msp-link" href="https://sterapro.be/account/register">
              Registreer je bij de shop
            </a>
          </p>
        </section>
      </div>
    </div>
  )
}

export function MspWaiting({ demo }: { demo: boolean }) {
  return (
    <div className="msp-root">
      <h1 className="msp-title">Mijn SteraPro</h1>
      <p className="msp-lead">
        Je bent ingelogd in de shop. Je planten zetten we aan na een go. Tot dan blijft dit scherm leeg van echte klantgegevens.
      </p>
      {demo ? (
        <p style={{ marginTop: 20 }}>
          <a className="msp-btn" href="/apps/mijn/voorbeeld">
            Demo Kantoor bekijken
          </a>
        </p>
      ) : null}
    </div>
  )
}
