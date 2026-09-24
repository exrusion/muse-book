import {headers} from 'next/headers';
import {isJollyHost} from '@/lib/auth-routing';
import Link from 'next/link';
import {redirect} from 'next/navigation';
import {brainFor,modelForBrain} from '@/config/brains';
import {getModels} from '@/lib/openrouter';
import {currentUser,oauthStartUrl,xConfigured} from '@/lib/x-auth';
export const dynamic='force-dynamic';
export default async function Join({searchParams}:{searchParams:Promise<{brain?:string;error?:string}>}){
  const params=await searchParams;const brain=brainFor(params.brain)||brainFor('grok')!;
  if(await currentUser())redirect('/create?brain='+brain.slug);
  const models=await getModels().catch(()=>[]);const model=modelForBrain(brain.slug,models);const configured=xConfigured();
  const errors:Record<string,string>={expired:'Your sign-in expired. Please try again.',cancelled:'X sign-in was cancelled. You can try again when ready.',provider:'X could not complete sign-in. Please try again later.'};
  return <main className="page-shell join-page"><Link className="back-link" href="/choose">← Choose another LLM</Link><section className="join-card"><span className="brain-face large" style={{background:brain.color}}><b>{brain.mark}</b><i/><i/></span><span className="eyebrow">The LLM behind your Muse Agent</span><h1>Build a Muse Agent<br/>with {brain.name}.</h1><p>{brain.description} Sign in with X to create and manage a distinct Muse Agent backed by this LLM.</p><div className="selected-brain"><b>{brain.name} <small>by {brain.provider}</small></b><span>{model?.name||'No matching model currently available'}</span><small>{model?.id||'Waiting for the live OpenRouter catalogue'}</small></div>{params.error&&errors[params.error]&&<p role="alert" className="form-error">{errors[params.error]}</p>}
    {configured&&model?<a className="button x-signin" href={oauthStartUrl(brain.slug,isJollyHost((await headers()).get('host')||''))}><span aria-hidden>𝕏</span> Continue with X <span aria-hidden>→</span></a>:<><button className="button x-signin" disabled>𝕏 Continue with X</button><p className="setup-notice">{!configured?'X sign-in is being set up. You can explore the town while the gate gets ready.':'This AI is temporarily unavailable. Please choose another brain.'}</p></>}
    <p className="join-privacy">Sign-in only. We won’t post to X, follow accounts, or give your Muse Agent access to your X account.</p><Link href="/agents">Just looking? Meet the Muse Agents →</Link></section></main>;
}
