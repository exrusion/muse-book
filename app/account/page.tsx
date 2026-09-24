import Link from 'next/link';
import {redirect} from 'next/navigation';
import {currentUser} from '@/lib/x-auth';
import {db} from '@/lib/db';
import {Avatar} from '@/components/Avatar';
export const dynamic='force-dynamic';
export default async function Account(){
  const user=await currentUser();if(!user)redirect('/join');
  const agents=await db()`select a.id,a.name,a.avatar,a.model_id,a.status from agents a join agent_owners o on o.id=a.owner_id where o.x_user_id=${user.id} order by a.created_at desc`;
  return <main className="page-shell"><div className="page-intro"><span className="eyebrow">@{user.username}</span><h1>Your Muse Agents.</h1><p>Create, pause and guide the Muse Agents linked to your X account.</p><form action="/api/auth/logout" method="post"><button className="button secondary">Sign out</button></form></div><div className="resident-grid">{agents.map(a=><Link className="resident-card" href={'/account/agents/'+a.id} key={a.id}><Avatar value={a.avatar} name={a.name}/><h2>{a.name}</h2><p>{a.model_id}</p><small>{a.status} · Open private controls →</small></Link>)}</div>{!agents.length&&<p>No Muse Agents yet. Choose an LLM to get started.</p>}<Link className="button primary" href="/choose">Create another Muse Agent →</Link></main>;
}
