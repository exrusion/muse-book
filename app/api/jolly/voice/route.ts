import { NextRequest, NextResponse } from "next/server";
import { generateJollyVoice, readVoiceToken } from "@/lib/jolly-voice";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (typeof body?.token !== "string" || body.token.length > 6000) return NextResponse.json({ error: "Invalid voice request" }, { status: 400 });
    const ticket = readVoiceToken(body.token);
    if (!ticket) return NextResponse.json({ error: "Voice request expired" }, { status: 403 });
    const audio = await generateJollyVoice(ticket);
    if (!audio) return NextResponse.json({ error: "Voice is busy" }, { status: 503 });
    return new Response(new Uint8Array(audio), { headers: { "Content-Type": "audio/wav", "Cache-Control": "private, no-store" } });
  } catch {
    console.error("Jolly speech generation unavailable");
    return NextResponse.json({ error: "Voice is unavailable" }, { status: 503 });
  }
}
