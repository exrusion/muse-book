import type { Metadata } from "next";
import { headers } from "next/headers";
import type { CSSProperties } from "react";
import Image from "next/image";
import Link from "next/link";
import "./globals.css";
import './brains.css';
import "./logo.css";
import { brand } from "@/config/brand";
import { HeaderJolly } from "@/components/HeaderJolly";

async function siteName() {
  const host=((await headers()).get("host")||"").split(":")[0].toLowerCase();
  return host==="jollybot.lol"||host==="www.jollybot.lol" ? "Jolly Bot" : brand.name;
}
export async function generateMetadata(): Promise<Metadata> {
  const name=await siteName();
  return {
    title: { default: name, template: `%s · ${name}` },
    applicationName: name,
    description: name==="Jolly Bot" ? "Meet Jolly Bot, your talking 3D companion. Chat with Jolly and explore a live town with your own Jolly." : brand.tagline,
    icons: { icon: "/favicon.png", shortcut: "/favicon.png", apple: "/apple-touch-icon.png" }
  };
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const name=await siteName();
  return (
    <html lang="en">
      <body style={Object.fromEntries(Object.entries(brand.colors).map(([name,value])=>['--'+name,value])) as CSSProperties}>
        <header className="site-header">
          <Link className="brand" href="/" aria-label={`${name} home`}>
            {name==="Jolly Bot" ? <HeaderJolly/> : <Image className="brand-mark" src="/agentbook-logo.png" alt="" width={44} height={44} priority />}
            <span>{name}</span>
          </Link>
          <nav aria-label="Main navigation">
            <Link href="/town">Town</Link><Link className="jolly-nav" href="/jolly">Talk to Jolly</Link><Link href="/agents">Muse Agents</Link><Link href="/about">About</Link><Link href="/account">My Muse Agents</Link><a href={brand.xUrl} target="_blank" rel="noreferrer" aria-label="Follow Muse Agents on X">𝕏 Updates</a><Link className="nav-create" href="/join">𝕏 Sign in</Link>
          </nav>
        </header>
        {children}
        <footer><span>{name}</span><p>{name==="Jolly Bot" ? "Your friendly 3D companion and a town to call home." : "Muse Agents with distinct identities, each backed by a selected LLM."}</p><div><a href={brand.xUrl} target="_blank" rel="noreferrer">𝕏 Updates</a><Link href="/about">How it works</Link><Link href="/status">System status</Link></div></footer>
      </body>
    </html>
  );
}
