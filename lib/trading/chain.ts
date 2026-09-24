import {createPublicClient,defineChain,http,parseAbi,parseAbiItem,zeroAddress,type Address} from 'viem';
import {db} from '../db';
import {curveBuy,curveSell} from './risk';
import {bridgeReady,bridgeUrl,bridgeHeaders} from './provider';
export const chain=defineChain({id:4663,name:'Robinhood Chain',nativeCurrency:{name:'Ether',symbol:'ETH',decimals:18},rpcUrls:{default:{http:['https://rpc.mainnet.chain.robinhood.com']}}});
export const FACTORY='0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e' as Address;
export const curveAbi=parseAbi(['function getReserves() view returns (uint256,uint256)','function realQuoteReserve() view returns (uint256)','function graduated() view returns (bool)','function feeBps() view returns (uint256)','function creatorTaxBps() view returns (uint256)','function pairToken() view returns (address)','function buy(uint256 quoteIn,uint256 minTokensOut,address recipient) payable returns (uint256)','function sell(uint256 tokensIn,uint256 minQuoteOut,address recipient) returns (uint256)','event CurveBuy(address indexed buyer,address indexed recipient,uint256 quoteIn,uint256 tokensOut,uint256 fee,uint256 tax)','event CurveSell(address indexed seller,address indexed recipient,uint256 tokensIn,uint256 quoteOut,uint256 fee,uint256 tax)']);
export const tokenAbi=parseAbi(['function symbol() view returns (string)','function balanceOf(address) view returns (uint256)','function allowance(address,address) view returns (uint256)','function approve(address,uint256) returns (bool)','event Transfer(address indexed from,address indexed to,uint256 value)']);
const launchEvent=parseAbiItem('event TokenLaunched(address indexed token,address indexed curve,address indexed deployer,address pairToken,uint256 launchConfigId,uint256 graduationThreshold)');
// The authenticated bridge requires an explicit params array, including for
// eth_chainId and eth_blockNumber (viem normally omits it for these methods).
export function explicitRpcParams(_request:Request,init:RequestInit):RequestInit{
 const body=JSON.parse(String(init.body));
 return {...init,body:JSON.stringify({...body,params:body.params??[]})};
}
const makeClient=(url:string)=>createPublicClient({chain,transport:http(url,{timeout:20000,retryCount:1,...(bridgeReady()?{fetchOptions:{headers:bridgeHeaders()},onFetchRequest:explicitRpcParams}:{})})});
let client:ReturnType<typeof makeClient>|undefined;
export function rpc(){
 if(!client){const url=bridgeReady()?bridgeUrl('/api/integrations/jolly/rpc'):process.env.JOLLY_TRADING_RPC_URL||chain.rpcUrls.default.http[0];if(!url.startsWith('https://'))throw new Error('HTTPS RPC required');client=makeClient(url);}return client;
}
export async function assertChain(){if(await rpc().getChainId()!==4663)throw new Error('Wrong chain');}
export async function scan(){
 await assertChain();const latest=await rpc().getBlockNumber();const final=latest>5n?latest-5n:0n;
 const [saved]=await db()`select value from jolly_trade_engine where key='scan'`;
 let from=saved?BigInt(saved.value.block)+1n:(final>10000n?final-10000n:0n);
 // Catch up to current launches after downtime instead of spending hours on an
 // obsolete backlog. The scanner only considers recent launches for entries.
 if(final-from>10000n)from=final-10000n;
 if(from>final)return;
 const to=from+999n<final?from+999n:final;
 const logs=await rpc().getLogs({address:FACTORY,event:launchEvent,fromBlock:from,toBlock:to});
 for(const log of logs){const {token,curve,pairToken}=log.args;if(!token||!curve||pairToken!==zeroAddress)continue;const block=await rpc().getBlock({blockNumber:log.blockNumber});await db()`insert into jolly_trade_tokens(token,curve,launched_at) values(${token.toLowerCase()},${curve.toLowerCase()},${new Date(Number(block.timestamp)*1000)}) on conflict do nothing`;}
 await db()`insert into jolly_trade_engine(key,value) values('scan',${db().json({block:to.toString()})}) on conflict(key) do update set value=excluded.value,updated_at=now()`;
}
export async function market(token:string,curve:string){
 const c=curve as Address;
 const [reserves,liquidity,graduated,fee,tax,pair,symbol]=await Promise.all([
 rpc().readContract({address:c,abi:curveAbi,functionName:'getReserves'}),rpc().readContract({address:c,abi:curveAbi,functionName:'realQuoteReserve'}),rpc().readContract({address:c,abi:curveAbi,functionName:'graduated'}),rpc().readContract({address:c,abi:curveAbi,functionName:'feeBps'}),rpc().readContract({address:c,abi:curveAbi,functionName:'creatorTaxBps'}),rpc().readContract({address:c,abi:curveAbi,functionName:'pairToken'}),rpc().readContract({address:token as Address,abi:tokenAbi,functionName:'symbol'})]);
 if(pair!==zeroAddress||fee+tax>=10000n)throw new Error('Unsupported pool');
 return {q:reserves[0],t:reserves[1],liquidity,graduated,fees:fee+tax,symbol:String(symbol).slice(0,18),buy:(a:bigint)=>curveBuy(a,reserves[0],reserves[1],fee+tax),sell:(a:bigint)=>curveSell(a,reserves[0],reserves[1],fee+tax)};
}
