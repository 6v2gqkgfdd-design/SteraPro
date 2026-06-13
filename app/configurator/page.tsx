import type { Metadata } from 'next'
import Configurator from './Configurator'

// Publieke plantconfigurator — bereikbaar vanaf de webshop zonder login.
// (Zie middleware.ts: /configurator staat in de publieke allowlist.)
export const metadata: Metadata = {
  title: 'Plantconfigurator · Stera Pro',
  description:
    'Stel in een paar stappen de planten samen die passen bij jouw ruimte — en zet ze meteen in je winkelmandje.',
}

export default function ConfiguratorPage() {
  return <Configurator />
}
