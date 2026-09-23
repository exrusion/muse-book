import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import path from "node:path";

function signature(payload: string) {
  const secret = process.env.JOLLY_API_KEY;
  if (!secret) throw new Error("Voice not configured");
  return createHmac("sha256", secret).update(`jolly-voice:${payload}`).digest("base64url");
}
export function issueVoiceToken(text: string) {
  const payload = Buffer.from(JSON.stringify({ text, expires: Date.now() + 180_000, id: randomUUID() })).toString("base64url");
  return `${payload}.${signature(payload)}`;
}
export function readVoiceToken(token: string): { text: string; expires: number; id: string } | null {
  try {
    const [payload, supplied, extra] = token.split(".");
    if (!payload || !supplied || extra) return null;
    const expected = Buffer.from(signature(payload));
    const actual = Buffer.from(supplied);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
    const value = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (typeof value.text !== "string" || value.text.length > 850 || !value.text.trim() || typeof value.id !== "string" || typeof value.expires !== "number" || value.expires < Date.now()) return null;
    return value;
  } catch { return null; }
}

let engine: Promise<import("kokoro-js").KokoroTTS> | undefined;
let busy = false;
const cache = new Map<string, { expires: number; audio: Uint8Array }>();

async function getEngine() {
  if (!engine) engine = (async () => {
    const [{ KokoroTTS }, { env, StyleTextToSpeech2Model, AutoTokenizer }] = await Promise.all([import("kokoro-js"), import("@huggingface/transformers")]);
    env.cacheDir = path.join(process.cwd(), "voice-model");
    const id = "onnx-community/Kokoro-82M-v1.0-ONNX";
    const [model, tokenizer] = await Promise.all([
      StyleTextToSpeech2Model.from_pretrained(id, { dtype: "q8", device: "cpu", session_options: { intraOpNumThreads: 1, interOpNumThreads: 1 } }),
      AutoTokenizer.from_pretrained(id)
    ]);
    return new KokoroTTS(model, tokenizer);
  })().catch(error => { engine = undefined; throw error; });
  return engine;
}

export async function generateJollyVoice(ticket: { text: string; expires: number; id: string }) {
  for (const [id, item] of cache) if (item.expires < Date.now()) cache.delete(id);
  const cached = cache.get(ticket.id);
  if (cached) return cached.audio;
  // Bound CPU and memory use on the shared web service. The UI falls back gracefully.
  if (busy) return null;
  busy = true;
  try {
    const tts = await getEngine();
    const text = ticket.text.replace(/[*_#`]/g, "").replace(/https?:\/\/\S+/g, "the link");
    const audio = await tts.generate(text, { voice: "af_heart", speed: 1.02 });
    const bytes = new Uint8Array(await audio.toBlob().arrayBuffer());
    if (cache.size >= 12) cache.delete(cache.keys().next().value!);
    cache.set(ticket.id, { expires: ticket.expires, audio: bytes });
    return bytes;
  } finally { busy = false; }
}
