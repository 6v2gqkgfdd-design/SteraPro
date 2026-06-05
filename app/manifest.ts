import type { MetadataRoute } from 'next'

/**
 * Web App Manifest — Next.js serveert dit automatisch op
 * /manifest.webmanifest. Met de juiste iOS meta-tags in layout.tsx
 * krijg je 'Toevoegen aan beginscherm' in Safari, met fullscreen
 * launch (geen Safari-balk).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Stera Pro',
    short_name: 'Stera Pro',
    description:
      'Stera Pro — plantbeheer voor professionals. Onderhoud, planten en klanten in één app.',
    start_url: '/dashboard',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#FFFDF7',
    theme_color: '#426F52',
    lang: 'nl-BE',
    scope: '/',
    icons: [
      {
        src: '/stera-logo-short.png',
        sizes: '1000x1000',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/stera-logo-short.png',
        sizes: '1000x1000',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  }
}
