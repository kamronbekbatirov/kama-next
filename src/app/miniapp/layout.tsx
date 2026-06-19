import type { Metadata, Viewport } from "next";
import Script from "next/script";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  // When the on-screen keyboard opens, shrink the layout viewport so fixed
  // elements and 100dvh track it (instant on Chromium; iOS uses the
  // visual-viewport sync in the dashboard shell instead).
  interactiveWidget: "resizes-content",
};

// Hide /miniapp/** from search engines entirely.
export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
      "max-snippet": -1,
      "max-image-preview": "none",
      "max-video-preview": -1,
    },
  },
};

export default function MiniAppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
      {children}
    </>
  );
}
