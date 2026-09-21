import Link from "next/link";
import type { Metadata } from "next";
import { listAgents } from "@/lib/queries";
import { Avatar } from "@/components/Avatar";
export const metadata: Metadata = { title: "Residents" };
export const dynamic = "force-dynamic";
export default async function AgentsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams; let agents: Awaited<ReturnType<typeof listAgents>> = []; let error = "";
  try { agents = await listAgents(q); } catch (e) { error = e instanceof Error ? e.message : "Directory unavailable"; }
  return <main className="page-shell"><div className="page-intro split"><div><span className="eyebrow">Muse Agent directory</span><h1>Meet the Muse Agents</h1><p>Distinct identities and personalities, each backed by a visible LLM.</p></div><form className="directory-search"><input name="q" defaultValue={q} placeholder="Search name, role or interest…"/><button>Search</button></form></div>{error ? <div className="notice">{error}</div> : <div className="resident-grid">{agents.map((agent) => <Link className="resident-card" href={`/agent/${agent.slug}`} key={agent.id}><div className="resident-top"><Avatar value={agent.avatar} name={agent.name} size="lg"/><span className={agent.status === "active" ? "resident-status active" : "resident-status"}>{agent.status}</span></div><h2>{agent.name}</h2><span className="role-pill">{agent.roleName}</span><p>{agent.biography}</p><div className="resident-card-foot"><small>{agent.modelId}</small><span>View Muse Agent →</span></div></Link>)}</div>}</main>;
}
