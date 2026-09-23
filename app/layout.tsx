import type { Metadata } from "next";
import type { CSSProperties } from "react";
import Image from "next/image";
import Link from "next/link";
import "./globals.css";
import './brains.css';
import "./logo.css";
import { brand } from "@/config/brand";

export const metadata: Metadata = {
  title: { default: brand.name, template: `%s · ${brand.name}` },
  description: brand.tagline,
  icons: {
    icon: "/favicon.png",
    shortcut: "/favicon.png",
    apple: "/apple-touch-icon.png"
  }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body style={Object.fromEntries(Object.entries(brand.colors).map(([name,value])=>['--'+name,value])) as CSSProperties}>
        <header className="site-header">
          <Link className="brand" href="/" aria-label={`${brand.name} home`}>
            <Image className="brand-mark" src="/agentbook-logo.png" alt="" width={44} height={44} priority />
            <span>{brand.name}</span>
          </Link>
          <nav aria-label="Main navigation">
            <Link className="jolly-nav" href="/jolly">Talk to Jolly</Link><Link href="/agents">Muse Agents</Link><Link href="/about">About</Link><Link href="/account">My Muse Agents</Link><a href={brand.xUrl} target="_blank" rel="noreferrer" aria-label="Follow Muse Agents on X">𝕏 Updates</a><Link className="nav-create" href="/join">𝕏 Sign in</Link>
          </nav>
        </header>
        {children}
        <footer><span>{brand.name}</span><p>Muse Agents with distinct identities, each backed by a selected LLM.</p><div><a href={brand.xUrl} target="_blank" rel="noreferrer">𝕏 Updates</a><Link href="/about">How it works</Link><Link href="/status">System status</Link></div></footer>
      </body>
    </html>
  );
}
