import {randomUUID} from 'node:crypto';
import {decodeEventLog,encodeFunctionData,getAddress,parseAbi,type Address,type Hex} from 'viem';
import {db} from '../db';
import {curveAbi,tokenAbi,rpc,market} from './chain';
import {TradeError,positions,pending,type AgentRow,type OrderRow,type PositionRow} from './store';
import {signAndBroadcast} from './wallet';
import {PAPER_GAS} from './risk';
import {bridgeReady,bridgeUrl,bridgeHeaders,exitProviderReady} from './provider';
export const WETH='0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73' as Address;
const wethAbi=parseAbi(['function withdraw(uint256)','event Withdrawal(address indexed src,uint256 wad)']);
export async function newOrder(a:AgentRow,data:{kind:OrderRow['kind'];amount:bigint;token?:string;curve?:string;symbol?:string;positionId?:string;tokenAmount?:bigint;minimum?:bigint;destination?:string;requestKey?:string}){
 const [o]=await db()<OrderRow[]>`insert into jolly_trade_orders(agent_id,kind,status,request_key,amount,token,curve,symbol,position_id,token_amount,minimum_out,destination) values(${a.id},${data.kind},'preparing',${data.requestKey||randomUUID()},${data.amount.toString()},${data.token||null},${data.curve||null},${data.symbol||null},${data.positionId||null},${data.tokenAmount?.toString()||null},${data.minimum?.toString()||null},${data.destination||null}) returning *`;return o;
}
export async function settle(a:AgentRow,o:OrderRow,output:bigint,gas:bigint,success=true){
 await db().begin(async sql=>{
  const [locked]=await sql`select status from jolly_trade_orders where id=${o.id} for update`;
  if(!locked||['confirmed','failed'].includes(locked.status))return;
  await sql`update jolly_trade_orders set status=${success?'confirmed':'failed'},gas_paid=${gas.toString()},signed_tx=null,updated_at=now() where id=${o.id}`;
  if(!success){await sql`update jolly_trade_agents set realized=realized-${gas.toString()},day_realized=day_realized-${gas.toString()} where id=${a.id}`;return;}
  if(o.kind==='buy'){
   const cost=BigInt(o.amount)+gas;
   await sql`insert into jolly_trade_positions(agent_id,token,curve,symbol,amount,entry,mark) values(${a.id},${o.token!},${o.curve!},${o.symbol!},${output.toString()},${cost.toString()},${o.amount})`;
   await sql`update jolly_trade_agents set day_spend=day_spend+${o.amount},day_trades=day_trades+1,last_entry_at=now(),paper_cash=paper_cash-${a.mode==='paper'?cost.toString():'0'} where id=${a.id}`;
  }else if(o.kind==='sell'){
   const [p]=await sql`select entry from jolly_trade_positions where id=${o.position_id!} and status='open' for update`;if(!p)throw new Error('Missing open position');
   const pnl=output-BigInt(p.entry)-gas;
   await sql`update jolly_trade_positions set status='closed',mark=${output.toString()},closed_at=now() where id=${o.position_id!}`;
   await sql`update jolly_trade_agents set realized=realized+${pnl.toString()},day_realized=day_realized+${pnl.toString()},paper_cash=paper_cash+${a.mode==='paper'?(output-gas).toString():'0'} where id=${a.id}`;
  }else{
   await sql`update jolly_trade_agents set realized=realized-${gas.toString()},day_realized=day_realized-${gas.toString()} where id=${a.id}`;
  }
 });
}
export async function reconcile(a:AgentRow){
 for(const o of await pending(a.id)){
  if(!o.tx_hash){await db()`update jolly_trade_orders set status='review' where id=${o.id}`;await db()`update jolly_trade_agents set status='review',blocked_reason='A transaction needs operator review before trading can continue.' where id=${a.id}`;continue;}
  const receipt=await rpc().getTransactionReceipt({hash:o.tx_hash as Hex}).catch(()=>null);
  if(!receipt){
   if(o.signed_tx)await rpc().sendRawTransaction({serializedTransaction:o.signed_tx as Hex}).catch(()=>{});
   continue;
  }
  if((await rpc().getBlockNumber())<receipt.blockNumber+2n)continue;
  const gas=receipt.gasUsed*receipt.effectiveGasPrice;
  if(receipt.status!=='success'){await settle(a,o,0n,gas,false);continue;}
  let output:bigint|undefined;
  if(o.kind==='withdraw'||o.kind==='approve'||o.kind==='unwrap')output=0n;
  for(const log of receipt.logs){
   if(o.curve&&log.address.toLowerCase()===o.curve.toLowerCase())try{
    const d=decodeEventLog({abi:curveAbi,data:log.data,topics:log.topics});
    if(d.eventName==='CurveBuy'&&o.kind==='buy'&&d.args.recipient.toLowerCase()===a.wallet_address!.toLowerCase())output=d.args.tokensOut;
    if(d.eventName==='CurveSell'&&o.kind==='sell'&&d.args.recipient.toLowerCase()===a.wallet_address!.toLowerCase())output=d.args.quoteOut;
   }catch{}
   if(o.kind==='sell'&&o.destination==='weth'&&log.address.toLowerCase()===WETH.toLowerCase())try{const d=decodeEventLog({abi:tokenAbi,data:log.data,topics:log.topics});if(d.eventName==='Transfer'&&d.args.to.toLowerCase()===a.wallet_address!.toLowerCase())output=(output||0n)+d.args.value;}catch{}
  }
  if(output===undefined||(o.minimum_out&&output<BigInt(o.minimum_out))){await db()`update jolly_trade_orders set status='review',signed_tx=null where id=${o.id}`;await db()`update jolly_trade_agents set status='review',blocked_reason='Transaction confirmed but its output needs reconciliation.' where id=${a.id}`;continue;}
  await settle(a,o,output,gas);
 }
}
async function dispatch(a:AgentRow,o:OrderRow,tx:{to:Address;data:Hex;value:bigint}){
 try{return await signAndBroadcast(a,o,tx);}catch(e){
  const [state]=await db()`select tx_hash from jolly_trade_orders where id=${o.id}`;
  // A signed transaction may be on chain. Never mark it failed and resend a new nonce.
  if(!state.tx_hash){await db()`update jolly_trade_orders set status='failed' where id=${o.id}`;}
  throw e;
 }
}
export async function buy(a:AgentRow,token:string,curve:string){
 const m=await market(token,curve);if(m.graduated)throw new TradeError('Pool graduated before entry.');
 const amount=(await import('viem')).parseEther(a.settings.tradeEth),output=m.buy(amount);
 if(output<=0n)throw new TradeError('No executable quote.');
 const minimum=output*BigInt(10000-a.settings.slippageBps)/10000n;
 const o=await newOrder(a,{kind:'buy',amount,token,curve,symbol:m.symbol,tokenAmount:output,minimum});
 if(a.mode==='paper'){await settle(a,o,minimum,PAPER_GAS);return;}
 await dispatch(a,o,{to:getAddress(curve),data:encodeFunctionData({abi:curveAbi,functionName:'buy',args:[amount,minimum,getAddress(a.wallet_address!)]}),value:amount});
}
function allowedTarget(address:string){return (process.env.JOLLY_ZEROX_ALLOWED_TARGETS||'').toLowerCase().split(',').map(s=>s.trim()).includes(address.toLowerCase());}
export async function graduatedQuote(a:AgentRow,p:PositionRow){
 if(!exitProviderReady())throw new TradeError('Graduated exit provider is not configured.',503);
 const query=new URLSearchParams({chainId:'4663',sellToken:p.token,buyToken:WETH,sellAmount:p.amount,taker:a.wallet_address!,slippageBps:String(a.settings.slippageBps)});
 const r=await fetch(bridgeReady()?bridgeUrl('/api/integrations/jolly/quote?')+query:'https://api.0x.org/swap/allowance-holder/quote?'+query,{headers:bridgeReady()?bridgeHeaders():{'0x-api-key':process.env.JOLLY_ZEROX_API_KEY!,'0x-version':'v2'},signal:AbortSignal.timeout(20000),redirect:'error'});
 if(!r.ok)throw new TradeError('A graduated-token exit quote is unavailable.',503);
 const q=await r.json();
 if(q.liquidityAvailable===false||!q.transaction||!allowedTarget(q.transaction.to)||!/^\d+$/.test(q.minBuyAmount)||BigInt(q.minBuyAmount)<=0n||q.buyToken?.toLowerCase()!==WETH.toLowerCase()||q.sellToken?.toLowerCase()!==p.token.toLowerCase()||String(q.sellAmount)!==p.amount||BigInt(q.transaction.value||'0')!==0n||!/^0x[0-9a-f]+$/i.test(q.transaction.data))throw new TradeError('Exit route failed validation.');
 const spender=q.issues?.allowance?.spender||q.allowanceTarget;
 if(spender&&!allowedTarget(spender))throw new TradeError('Exit approval target is not allowed.');
 return {to:getAddress(q.transaction.to),data:q.transaction.data as Hex,minimum:BigInt(q.minBuyAmount),spender:spender?getAddress(spender):null};
}
export async function sell(a:AgentRow,p:PositionRow){
 const m=await market(p.token,p.curve),amount=BigInt(p.amount);
 if(a.mode==='paper'){
  if(m.graduated)throw new TradeError('Practice quote unavailable after graduation. Position remains open.');
  const output=m.sell(amount)*BigInt(10000-a.settings.slippageBps)/10000n;
  const o=await newOrder(a,{kind:'sell',amount:0n,token:p.token,curve:p.curve,symbol:p.symbol,positionId:p.id,tokenAmount:amount});await settle(a,o,output,PAPER_GAS);return;
 }
 const account=getAddress(a.wallet_address!),balance=await rpc().readContract({address:getAddress(p.token),abi:tokenAbi,functionName:'balanceOf',args:[account]});
 if(balance<amount)throw new TradeError('Token balance needs reconciliation.');
 let target=getAddress(p.curve),spender:Address|null=target,minimum=m.sell(amount)*BigInt(10000-a.settings.slippageBps)/10000n,data:Hex;
 if(m.graduated){const q=await graduatedQuote(a,p);target=q.to;spender=q.spender;minimum=q.minimum;data=q.data;}
 else data=encodeFunctionData({abi:curveAbi,functionName:'sell',args:[amount,minimum,account]});
 if(minimum<=0n)throw new TradeError('No executable sell quote.');
 if(spender){const allowance=await rpc().readContract({address:getAddress(p.token),abi:tokenAbi,functionName:'allowance',args:[account,spender]});if(allowance<amount){const o=await newOrder(a,{kind:'approve',amount:0n,token:p.token,destination:spender});await dispatch(a,o,{to:getAddress(p.token),data:encodeFunctionData({abi:tokenAbi,functionName:'approve',args:[spender,amount]}),value:0n});return;}}
 const o=await newOrder(a,{kind:'sell',amount:0n,token:p.token,curve:p.curve,symbol:p.symbol,positionId:p.id,tokenAmount:amount,minimum,destination:m.graduated?'weth':undefined});
 await dispatch(a,o,{to:target,data,value:0n});
}
export async function unwrap(a:AgentRow){
 const amount=await rpc().readContract({address:WETH,abi:tokenAbi,functionName:'balanceOf',args:[getAddress(a.wallet_address!)]});if(!amount)return false;
 const o=await newOrder(a,{kind:'unwrap',amount});await dispatch(a,o,{to:WETH,data:encodeFunctionData({abi:wethAbi,functionName:'withdraw',args:[amount]}),value:0n});return true;
}
export async function withdraw(a:AgentRow,amount:bigint,destination:Address,key:string){
 const [previous]=await db()<OrderRow[]>`select * from jolly_trade_orders where agent_id=${a.id} and request_key=${key}`;if(previous)return previous;
 if(a.mode!=='live'||!a.wallet_address)throw new TradeError('Practice ETH cannot be withdrawn.');
 if(a.status==='running')throw new TradeError('Pause your agent before withdrawing.');
 if((await pending(a.id)).length)throw new TradeError('Wait for pending transactions before withdrawing.');
 if(destination.toLowerCase()===a.wallet_address.toLowerCase())throw new TradeError('Choose your personal receiving wallet.');
 const available=await rpc().getBalance({address:getAddress(a.wallet_address)});
 if(amount<=0n||amount>=available)throw new TradeError('Leave ETH for the network fee.');
 const o=await newOrder(a,{kind:'withdraw',amount,destination,requestKey:key});await dispatch(a,o,{to:destination,data:'0x',value:amount});
 return (await db()<OrderRow[]>`select * from jolly_trade_orders where id=${o.id}`)[0];
}
