// Kokoro Apache-2.0: https://github.com/hexgrad/kokoro
// Downloaded once into the browser cache. No API key or conversation leaves this worker.
import { KokoroTTS } from "https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/dist/kokoro.web.js";

let engine;
let latest = 0;
let queue = Promise.resolve();
function load() {
  if (!engine) engine = KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", {
    dtype: "q8", device: "wasm",
    progress_callback: (p) => {
      if (p.status === "progress" && /onnx/.test(p.file || "")) self.postMessage({ type: "progress", progress: Math.round(p.progress) });
    }
  }).then(tts => { self.postMessage({ type: "ready" }); return tts; });
  return engine;
}
self.onmessage = ({ data }) => {
  if (data.type === "cancel") { latest = data.id; return; }
  if (data.type === "load") { load().catch(() => self.postMessage({ type: "unavailable" })); return; }
  if (data.type !== "speak") return;
  latest = data.id;
  queue = queue.then(async () => {
    if (data.id !== latest) return;
    try {
      const tts = await load();
      if (data.id !== latest) return;
      const audio = await tts.generate(data.text, { voice: "af_heart", speed: 1.02 });
      if (data.id === latest) self.postMessage({ type: "audio", id: data.id, samples: audio.audio, sampleRate: audio.sampling_rate }, [audio.audio.buffer]);
    } catch { self.postMessage({ type: "error", id: data.id }); }
  });
};
