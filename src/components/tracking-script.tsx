"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";

/**
 * Umami tracker for the public kama.uz site. Deliberately NOT loaded on the
 * private dashboard (/miniapp) so Kamronbek's own admin sessions don't pollute
 * visitor stats. data-domains pins it to kama.uz so it never fires on
 * localhost/previews.
 *
 * Env (public, baked at build): NEXT_PUBLIC_UMAMI_SRC, NEXT_PUBLIC_UMAMI_WEBSITE_ID.
 */
const SRC = process.env.NEXT_PUBLIC_UMAMI_SRC;
const WEBSITE_ID = process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID;

export function TrackingScript() {
  const pathname = usePathname();
  if (!SRC || !WEBSITE_ID) return null;
  if (pathname?.startsWith("/miniapp")) return null;
  return (
    <Script
      src={SRC}
      data-website-id={WEBSITE_ID}
      data-domains="kama.uz"
      strategy="afterInteractive"
    />
  );
}
