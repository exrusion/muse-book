import {discuss,postDecision} from './discussion';
import {formatEther,parseEther,getAddress} from 'viem';
import {db} from '../db';
import {AGENTS,settingsSchema} from './shared';
import {entryBlock,exitReason,GAS_RESERVE,PAPER_GAS} from './risk';
import {market,rpc,scan,tokenAbi} from './chain';
import {locked,positions,pending,TradeError,type AgentRow,type PositionRow} from './store';
import {liveReady} from './wallet';
import {buy,sell,reconcile,unwrap,graduatedQuote,WETH} from './execution';
async function block(id:string,reason:string|null){const [a]=await db()<AgentRow[]>`update jolly_trade_agents set blocked_reason=${reason},updated_at=now() where id=${id} and blocked_reason is distinct from ${reason} returning *`;if(a&&reason)await postDecision(a,'STATUS',reason);}
export async function refreshAccount(a:AgentRow){
 const ps=await positions(a.id);let fresh=true;
 for(const p of ps){try{const m=await market(p.token,p.curve);let mark=m.sell(BigInt(p.amount));if(m.graduated){if(a.mode==='paper')throw new Error('graduated');mark=(await graduatedQuote(a,p)).minimum;}
  await db()`update jolly_trade_positions set mark=${mark.toString()},marked_at=now() where id=${p.id}`;p.mark=mark.toString();p.marked_at=new Date();
 }catch{fresh=false;}}
 const unrealized=ps.reduce((v,p)=>v+BigInt(p.mark)-BigInt(p.entry),0n);
 const today=new Date().toISOString().slice(0,10);
 if(a.day_key!==today){
  // Do not establish a new baseline from stale prices: entries remain blocked.
  if(!fresh)return {a,ps,fresh:false};
  await db()`update jolly_trade_agents set day_key=${today},day_start_mark=${unrealized.toString()},day_realized=0,day_spend=0,day_trades=0 where id=${a.id}`;
  a={...a,day_key:today,day_start_mark:unrealized.toString(),day_realized:'0',day_spend:'0',day_trades:0};
 }
 let cash=BigInt(a.paper_cash),wrapped=0n;
 if(a.mode==='live'){
  if(!a.wallet_address)return {a,ps,fresh:false};
  [cash,wrapped]=await Promise.all([rpc().getBalance({address:getAddress(a.wallet_address)}),rpc().readContract({address:WETH,abi:tokenAbi,functionName:'balanceOf',args:[getAddress(a.wallet_address)]})]);
 }
 const equity=cash+wrapped+ps.reduce((v,p)=>v+BigInt(p.mark),0n);
 const dailyPnl=BigInt(a.day_realized)+unrealized-BigInt(a.day_start_mark);
 await db()`update jolly_trade_agents set cash=${cash.toString()},equity=${equity.toString()},daily_pnl=${dailyPnl.toString()},updated_at=now() where id=${a.id}`;
 return {a:{...a,cash:cash.toString(),equity:equity.toString(),daily_pnl:dailyPnl.toString(),updated_at:new Date()},ps,fresh};
}
async function socialReview(a:AgentRow){
 if(!a.discussion_enabled)return;
 if(a.next_discussion_at&&new Date(a.next_discussion_at).getTime()>Date.now())return;
 await db()`update jolly_trade_agents set next_discussion_at=now()+interval '5 minutes' where id=${a.id}`;
 const candidates=await db()`select * from jolly_trade_tokens where launched_at>now()-interval '24 hours' order by checked_at desc nulls last,launched_at desc limit 3`;
 for(const t of candidates){try{const m=await market(t.token,t.curve);if(m.liquidity<=0n)continue;await discuss(a,{token:t.token,symbol:m.symbol,liquidity:formatEther(m.liquidity),ageMinutes:Math.floor((Date.now()-new Date(t.launched_at).getTime())/60000),quoteChange:null});return;}catch{continue;}}
 await postDecision(a,'STATUS','I’m waiting for a verified coin quote. Trading is paused; these reviews will not submit orders.');
}
export async function tickAgent(id:string){
 await locked('trade:'+id,async()=>{
  let [a]=await db()<AgentRow[]>`select * from jolly_trade_agents where id=${id}`;if(!a)return;
  a.settings=settingsSchema.parse(a.settings);
  if(a.day_key!==new Date().toISOString().slice(0,10)){const rolled=await refreshAccount(a);if(!rolled.fresh){await block(id,'Waiting for fresh prices for the daily reset');return;}a=rolled.a;}
  if(a.mode==='live')await reconcile(a);
  [a]=await db()<AgentRow[]>`select * from jolly_trade_agents where id=${id}`;
  const refreshed=await refreshAccount(a);a=refreshed.a;
  if((await pending(id)).length){await block(id,'Waiting for transaction confirmation');return;}
  if(a.status==='review')return;
  if(a.mode==='live'&&a.wallet_address&&await unwrap(a)){await block(id,'Converting exit proceeds to ETH');return;}
  const breached=BigInt(a.daily_pnl)<=-parseEther(a.settings.dailyLossEth);
  if(breached){await db()`update jolly_trade_agents set status='loss_limit',blocked_reason='Daily loss limit reached. New entries are stopped; exits remain active.' where id=${id}`;a.status='loss_limit';}
  // Pausing blocks new buys. Existing stop-loss and exit rules continue to run.
  for(const p of refreshed.ps){
   if(Date.now()-p.marked_at.getTime()>45000)continue;
   let reason=breached?'Daily loss limit':exitReason(a.settings,BigInt(p.entry),BigInt(p.mark),p.opened_at);
   if(!reason){const m=await market(p.token,p.curve);if(m.graduated)reason='Pool graduated';}
   if(reason){await sell(a,p);await block(id,reason+' exit submitted');return;}
  }
  if(a.status!=='running'){await socialReview(a);return;}
  if(a.mode==='live'&&!liveReady()){await block(id,'Live entries are disabled by the operator');return;}
  const policy=AGENTS.find(x=>x.id===a.template)!;
  const since=Math.max(a.last_entry_at?.getTime()||0,a.last_review_at?.getTime()||0);
  if(Date.now()-since<policy.interval*1000)return;
  const exposure=refreshed.ps.reduce((s,p)=>s+BigInt(p.entry),0n);
  const blocked=entryBlock(a.settings,{cash:BigInt(a.cash),exposure,dailySpend:BigInt(a.day_spend),dailyPnl:BigInt(a.daily_pnl),trades:a.day_trades,positions:refreshed.ps.length,pending:false,fresh:refreshed.fresh,gas:a.mode==='paper'?PAPER_GAS:GAS_RESERVE});
  if(blocked){await block(id,blocked);return;}
  await db()`update jolly_trade_agents set last_review_at=now() where id=${id}`;
  const tokens=await db()`select * from jolly_trade_tokens where launched_at<now()-${policy.minAge}*interval '1 second' and launched_at>now()-interval '24 hours' order by checked_at asc nulls first,launched_at desc limit 6`;
  for(const t of tokens){
   if(refreshed.ps.some(p=>p.token===t.token))continue;
   const m=await market(t.token,t.curve),unit=m.buy(parseEther('0.001'));
   const previous=t.prior_quote?BigInt(t.prior_quote):null;
   await db()`update jolly_trade_tokens set symbol=${m.symbol},prior_quote=${unit.toString()},checked_at=now() where token=${t.token}`;
   if(m.graduated||m.fees>800n||m.liquidity<parseEther(String(policy.minLiquidity))||unit<=0n)continue;
   // Fewer tokens per fixed ETH indicates price appreciation. Large jumps are skipped.
   const change=previous&&unit?Number((previous-unit)*10000n/unit)/100:null;
   if(a.template==='momentum'&&(change===null||change<1||change>15))continue;
   const approved=await discuss(a,{symbol:m.symbol,token:t.token,liquidity:formatEther(m.liquidity),ageMinutes:Math.floor((Date.now()-new Date(t.launched_at).getTime())/60000),quoteChange:change});
   if(!approved){await block(id,'Your agent is waiting for a clearer signal');return;}
   // Re-read balance and limits after the model request, before creating any order.
   const cash=a.mode==='live'?await rpc().getBalance({address:getAddress(a.wallet_address!)}):BigInt(a.cash);
   const check=entryBlock(a.settings,{cash,exposure,dailySpend:BigInt(a.day_spend),dailyPnl:BigInt(a.daily_pnl),trades:a.day_trades,positions:refreshed.ps.length,pending:(await pending(id)).length>0,fresh:Date.now()-refreshed.a.updated_at.getTime()<120000,gas:a.mode==='paper'?PAPER_GAS:GAS_RESERVE});
   if(check){await block(id,check);return;}
   await buy(a,t.token,t.curve);await block(id,a.mode==='paper'?'Practice entry recorded':'Entry submitted');return;
  }
  await block(id,'Scanning for a Pons launch that meets your agent’s filters');
 });
}
export async function tradingCycle(trace=false){
 await locked('jolly-trading-engine',async()=>{
  if(trace)console.log('Jolly trading engine lock acquired');
  await db()`insert into jolly_trade_engine(key,value) values('heartbeat','{}') on conflict(key) do update set updated_at=now()`;
  if(trace)console.log('Jolly trading heartbeat saved');
  const rows=await db()`select id,status from jolly_trade_agents a where status='running' or (status='paused' and discussion_enabled=true and next_discussion_at<now()) or exists(select 1 from jolly_trade_positions p where p.agent_id=a.id and p.status='open') or exists(select 1 from jolly_trade_orders o where o.agent_id=a.id and o.status in ('preparing','signed','broadcast','review')) order by updated_at asc limit 30`;
  if(trace)console.log('Jolly trading active accounts: '+rows.length);
  if(rows.length){try{await scan();}catch{await db()`insert into jolly_trade_engine(key,value) values('scanner_status','{"ok":false}') on conflict(key) do update set value=excluded.value,updated_at=now()`;}}
  for(const row of rows){try{await tickAgent(row.id);}catch(e){if(e instanceof TradeError&&e.status===409)continue;await block(row.id,e instanceof TradeError?e.message:'Market or wallet service unavailable. New actions are waiting.');}}
  await db()`update jolly_trade_engine set updated_at=now() where key='heartbeat'`;
 });
}
