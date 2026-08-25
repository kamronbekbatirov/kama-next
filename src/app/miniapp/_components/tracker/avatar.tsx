"use client";

import { useState } from "react";

/** Deterministic tint per member, so initials stay recognisable between loads. */
const TINTS = [
  "bg-sky-500/15 text-sky-600 dark:text-sky-300",
  "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300",
  "bg-violet-500/15 text-violet-600 dark:text-violet-300",
  "bg-amber-500/15 text-amber-600 dark:text-amber-300",
  "bg-rose-500/15 text-rose-600 dark:text-rose-300",
];

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = [...parts[0]][0] ?? "";
  const second = parts.length > 1 ? [...parts[1]][0] ?? "" : "";
  return (first + second).toUpperCase();
}

function tintOf(id: string): string {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return TINTS[h % TINTS.length];
}

/**
 * A member's face on the shared board.
 *
 * Falls back to initials whenever there is no photo — someone with a hidden
 * profile photo should look like a participant, not like a broken image. The
 * <img> also falls back on its own if the proxy 404s, which happens naturally
 * in the window between someone removing their photo and the daily refresh.
 */
export function Avatar({ memberId, name, hasPhoto, size = 28 }: {
  memberId: string;
  name: string;
  hasPhoto: boolean;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);
  const px = { width: size, height: size };

  if (hasPhoto && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- proxied, already sized, no optimiser needed
      <img
        src={`/api/members/avatar/${encodeURIComponent(memberId)}`}
        alt={name}
        style={px}
        onError={() => setFailed(true)}
        className="rounded-full object-cover shrink-0 bg-[var(--muted-bg)]"
      />
    );
  }

  return (
    <span
      style={{ ...px, fontSize: Math.round(size * 0.36) }}
      aria-label={name}
      className={`rounded-full shrink-0 grid place-items-center font-semibold ${tintOf(memberId)}`}
    >
      {initials(name)}
    </span>
  );
}
