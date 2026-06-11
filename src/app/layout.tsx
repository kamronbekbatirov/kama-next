import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";
import { Providers } from "@/components/providers";
import type { Lang } from "@/lib/i18n";

/**
 * Pick an initial UI language from the visitor's Accept-Language header.
 *
 * Rule (per product preference): Russian for Russian / post-Soviet
 * audiences (most users from UZ / Russia / CIS will land on it), English
 * for everyone else. Uzbek is never auto-selected — the user has to flip
 * the language toggle themselves.
 */
function pickInitialLang(acceptLang: string | null): Lang {
  if (!acceptLang) return "en";
  // First locale tag, primary subtag (ru-RU -> "ru").
  const first = acceptLang.toLowerCase().split(",")[0].trim().split(";")[0].split("-")[0];
  // Russian + the post-Soviet languages where Russian is the lingua franca for written tech content.
  const russianSpeakingTags = new Set(["ru", "uz", "kk", "ky", "tg", "tk", "be", "mo"]);
  if (russianSpeakingTags.has(first)) return "ru";
  return "en";
}

export const metadata: Metadata = {
  title: "Kamronbek Batirov — Full-Stack Developer, London",
  description: "Full-stack developer in London. BSc CS, Brunel University (2:1). End-to-end products: multi-tenant SaaS with RAG, AI-driven Telegram mini apps, embedded firmware with hand-rolled crypto (ESP32-S3 + mbedTLS), VR / Gaussian-Splat pipelines. 12 shipped, 5 live in production.",
  openGraph: {
    title: "Kamronbek Batirov — Full-Stack Developer",
    description: "12 shipped products: AI-driven SaaS, Telegram mini apps, embedded firmware, VR pipelines. London, UK.",
    url: "https://kama.uz",
    type: "website",
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "48x48", type: "image/x-icon" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
  manifest: "/site.webmanifest",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const h = await headers();
  const initialLang = pickInitialLang(h.get("accept-language"));
  return (
    <html lang={initialLang} suppressHydrationWarning>
      <body className="min-h-screen">
        <Providers defaultLang={initialLang}>{children}</Providers>
      </body>
    </html>
  );
}
