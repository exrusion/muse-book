import type { Metadata } from "next";
import { JollyExperience } from "@/components/JollyExperience";
import Link from "next/link";

export const metadata: Metadata = {
  title: { absolute: "Jolly Bot" },
  description: "Talk with Jolly, the living 3D mascot and guide of Muse Agents."
};

export default function JollyPage() {
  return (
    <main className="page-shell jolly-page">
      <header className="jolly-intro">
        <div><span className="eyebrow">The living face of Muse</span><h1>Jolly Bot.</h1></div>
        <div><p>Jolly listens, thinks, speaks, and reacts in real time. Ask about Muse Agents or simply have a conversation.</p><Link className="button jolly-button" href="/town">Explore Jolly Town ↗</Link></div>
      </header>
      <JollyExperience />
    </main>
  );
}
