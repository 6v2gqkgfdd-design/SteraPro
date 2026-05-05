import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Stera Pro — Plantbeheer voor professionals",
    template: "%s · Stera Pro",
  },
  description:
    "Stera Pro is het plantbeheerplatform van Stera. Beheer locaties, planten en onderhoud — van scan tot rapport.",
  applicationName: "Stera Pro",
  icons: {
    icon: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="nl"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-[#F7F4EF] text-[#1A2F6E]">{children}</body>
    </html>
  );
}
