import type { Metadata } from 'next'
import { Instrument_Sans, Instrument_Serif } from 'next/font/google'
import './globals.css'

const instrumentSans = Instrument_Sans({
  variable: '--font-instrument-sans',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
})

const instrumentSerif = Instrument_Serif({
  variable: '--font-instrument-serif',
  subsets: ['latin'],
  weight: '400',
  style: ['normal', 'italic'],
})

export const metadata: Metadata = {
  title: {
    default: 'Stera Pro — Plantbeheer voor professionals',
    template: '%s · Stera Pro',
  },
  description:
    'Stera Pro is het plantbeheerplatform van Stera. Beheer locaties, planten en onderhoud — van scan tot rapport.',
  applicationName: 'Stera Pro',
  icons: {
    icon: [
      { url: '/stera-logo-short.png', type: 'image/png', sizes: '1000x1000' },
    ],
    apple: '/stera-logo-short.png',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="nl"
      className={`${instrumentSans.variable} ${instrumentSerif.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-stera-cream text-stera-ink">
        {children}
      </body>
    </html>
  )
}
