import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Shopify App Proxy stuurt /apps/mijn door naar /api/sso/token MÉT een
  // trailing slash. Next.js doet daarop standaard een 308-redirect naar de
  // slash-loze versie; die redirect loopt via de proxy en wordt door de
  // browser tegen het storefront-domein (sterapro.be) opgelost → 404.
  // Door de automatische trailing-slash-redirect uit te zetten, handelen we de
  // slash-versie zelf af in middleware (zie middleware.ts) en geeft de route
  // gewoon 200 JSON terug, die de proxy doorgeeft aan de browser.
  skipTrailingSlashRedirect: true,

  // Supabase Storage host whitelisten zodat we <Image> kunnen gebruiken
  // met automatische resize, blur-placeholder en lazy-loading. De host
  // hangt af van het project (auskptyjvmkbugygpuef.supabase.co); we
  // staan elke supabase.co subdomain toe zodat we niet vast zitten.
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
};

export default nextConfig;
