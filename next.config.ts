import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
