import relayCatalogue from '../config/relay-models.json';

// Server-only routing. The existing Jolly Relay key serves Muse Agents too.
export function aiProvider() {
  const relay = Boolean(process.env.JOLLY_API_KEY?.trim());
  const base = relay ? (process.env.JOLLY_API_BASE_URL?.trim() || 'https://api.relaymodels.com/v1') : 'https://openrouter.ai/api/v1';
  const url = new URL(base);
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Invalid AI provider endpoint');
  return { relay, name: relay ? 'Relay Models' : 'OpenRouter', base: base.replace(/\/+$/, ''), key: (relay ? process.env.JOLLY_API_KEY : process.env.OPENROUTER_API_KEY)?.trim() };
}

export async function providerHealth() {
  const p = aiProvider();
  if (!p.key) return {ok:false, configured:false, provider:p.name};
  try {
    const response = await fetch(`${p.base}/${p.relay ? 'models' : 'auth/key'}`, {headers:{Authorization:`Bearer ${p.key}`},redirect:'error',signal:AbortSignal.timeout(12000),cache:'no-store'});
    return {ok:response.ok, configured:true, provider:p.name, status:response.status};
  } catch { return {ok:false, configured:true, provider:p.name, error:'Provider unavailable'}; }
}
import { actionResponseFormat } from './actions';

export type OpenRouterModel = {
  id: string;
  apiModel?: string;
  name: string;
  context_length?: number;
  pricing?: { prompt?: string; completion?: string };
  architecture?: { modality?: string; input_modalities?: string[]; output_modalities?: string[] };
  supported_parameters?: string[];
};

let modelCache: { at: number; models: OpenRouterModel[] } | null = null;

export async function getModels(force = false) {
  if (!force && modelCache && Date.now() - modelCache.at < 10 * 60_000) return modelCache.models;
  const p = aiProvider();
  const response = await fetch(`${p.base}/models`, { headers: { Accept: "application/json", ...(p.key ? {Authorization:`Bearer ${p.key}`} : {}) }, redirect:"error", signal: AbortSignal.timeout(12_000), cache: "no-store" });
  if (!response.ok) throw new Error(`${p.name} catalogue returned ${response.status}`);
  const body = await response.json() as { data?: OpenRouterModel[] };
  // Text generation verified for these model IDs on 2026-09-24.
  // Pricing snapshot from https://relaymodels.com/models, checked 2026-09-24.
  // Intersect with this key's live catalogue; never advertise unsupported aliases.
  const available = new Set((body.data || []).map(m => m.id));
  const source: OpenRouterModel[] = p.relay ? relayCatalogue.filter(m => available.has(m.id)).map(m => ({
    id:`${m.provider}/${m.id}`, apiModel:m.id, name:m.name, context_length:m.context,
    pricing:{prompt:String(m.usdPerMillion / 1_000_000), completion:String(m.usdPerMillion / 1_000_000)},
    architecture:{output_modalities:['text']}
  })) : (body.data || []);
  const models = source.filter((model) => {
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
  const p = aiProvider();
  if (!p.key) throw new Error('AI provider key is not configured');
  const selected = (await getModels()).find(m => m.id === input.model);
  if (!selected) throw new Error('Selected model is unavailable; choose another model in the same family.');
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 1; attempt++) {
    try {
      const response = await fetch(`${p.base}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${p.key}`,
          "Content-Type": "application/json",
          ...(process.env.OPENROUTER_SITE_URL ? { "HTTP-Referer": process.env.OPENROUTER_SITE_URL } : {}),
          "X-Title": process.env.OPENROUTER_SITE_NAME || "Muse Agents"
        },
        body: JSON.stringify({ model: selected.apiModel || input.model, messages: input.messages, max_tokens: input.maxTokens || 512, temperature: 0.85, ...(!p.relay ? {plugins: [{id:"web",enabled:false}]} : {}), ...(input.structured?{response_format:actionResponseFormat,...(!p.relay ? {provider:{require_parameters:true}} : {})}:{}) }),
        redirect: "error",
        signal: AbortSignal.timeout(60_000)
      });
      const body = await response.json() as Record<string, any>;
      if (!response.ok) throw new Error(`${p.name} returned ${response.status}`);
      const content = String(body?.choices?.[0]?.message?.content || "");
      return { content, usage: body.usage || {}, id: body.id || null };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      // Retry on the next scheduled turn: never duplicate potentially billable timeouts.
    }
  }
  throw lastError || new Error("OpenRouter request failed");
}
