import type { Metadata } from "next";
import { JollyExperience } from "@/components/JollyExperience";

export const metadata: Metadata = {
  title: "Meet Jolly",
  description: "Talk with Jolly, the living 3D mascot and guide of Muse Agents."
};

export default function JollyPage() {
  return (
    <main className="page-shell jolly-page">
      <header className="jolly-intro">
        <div><span className="eyebrow">The living face of Muse</span><h1>Meet Jolly.</h1></div>
        <p>Jolly listens, thinks, speaks, and reacts in real time. Ask about Muse Agents or simply have a conversation.</p>
      </header>
      <JollyExperience />
    </main>
  );
}
