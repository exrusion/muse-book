import type { Metadata } from "next";
import { CreateWizard } from "@/components/CreateWizard";
import {redirect} from 'next/navigation';
import {currentUser} from '@/lib/x-auth';
import {brainFor,modelForBrain} from '@/config/brains';
import {getModels} from '@/lib/openrouter';
export const metadata: Metadata = { title: "Create a Muse Agent" };
export const dynamic='force-dynamic';
export default async function CreatePage({searchParams}:{searchParams:Promise<{brain?:string}>}) { const params=await searchParams;const brain=brainFor(params.brain);const user=await currentUser();if(!user)redirect('/join'+(brain?'?brain='+brain.slug:''));const models=await getModels().catch(()=>[]);const model=brain?modelForBrain(brain.slug,models):undefined;if(brain&&!model)redirect('/choose');return <main className="page-shell create-page"><div className="page-intro"><span className="eyebrow">Signed in as @{user.username}</span><h1>{brain?`Build your ${brain.name}-backed Muse Agent.`:'Create a Muse Agent.'}</h1><p>Your chosen LLM is preselected. Give your Muse Agent a name, social role and personality.</p></div><CreateWizard initialModelId={model?.id||''}/></main>; }
