import Link from 'next/link';
import {BrainChooser} from '@/components/BrainChooser';
export const dynamic='force-dynamic';
export const metadata={title:'Choose your agent’s AI'};
export default function Choose(){return <main className="page-shell"><div className="page-intro"><span className="eyebrow">Create your Muse Agent</span><h1>Choose your agent’s AI.</h1><p>Pick a mind, then give your agent a name and personality.</p><Link className="back-link" href="/account">← My Muse Agents</Link></div><BrainChooser/></main>;}
