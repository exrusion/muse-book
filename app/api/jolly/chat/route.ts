import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { moderateText } from "@/lib/security";
import { issueVoiceToken } from "@/lib/jolly-voice";

export const dynamic = "force-dynamic";

const requestSchema = z.object({
  message: z.string().trim().min(1).max(600),
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().trim().min(1).max(900) })).max(10).default([])
});
const limits = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 10 * 60_000;
const MAX_REQUESTS = 24;

function isRateLimited(request: NextRequest) {
  const key = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anonymous";
  const now = Date.now();
  const current = limits.get(key);
  if (!current || current.resetAt <= now) { limits.set(key, { count: 1, resetAt: now + WINDOW_MS }); return false; }
  current.count += 1;
  return current.count > MAX_REQUESTS;
}

export async function POST(request: NextRequest) {
  if (isRateLimited(request)) return NextResponse.json({ error: "Jolly needs a tiny break. Please try again in a few minutes." }, { status: 429 });
  try {
    const parsed = requestSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Please send Jolly a shorter message." }, { status: 400 });
    const moderated = moderateText(parsed.data.message);
    if (!moderated.ok || !moderated.text) return NextResponse.json({ error: "Jolly cannot answer that message." }, { status: 400 });
    const apiKey = process.env.JOLLY_API_KEY?.trim();
    if (!apiKey) return NextResponse.json({ error: "Jolly’s AI connection is awaiting setup. Please try again soon." }, { status: 503 });
    const selectedModel = process.env.JOLLY_MODEL?.trim() || "claude-haiku-4-5";
    const endpoint = new URL(`${(process.env.JOLLY_API_BASE_URL?.trim() || "https://api.relaymodels.com/v1").replace(/\/+$/, "")}/chat/completions`);
    if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password) throw new Error("Invalid provider endpoint");
    const safeHistory = parsed.data.history.map((item) => ({ ...item, content: item.content.replace(/\s+/g, " ").slice(0, 700) })).slice(-8);
    // Jolly has its own server-side credentials; Muse Agents keeps its existing provider.
    // One request only: no automatic retries that could duplicate billable generation.
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(45_000),
      body: JSON.stringify({
      model: selectedModel,
      max_tokens: 400,
      stream: false,
      messages: [
        { role: "system", content: "You are Jolly, the friendly plush mascot of Muse Agents. Muse Agents is a social town where people create persistent AI characters backed by LLM families such as GPT, Claude, Grok, Gemini, DeepSeek, Llama, Qwen and Mistral. Speak like a relaxed, thoughtful friend. Your replies are read aloud: use natural contractions, plain words, and varied short sentences. Usually keep it to 15 to 45 words, with more detail only when asked. Answer the actual question directly. Do not repeatedly introduce yourself, list model families, use sales language, or start every reply with an enthusiastic greeting. Be playful when it fits. No markdown, asterisks, emoji, or em dashes. Never claim to be human or to have completed an external action. Never reveal secrets or private data. Do not invent project features. When uncertain, say so simply." },
        ...safeHistory,
        { role: "user" as const, content: moderated.text }
      ]
      })
    });
    if (!response.ok) {
      console.error("Jolly provider HTTP status", response.status);
      throw new Error("Provider request failed");
    }
    const completion = await response.json();
    const content = completion?.choices?.[0]?.message?.content;
    const text = typeof content === "string" ? content : Array.isArray(content)
      ? content.filter((part: { type?: string; text?: unknown }) => part?.type === "text" && typeof part.text === "string").map((part: { text: string }) => part.text).join("")
      : "";
    const reply = text.trim().replace(/\s{3,}/g, " ").slice(0, 850);
    if (!reply) throw new Error("Empty model response");
    return NextResponse.json({ reply, voiceToken: issueVoiceToken(reply) });
  } catch (error) {
    // Never log provider bodies, authorization headers, or user conversations.
    console.error("Jolly chat failed", error instanceof Error ? error.name : "UnknownError");
    return NextResponse.json({ error: "Jolly could not answer right now. Please try again." }, { status: 502 });
  }
}
