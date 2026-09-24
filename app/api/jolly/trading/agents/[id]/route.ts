import {TRADING_MODELS,discuss,postDecision} from '@/lib/trading/discussion';
import {market,scan} from '@/lib/trading/chain';
import {formatEther} from 'viem';
import {getAddress,parseEther,verifyMessage,isAddress} from 'viem';
import {z} from 'zod';
import {db} from '@/lib/db';
import {settingsSchema} from '@/lib/trading/shared';
import {body,failure,requireIdentity,requireOrigin} from '@/lib/trading/auth';
import {locked,owned,positions,pending,TradeError} from '@/lib/trading/store';
import {liveReady,provision} from '@/lib/trading/wallet';
import {refreshAccount} from '@/lib/trading/engine';
import {sell,withdraw} from '@/lib/trading/execution';
import {withdrawalMessage} from '@/lib/trading/withdrawal';
export const dynamic='force-dynamic';
export async function POST(request:Request,context:{params:Promise<{id:string}>}){try{
 requireOrigin(request);const identity=await requireIdentity(),b=await body(request),{id}=await context.params;
 if(!z.uuid().safeParse(id).success)throw new TradeError('Agent not found.',404);
 return await locked('trade:'+id,async()=>{
  let a=await owned(id,identity.key);
  if(b.action==='pause'){await db()`update jolly_trade_agents set status=case when status='review' then 'review' else 'paused' end,updated_at=now() where id=${id}`;return Response.json({ok:true});}
  if(a.status==='review')throw new TradeError('This agent needs transaction reconciliation before changes can be made.',409);
  if((await pending(id)).length)throw new TradeError('Wait for the pending transaction to finish.',409);
  if(b.action==='analyze'){
   if(!isAddress(b.token))throw new TradeError('Enter a Pons token contract address.');
   const [recent]=await db()`select id from jolly_trade_discussions where agent_id=${id} and kind in ('BUY','WAIT','REVIEWING') and created_at>now()-interval '30 seconds' limit 1`;
   if(recent)throw new TradeError('Give your agent a moment before its next review.',429);
   await postDecision(a,'REVIEWING','I’m checking on-chain liquidity and quotes for this coin. This review will not place a trade.',{token:b.token});
   try{await scan();const [pool]=await db()`select * from jolly_trade_tokens where token=${b.token.toLowerCase()}`;if(!pool)throw new TradeError('This token was not found in verified Pons launches.');const m=await market(pool.token,pool.curve);await discuss(a,{token:b.token,symbol:m.symbol,liquidity:formatEther(m.liquidity),ageMinutes:null,quoteChange:null});}catch(e){await postDecision(a,'WAIT',e instanceof TradeError?e.message:'I could not verify a fresh market quote. I will wait.',{token:b.token});throw e;}
   return Response.json({ok:true});
  }
  if(b.action==='settings'){
   if(a.status==='running')throw new TradeError('Pause entries before changing limits.');
   const model=typeof b.modelId==='string'?b.modelId:a.model_id;if(!TRADING_MODELS.some(m=>m.id===model))throw new TradeError('Choose an available AI brain.');
   const settings=settingsSchema.safeParse(b.settings);if(!settings.success)throw new TradeError(settings.error.issues[0]?.message||'Check your limits.');
   const open=await positions(id),exposure=open.reduce((s,p)=>s+BigInt(p.entry),0n);
   if(exposure>parseEther(settings.data.budgetEth))throw new TradeError('The new budget is below your current open positions. Close positions first.');
   await db()`update jolly_trade_agents set settings=${db().json(settings.data)},model_id=${model},share_discussions=${b.shareDiscussions===true},discussion_enabled=${b.discussionEnabled!==false},updated_at=now() where id=${id}`;return Response.json({ok:true});
  }
  if(b.action==='wallet'){await provision(a);return Response.json({ok:true});}
  if(b.action==='refresh'){await refreshAccount(a);return Response.json({ok:true});}
  if(b.action==='start'){
   const [worker]=await db()`select updated_at from jolly_trade_engine where key='heartbeat'`;
   if(!worker||Date.now()-new Date(worker.updated_at).getTime()>120000)throw new TradeError('Trading worker is offline. Try again shortly.',503);
   if(a.mode==='live'&&(!liveReady()||!a.wallet_id||b.acceptRisk!==true))throw new TradeError('Live trading is not ready, or its risk acknowledgement is missing.',503);
   const r=await refreshAccount(a);a=r.a;if(!r.fresh)throw new TradeError('Waiting for fresh market prices.');
   if(BigInt(a.daily_pnl)<=-parseEther(a.settings.dailyLossEth))throw new TradeError('Daily loss limit reached. Resume after the UTC daily reset.');
   if(BigInt(a.cash)<parseEther(a.settings.tradeEth)+(a.mode==='live'?parseEther('0.003'):0n))throw new TradeError('Add enough ETH for your trade size and gas reserve.');
   await db()`update jolly_trade_agents set status='running',blocked_reason='Looking for a suitable Pons launch',updated_at=now() where id=${id}`;return Response.json({ok:true});
  }
  if(b.action==='close'){
   const p=(await positions(id)).find(p=>p.id===b.positionId);if(!p)throw new TradeError('Position not found.',404);await sell(a,p);return Response.json({ok:true});
  }
  if(b.action==='withdraw'){
   const expires=Number(b.expires);
   if(!isAddress(b.address)||!z.uuid().safeParse(b.requestId).success||!Number.isFinite(expires)||expires<Date.now()||expires>Date.now()+300000||typeof b.signature!=='string'||!/^0x[0-9a-f]{130}$/i.test(b.signature)||typeof b.amount!=='string'||!/^(0|[1-9]\d{0,3})(\.\d{1,8})?$/.test(b.amount))throw new TradeError('Withdrawal authorisation expired or is invalid.');
   const address=getAddress(b.address),message=withdrawalMessage(id,address,b.amount,b.requestId,expires);
   if(!await verifyMessage({address,message,signature:b.signature}))throw new TradeError('Please sign with your receiving wallet.');
   const order=await withdraw(a,parseEther(b.amount),address,b.requestId);return Response.json({ok:true,txHash:order.tx_hash});
  }
  throw new TradeError('Unknown action.');
 });
 }catch(e){return failure(e);}}
