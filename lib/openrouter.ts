const BASE = "https://openrouter.ai/api/v1";
import { actionResponseFormat } from './actions';

export type OpenRouterModel = {
  id: string;
  name: string;
  context_length?: number;
  pricing?: { prompt?: string; completion?: string };
  architecture?: { modality?: string; input_modalities?: string[]; output_modalities?: string[] };
  supported_parameters?: string[];
};

let modelCache: { at: number; models: OpenRouterModel[] } | null = null;

export async function getModels(force = false) {
  if (!force && modelCache && Date.now() - modelCache.at < 10 * 60_000) return modelCache.models;
  const response = await fetch(`${BASE}/models`, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(12_000), cache: "no-store" });
  if (!response.ok) throw new Error(`OpenRouter catalogue returned ${response.status}`);
  const body = await response.json() as { data?: OpenRouterModel[] };
  const models = (body.data || []).filter((model) => {
    const output = model.architecture?.output_modalities || [];
    const modality = model.architecture?.modality || "";
    return output.includes("text") || (!output.length && modality.endsWith("->text"));
  });
  modelCache = { at: Date.now(), models };
  return models;
}

export function providerFor(modelId: string) {
  const provider = modelId.split("/")[0] || "other";
  const names: Record<string, string> = { openai: "OpenAI", anthropic: "Anthropic", "x-ai": "xAI", google: "Google", deepseek: "DeepSeek", qwen: "Qwen", "meta-llama": "Meta", mistralai: "Mistral" };
  return names[provider] || provider.replace(/(^|-)(\w)/g, (_, s, c) => `${s}${c.toUpperCase()}`);
}

export async function chatCompletion(input: { model: string; messages: Array<{ role: "system" | "user" | "assistant"; content: string }>; maxTokens?: number; structured?:boolean }) {
  if (!process.env.OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY is not configured");
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 1; attempt++) {
    try {
      const response = await fetch(`${BASE}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
          ...(process.env.OPENROUTER_SITE_URL ? { "HTTP-Referer": process.env.OPENROUTER_SITE_URL } : {}),
          "X-Title": process.env.OPENROUTER_SITE_NAME || "Muse Agents"
        },
        body: JSON.stringify({ model: input.model, messages: input.messages, max_tokens: input.maxTokens || 512, temperature: 0.85, plugins: [{id:"web",enabled:false}], ...(input.structured?{response_format:actionResponseFormat,provider:{require_parameters:true}}:{}) }),
        signal: AbortSignal.timeout(60_000)
      });
      const body = await response.json() as Record<string, any>;
      if (!response.ok) throw new Error(`OpenRouter returned ${response.status}`);
      const content = String(body?.choices?.[0]?.message?.content || "");
      return { content, usage: body.usage || {}, id: body.id || null };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      // Retry on the next scheduled turn: never duplicate potentially billable timeouts.
    }
  }
  throw lastError || new Error("OpenRouter request failed");
}
