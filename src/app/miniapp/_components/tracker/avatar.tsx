"use client";

import { useState } from "react";

/**
 * Telegram's own avatar placeholder palette, in Telegram's own order.
 *
 * Which one a person gets is `telegram_id % 7` — the same arithmetic the
 * Telegram clients do — so someone who shows up orange in the chat list shows
 * up orange here. Verified against a real account: id 8400858887 gives 1, and
 * 1 is the orange the owner sees in Telegram for that person.
 *
 * The index is computed on the server precisely so that the raw Telegram ids of
 * other members never have to be sent to anyone's browser.
 */
const TG_COLORS: [string, string][] = [
  ["#FF845E", "#D45246"], // 0 red
  ["#FEBB5B", "#F68136"], // 1 orange
  ["#B694F9", "#6C61DF"], // 2 violet
  ["#A0DE7E", "#54CB68"], // 3 green
  ["#53EDD6", "#28C9B7"], // 4 cyan
  ["#5CAFFA", "#408ACF"], // 5 blue
  ["#FF8AAC", "#D95574"], // 6 pink
];

/** First letter of the first word, plus the second word's if there is one —
 *  the same one-or-two letters Telegram draws from a first and last name. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = [...parts[0]][0] ?? "";
  const second = parts.length > 1 ? [...parts[1]][0] ?? "" : "";
  return (first + second).toUpperCase();
}

/**
 * A member's face on the shared board.
 *
 * With no photo — hidden, or never set — this draws what Telegram itself draws
 * in that situation, rather than inventing a placeholder of its own: the same
 * letters, the same gradient, picked by the same rule. Someone recognisable in
 * the chat list stays recognisable here.
 *
 * The <img> falls back to the same placeholder on error, which is what the
 * window between a person removing their photo and the next refresh looks like.
 */
export function Avatar({ name, hasPhoto, colorIndex, memberId, size = 28 }: {
  memberId: string;
  name: string;
  hasPhoto: boolean;
  colorIndex: number;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);
  const box = { width: size, height: size };

  if (hasPhoto && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- proxied and already sized
      <img
        src={`/api/members/avatar/${encodeURIComponent(memberId)}`}
        alt={name}
        style={box}
        onError={() => setFailed(true)}
        className="rounded-full object-cover shrink-0 bg-[var(--muted-bg)]"
      />
    );
  }

  const [top, bottom] = TG_COLORS[((colorIndex % 7) + 7) % 7];
  return (
    <span
      aria-label={name}
      style={{
        ...box,
        backgroundImage: `linear-gradient(180deg, ${top} 0%, ${bottom} 100%)`,
        fontSize: Math.round(size * 0.42),
        lineHeight: 1,
      }}
      className="rounded-full shrink-0 grid place-items-center font-semibold text-white select-none"
    >
      {initials(name)}
    </span>
  );
}
