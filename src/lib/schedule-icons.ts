// Schedule block icons are stored as short string keys (e.g. "sunrise",
// "dumbbell") and rendered as lucide icons. This module is the *data* half —
// the key list + legacy-emoji migration — kept free of any React/lucide import
// so it's safe to use from server code (API routes, Anthropic tools). The
// rendering half (key -> lucide component) lives in the client component
// `app/miniapp/_components/schedule-icon.tsx`.

// Picker palette, in display order (grid of 8 per row).
export const SCHEDULE_ICON_KEYS = [
  // sky / energy
  "sunrise", "sun", "moon", "night", "star", "sparkles", "zap", "flame",
  // work / study
  "briefcase", "laptop", "code", "book", "graduation", "brain", "lightbulb", "target",
  // body / time
  "dumbbell", "walk", "bike", "yoga", "bed", "pen", "heart", "calendar",
  // food / life
  "breakfast", "meal", "coffee", "water", "cart", "money", "chat", "phone",
  // spiritual / misc
  "pray", "tree", "music", "palette", "check",
] as const;

export const DEFAULT_ICON_KEY = "calendar";

// Existing schedules stored emoji before the lucide switch. Map them to keys so
// old blocks render as lucide too, with no data migration required.
const EMOJI_TO_ICON_KEY: Record<string, string> = {
  "🌅": "sunrise", "☀": "sun", "🌙": "moon", "🌃": "night", "⭐": "star",
  "✨": "sparkles", "⚡": "zap", "🔥": "flame",
  "💼": "briefcase", "💻": "laptop", "📚": "book", "🎓": "graduation",
  "🧠": "brain", "💡": "lightbulb", "📝": "pen", "🎯": "target",
  "💪": "dumbbell", "🏃": "walk", "🚶": "walk", "🧘": "yoga", "🚴": "bike",
  "🏋": "dumbbell", "⚽": "yoga", "🛌": "bed",
  "🍳": "breakfast", "🍽": "meal", "☕": "coffee", "💧": "water", "🛒": "cart",
  "💰": "money", "💬": "chat", "📞": "phone",
  "🕌": "night", "🤲": "pray", "📿": "pray", "🌳": "tree", "🎵": "music",
  "🎨": "palette", "✅": "check", "❤": "heart", "📅": "calendar",
};

// Resolve any stored value (new key, or legacy emoji) to a known icon key.
export function resolveIconKey(stored: string | null | undefined): string {
  if (!stored) return DEFAULT_ICON_KEY;
  if ((SCHEDULE_ICON_KEYS as readonly string[]).includes(stored)) return stored;
  if (stored in EMOJI_TO_ICON_KEY) return EMOJI_TO_ICON_KEY[stored];
  const noVariation = stored.replace(/️/g, ""); // strip emoji variation selector
  if (noVariation in EMOJI_TO_ICON_KEY) return EMOJI_TO_ICON_KEY[noVariation];
  return DEFAULT_ICON_KEY;
}
