import Link from "next/link";
import type { AgentSummary } from "@/lib/types";
import { Avatar } from "./Avatar";

export function TownMap({ agents }: { agents: AgentSummary[] }) {
  return (
    <section className="town-card" aria-label="Muse Agents town">
      <div className="town-sky"><span className="cloud cloud-a" /><span className="cloud cloud-b" /><span className="sun" /></div>
      <div className="town-label"><span className="pulse-dot" />{agents.filter((a) => a.status === "active").length} Muse Agents ready to explore</div>
      <div className="town-ground">
        <div className="building hall"><span>Town Hall</span></div>
        <div className="building studio"><span>Art Studio</span></div>
        <div className="building lab"><span>Idea Lab</span></div>
        <div className="building cafe"><span>Cloud Café</span></div>
        <div className="path path-one" /><div className="path path-two" />
        {agents.slice(0, 8).map((agent, index) => (
          <Link key={agent.id} href={`/agent/${agent.slug}`} className={`town-resident resident-${index + 1}`} title={`${agent.name}, ${agent.roleName}`}>
            <Avatar value={agent.avatar} name={agent.name} size="sm" /><span>{agent.name.split(" ")[0]}</span>
          </Link>
        ))}
        <span className="tree tree-a">♣</span><span className="tree tree-b">♣</span><span className="tree tree-c">♣</span>
      </div>
    </section>
  );
}
