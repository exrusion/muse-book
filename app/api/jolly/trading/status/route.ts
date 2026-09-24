import {formatEther} from 'viem';
import {db} from '@/lib/db';
import {tradeIdentity,failure} from '@/lib/trading/auth';
import {liveReady,walletReady} from '@/lib/trading/wallet';
import type {AgentRow,PositionRow,OrderRow} from '@/lib/trading/store';
export const dynamic='force-dynamic';
export async function GET(){try{
 const identity=await tradeIdentity();const [worker]=await db()`select updated_at from jolly_trade_engine where key='heartbeat'`;
 const common={authenticated:!!identity,identity:identity?.name||null,liveReady:liveReady(),walletReady:walletReady(),workerOnline:!!worker&&Date.now()-new Date(worker.updated_at).getTime()<120000};
 if(!identity)return Response.json({...common,agents:[],positions:[],orders:[]},{headers:{'Cache-Control':'no-store'}});
 const [agents,positions,orders]=await Promise.all([
 db()<AgentRow[]>`select * from jolly_trade_agents where owner_key=${identity.key} order by created_at`,
 db()<PositionRow[]>`select p.* from jolly_trade_positions p join jolly_trade_agents a on a.id=p.agent_id where a.owner_key=${identity.key} and p.status='open' order by p.opened_at desc`,
 db()<OrderRow[]>`select o.id,o.agent_id,o.kind,o.status,o.amount,o.symbol,o.tx_hash,o.created_at from jolly_trade_orders o join jolly_trade_agents a on a.id=o.agent_id where a.owner_key=${identity.key} order by o.created_at desc limit 40`]);
 const eth=(v:string)=>formatEther(BigInt(v));
 return Response.json({...common,agents:agents.map(a=>({id:a.id,template:a.template,modelId:a.model_id,shareDiscussions:a.share_discussions,discussionEnabled:a.discussion_enabled,mode:a.mode,status:a.status,settings:a.settings,walletAddress:a.wallet_address,cashEth:eth(a.cash),equityEth:eth(a.equity),dailyPnlEth:eth(a.daily_pnl),realizedEth:eth(a.realized),blockedReason:a.blocked_reason,updatedAt:a.updated_at.toISOString()})),positions:positions.map(p=>({id:p.id,agentId:p.agent_id,symbol:p.symbol,token:p.token,entryEth:eth(p.entry),markEth:eth(p.mark),openedAt:p.opened_at.toISOString(),status:p.status})),orders:orders.map(o=>({id:o.id,agentId:o.agent_id,kind:o.kind,status:o.status,amountEth:eth(o.amount),symbol:o.symbol,txHash:o.tx_hash,createdAt:o.created_at.toISOString()}))},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return failure(e);}}
