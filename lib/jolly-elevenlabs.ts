type Ticket = { text: string; expires: number; id: string };
export class JollyVoiceError extends Error {}
const cache = new Map<string, { expires: number; audio: Uint8Array }>();
const pending = new Map<string, Promise<Uint8Array>>();

export async function elevenLabsVoice(ticket: Ticket): Promise<Uint8Array> {
  const key = process.env.ELEVENLABS_API_KEY?.trim();
  if (!key) throw new JollyVoiceError("Jolly’s natural voice is not configured yet.");
  const voice = process.env.ELEVENLABS_VOICE_ID?.trim() || "EXAVITQu4vr4xnSDxMaL";
  const model = process.env.ELEVENLABS_MODEL_ID?.trim() || "eleven_flash_v2_5";
  const id = `${ticket.id}:${voice}:${model}`;
  for (const [k, v] of cache) if (v.expires < Date.now()) cache.delete(k);
  const hit = cache.get(id);
  if (hit) return hit.audio;
  const existing = pending.get(id);
  if (existing) return existing;
  if (pending.size >= 4) throw new JollyVoiceError("Jolly’s voice is busy. Please retry in a moment.");
  const job = (async () => {
    let response: Response;
    try {
      response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}?output_format=mp3_44100_128`, {
        method: "POST",
        headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/mpeg" },
        body: JSON.stringify({
          text: ticket.text.replace(/[*_#`]/g, "").replace(/https?:\/\/\S+/g, "the link"),
          model_id: model,
          voice_settings: { stability: 0.45, similarity_boost: 0.75, style: 0, use_speaker_boost: true, speed: 0.97 }
        }),
        signal: AbortSignal.timeout(20_000), cache: "no-store"
      });
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) throw new JollyVoiceError("Natural voice needs a valid ElevenLabs key with voice access.");
        if (response.status === 402 || response.status === 429) throw new JollyVoiceError("Natural voice reached its usage limit. Please check ElevenLabs credits or retry shortly.");
        throw new JollyVoiceError("Natural voice is unavailable right now. Please retry.");
      }
      if (!response.headers.get("content-type")?.startsWith("audio/")) throw new JollyVoiceError("Natural voice returned an invalid audio response.");
      const audio = new Uint8Array(await response.arrayBuffer());
      if (!audio.length || audio.length > 5_000_000) throw new JollyVoiceError("Natural voice returned an invalid audio response.");
      if (cache.size >= 24) cache.delete(cache.keys().next().value!);
      cache.set(id, { expires: ticket.expires, audio });
      return audio;
    } catch (error) {
      if (error instanceof JollyVoiceError) throw error;
      throw new JollyVoiceError("Natural voice took too long or could not connect. Please retry.");
    }
  })();
  pending.set(id, job);
  try { return await job; } finally { pending.delete(id); }
}
