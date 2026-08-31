import { requireOwner, UNAUTHORIZED } from "@/lib/guard";
import { transcribeAudio } from "@/lib/whisper";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Whisper's own ceiling is 25 MB; refusing here gives a clear answer instead of
// a failed upload after a long wait.
const MAX_BYTES = 25 * 1024 * 1024;

const AUDIO = /^(audio\/|video\/(mp4|webm|quicktime))/;

/**
 * Audio in, Markdown out.
 *
 * The transcript is returned rather than stored: it is a tool, not a record,
 * and what to keep is the person's decision. Paragraphs are split on sentence
 * ends because Whisper returns one unbroken block, which is unreadable at any
 * length worth transcribing.
 */
export async function POST(req: Request) {
  try {
    await requireOwner();
  } catch { return UNAUTHORIZED(); }

  try {
    const form = await req.formData();
    const file = form.get("audio");
    if (!(file instanceof File)) {
      return Response.json({ error: "audio required" }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return Response.json({ error: "too_large", limit_mb: 25 }, { status: 413 });
    }
    const type = file.type || "audio/mpeg";
    if (!AUDIO.test(type)) {
      return Response.json({ error: "unsupported_type", type }, { status: 415 });
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const out = await transcribeAudio(buf, file.name || "audio", type);
    if (!out || !out.text) {
      return Response.json({ error: "transcription_failed" }, { status: 502 });
    }

    const paragraphs = out.text
      .replace(/([.!?…])\s+(?=[A-ZА-ЯЁ])/g, "$1\n\n")
      .split("\n\n")
      .map(s => s.trim())
      .filter(Boolean);

    const title = (file.name || "audio").replace(/\.[^.]+$/, "");
    const md = [
      `# ${title}`,
      "",
      `- **Файл:** \`${file.name}\``,
      `- **Размер:** ${(file.size / 1024 / 1024).toFixed(1)} МБ`,
      out.lang ? `- **Язык:** ${out.lang}` : null,
      `- **Расшифровано:** ${new Date().toISOString().slice(0, 16).replace("T", " ")} · OpenAI \`whisper-1\``,
      "",
      "---",
      "",
      ...paragraphs,
      "",
    ].filter(l => l !== null).join("\n");

    return Response.json({
      text: out.text,
      lang: out.lang ?? null,
      markdown: md,
      filename: `${title}.md`,
    });
  } catch (e) {
    console.error("tools/transcribe:", e instanceof Error ? e.message : String(e));
    return Response.json({ error: "error" }, { status: 500 });
  }
}
