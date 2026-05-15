import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";

export const metadata: Metadata = {
  title: "Kamronbek Batirov — Full-Stack Developer, London",
  description: "Full-stack developer in London. BSc CS, Brunel University (2:1). End-to-end products: multi-tenant SaaS with RAG, AI-driven Telegram mini apps, embedded firmware with hand-rolled crypto (ESP32-S3 + mbedTLS), VR / Gaussian-Splat pipelines. 12 shipped, 5 live in production.",
  openGraph: {
    title: "Kamronbek Batirov — Full-Stack Developer",
    description: "12 shipped products: AI-driven SaaS, Telegram mini apps, embedded firmware, VR pipelines. Available in London, UK Graduate Visa until Nov 2027.",
    url: "https://kama.uz",
    type: "website",
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "48x48", type: "image/x-icon" },
      { url: "/icon.svg",    type: "image/svg+xml" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
