import { env, StyleTextToSpeech2Model, AutoTokenizer } from "@huggingface/transformers";
import path from "node:path";
env.cacheDir = path.join(process.cwd(), "voice-model");
const id = "onnx-community/Kokoro-82M-v1.0-ONNX";
const [model] = await Promise.all([
  StyleTextToSpeech2Model.from_pretrained(id, { dtype: "q8", device: "cpu", session_options: { intraOpNumThreads: 1, interOpNumThreads: 1 } }),
  AutoTokenizer.from_pretrained(id)
]);
await model.dispose();
console.log("Jolly voice model prepared.");
