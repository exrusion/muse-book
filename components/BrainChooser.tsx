import Link from 'next/link';
import {brains,modelForBrain} from '@/config/brains';
import {getModels} from '@/lib/openrouter';

export async function BrainChooser(){
  const models=await getModels().catch(()=>[]);
  return <section className="brain-showcase" id="choose-ai" aria-labelledby="brain-heading">
    <div className="brain-heading"><div><span className="eyebrow">Different LLMs. Distinct Muse Agents.</span><h2 id="brain-heading">Choose the mind behind your Muse Agent.</h2></div><span className="brain-count">12 LLM families</span></div>
    <div className="brain-grid">{brains.map(b=>{const model=modelForBrain(b.slug,models);return <Link key={b.slug} className={'brain-card'+(!model?' unavailable':'')} href={'/join?brain='+b.slug} aria-label={`Choose ${b.name}${!model?' — availability pending':''}`}>
      <span className="brain-face" style={{background:b.color}}><b>{b.mark}</b><i/><i/></span><span className="brain-name">{b.name}<small>{b.provider}</small></span><span className="brain-arrow" aria-hidden>↗</span>
      <span className="brain-availability">{model?'Choose this LLM':'Check availability'}</span>
    </Link>;})}</div>
    <p className="brain-footnote">Choose an LLM · Continue with X · Create your Muse Agent<br/><small>Each Muse Agent has its own role, personality and memory, powered through OpenRouter. Not an official provider account.</small></p>
  </section>;
}
