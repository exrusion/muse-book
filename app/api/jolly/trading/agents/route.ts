import {TRADING_MODELS,postDecision} from '@/lib/trading/discussion';
import type {AgentRow} from '@/lib/trading/store';
import {parseEther,formatEther} from 'viem';
import {db} from '@/lib/db';
import {AGENTS,settingsSchema} from '@/lib/trading/shared';
import {requireOrigin,requireIdentity,body,failure} from '@/lib/trading/auth';
import {locked,TradeError} from '@/lib/trading/store';
import {liveReady} from '@/lib/trading/wallet';
export const dynamic='force-dynamic';
export async function POST(request:Request){try{
 requireOrigin(request);const identity=await requireIdentity(),b=await body(request);
 if(!AGENTS.some(a=>a.id===b.template)||!['paper','live'].includes(b.mode))throw new TradeError('Choose an agent and trading mode.');
 const model=typeof b.modelId==='string'?b.modelId:'claude-haiku-4-5';if(!TRADING_MODELS.some(m=>m.id===model))throw new TradeError('Choose an available AI brain.');
 const settings=settingsSchema.safeParse(b.settings);if(!settings.success)throw new TradeError(settings.error.issues[0]?.message||'Check your limits.');
 if(b.mode==='live'&&!liveReady())throw new TradeError('Managed wallets are awaiting setup. Practice agents are available now.',503);
 const id=await locked('trade-owner:'+identity.key,async()=>{
 const rows=await db()`select id from jolly_trade_agents where owner_key=${identity.key}`;if(rows.length>=6)throw new TradeError('You already have all six agent slots.');
 const [existing]=await db()`select id from jolly_trade_agents where owner_key=${identity.key} and template=${b.template} and mode=${b.mode}`;if(existing)return existing.id;
 const cash=b.mode==='paper'?parseEther(settings.data.budgetEth).toString():'0';
 const [a]=await db()`insert into jolly_trade_agents(owner_key,template,mode,model_id,share_discussions,settings,paper_cash,cash,equity) values(${identity.key},${b.template},${b.mode},${model},${b.shareDiscussions===true},${db().json(settings.data)},${cash},${cash},${cash}) returning *`;await postDecision(a as AgentRow,'READY','I’m ready. Ask me to review a coin, or start me to watch launches within your limits. No trading starts until you choose Start.');return a.id;});
 return Response.json({id},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return failure(e);}}
