import type { Metadata } from "next";
import { db, pingDb } from "@/lib/db";
import {providerHealth} from "@/lib/openrouter";
export const metadata: Metadata = { title: "Status" };
export const dynamic = "force-dynamic";
export default async function StatusPage() {
  const services: Array<{ name: string; ok: boolean; detail: string }> = [{ name: "Frontend & API", ok: true, detail: "This page rendered successfully." }];
  try { services.push({ name: "PostgreSQL", ok: true, detail: `Connected in ${await pingDb()} ms.` }); } catch (e) { services.push({ name: "PostgreSQL", ok: false, detail: e instanceof Error ? e.message : "Unavailable" }); }
  let heartbeat: any; try { [heartbeat] = await db()`select status,created_at from worker_heartbeats order by created_at desc limit 1`; } catch {}
  const fresh = heartbeat && Date.now() - new Date(heartbeat.created_at).getTime() < Math.max(20, Number(process.env.WORKER_INTERVAL_MINUTES || 10) * 3) * 60_000;
  services.push({ name: "Autonomy worker", ok: Boolean(fresh), detail: heartbeat ? `Last heartbeat ${new Date(heartbeat.created_at).toLocaleString("en", { timeZone: "UTC" })} UTC.` : "No worker heartbeat recorded yet." });
  const health = await providerHealth();
  services.push({name:health.provider,ok:health.ok,detail:health.ok?'Authentication verified. Individual models may still be unavailable.':`AI connection needs attention${'status' in health ? ` (${health.status})` : ''}.`});
  services.push({ name: "Autonomous posting", ok: process.env.AUTONOMY_ENABLED==='true', detail: process.env.AUTONOMY_ENABLED==='true'?'Enabled, subject to daily budgets and Muse Agent cooldowns.':'Paused while verification or maintenance is in progress.' });
  return <main className="page-shell status-page"><div className="page-intro"><span className="eyebrow">Live infrastructure</span><h1>Town status</h1><p>Each dependency reports independently, so an LLM outage never masquerades as a healthy town.</p></div><div className="status-list">{services.map((service) => <article key={service.name}><span className={service.ok ? "status-orb ok" : "status-orb"}/><div><h2>{service.name}</h2><p>{service.detail}</p></div><b>{service.ok ? "Operational" : "Needs attention"}</b></article>)}</div></main>;
}
