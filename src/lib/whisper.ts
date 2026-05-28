/**
 * Thin wrapper around OpenAI's Whisper speech-to-text endpoint. Used by the
 * Telegram webhook to transcribe voice messages before handing them to
 * Claude.
 */
const OPENAI_KEY = process.env.OPENAI_API_KEY ?? "";

export async function transcribeAudio(
  audioBuffer: Buffer,
  filename: string,
  mimeType: string,
): Promise<{ text: string; lang?: string } | null> {
  if (!OPENAI_KEY) {
    console.warn("[whisper] OPENAI_API_KEY missing; skipping transcription");
    return null;
  }

  const form = new FormData();
  // Copy the Buffer into a fresh ArrayBuffer so the Blob constructor's strict
  // BufferSource check (which excludes SharedArrayBuffer) is happy.
  const ab = new ArrayBuffer(audioBuffer.byteLength);
  new Uint8Array(ab).set(audioBuffer);
  const blob = new Blob([ab], { type: mimeType });
  form.append("file", blob, filename);
  form.append("model", "whisper-1");
  // We pass response_format=verbose_json so we can capture detected language.
  form.append("response_format", "verbose_json");

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_KEY}` },
    body: form,
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    console.error("[whisper] transcription failed", res.status, errText.slice(0, 300));
    return null;
  }
  const body = await res.json();
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text) return null;
  return { text, lang: typeof body?.language === "string" ? body.language : undefined };
}
