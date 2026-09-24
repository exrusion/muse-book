import {db} from '../db';
import postgres from 'postgres';
import type {Settings,Mode} from './shared';
export type AgentRow={id:string;owner_key:string;template:string;model_id:string;share_discussions:boolean;discussion_enabled:boolean;next_discussion_at:Date;mode:Mode;status:string;settings:Settings;wallet_id:string|null;wallet_address:string|null;paper_cash:string;cash:string;equity:string;realized:string;day_key:string;day_start_mark:string;day_realized:string;daily_pnl:string;day_spend:string;day_trades:number;blocked_reason:string|null;last_entry_at:Date|null;last_review_at:Date|null;updated_at:Date};
export type PositionRow={id:string;agent_id:string;token:string;curve:string;symbol:string;amount:string;entry:string;mark:string;status:string;opened_at:Date;marked_at:Date};
export type OrderRow={id:string;agent_id:string;kind:'buy'|'sell'|'withdraw'|'approve'|'unwrap';status:string;request_key:string;token:string|null;curve:string|null;symbol:string|null;position_id:string|null;amount:string;token_amount:string|null;minimum_out:string|null;destination:string|null;tx_hash:string|null;signed_tx:string|null;gas_paid:string;created_at:Date};
// Every account mutation and worker action shares this cross-process lock.
// Keep lock sessions separate from the query pool. Its 20-second idle eviction
// can race the worker's next reservation; session locks must not be evicted.
let lockPool:ReturnType<typeof postgres>|undefined;
function locks(){
 if(!process.env.DATABASE_URL)throw new Error('Database unavailable');
 return lockPool||=postgres(process.env.DATABASE_URL,{max:8,idle_timeout:0,max_lifetime:0,connect_timeout:15,ssl:process.env.NODE_ENV==='production'?'require':undefined});
}
export async function locked<T>(key:string,fn:()=>Promise<T>):Promise<T>{
 const connection=await locks().reserve();
 try{const [r]=await connection`select pg_try_advisory_lock(hashtextextended(${key},0)) as acquired`;if(!r.acquired)throw new TradeError('Your agent is processing another action. Try again shortly.',409);return await fn();}
 finally{try{await connection`select pg_advisory_unlock(hashtextextended(${key},0))`;}finally{connection.release();}}
}
export class TradeError extends Error{constructor(message:string,public status=400){super(message);}}
export async function owned(id:string,owner:string):Promise<AgentRow>{
 const [a]=await db()<AgentRow[]>`select * from jolly_trade_agents where id::text=${id} and owner_key=${owner}`;
 if(!a)throw new TradeError('Agent not found.',404);return a;
}
export async function positions(id:string){return db()<PositionRow[]>`select * from jolly_trade_positions where agent_id=${id} and status='open' order by opened_at`;}
export async function pending(id:string){return db()<OrderRow[]>`select * from jolly_trade_orders where agent_id=${id} and status in ('preparing','signed','broadcast','review') order by created_at`;}
