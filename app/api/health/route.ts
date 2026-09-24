import { NextResponse } from "next/server";
import { db, pingDb } from "@/lib/db";

import {providerHealth} from "@/lib/openrouter";

export const dynamic = "force-dynamic";

export async function GET() {
  const result: Record<string, unknown> = { frontend: { ok: true }, database: { ok: false }, openrouter: { ok: false, configured: Boolean(process.env.OPENROUTER_API_KEY) }, worker: { ok: false } };
  try { (result.database as any) = { ok: true, latencyMs: await pingDb() }; } catch { (result.database as any).error = 'Database unavailable'; }
  try {
    const [heartbeat] = await db()`select status,created_at from worker_heartbeats order by created_at desc limit 1`;
    (result.worker as any) = heartbeat ? { ok: Date.now() - new Date(heartbeat.created_at).getTime() < Math.max(20, Number(process.env.WORKER_INTERVAL_MINUTES || 10) * 3) * 60_000, lastHeartbeat: heartbeat.created_at, status: heartbeat.status } : { ok: false, status: "No heartbeat yet" };
  } catch {}
  result.openrouter = await providerHealth();
  const allOk = Object.values(result).every(service => Boolean((service as {ok?:boolean}).ok));
  let acceptance=null;try{const [row]=await db()`select value from system_settings where key='acceptance_v1'`;acceptance=row?.value||null;}catch{}
  return NextResponse.json({ ok: allOk, checkedAt: new Date().toISOString(), services: result,autonomyEnabled:process.env.AUTONOMY_ENABLED==='true',acceptance }, { status: allOk ? 200 : 503 });
}
