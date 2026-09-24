import { NextRequest, NextResponse } from "next/server";
import { generateJollyVoice, readVoiceToken } from "@/lib/jolly-voice";

import { elevenLabsVoice, JollyVoiceError } from "@/lib/jolly-elevenlabs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (typeof body?.token !== "string" || body.token.length > 6000) return NextResponse.json({ error: "Invalid voice request" }, { status: 400 });
    const ticket = readVoiceToken(body.token);
    if (!ticket) return NextResponse.json({ error: "Voice request expired" }, { status: 403 });
    const eleven = Boolean(process.env.ELEVENLABS_API_KEY?.trim());
    const audio = eleven ? await elevenLabsVoice(ticket) : await generateJollyVoice(ticket);
    if (!audio) return NextResponse.json({ error: "Voice is busy" }, { status: 503 });
    return new Response(new Uint8Array(audio), { headers: { "Content-Type": eleven ? "audio/mpeg" : "audio/wav", "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof JollyVoiceError) return NextResponse.json({ error: error.message, naturalVoice: true }, { status: 503 });
    console.error("Jolly speech generation unavailable");
    return NextResponse.json({ error: "Voice is unavailable" }, { status: 503 });
  }
}

