import {createPrivateKey,createPublicKey} from 'node:crypto';
import {PrivyClient} from '@privy-io/node';
import {getAddress,keccak256,parseTransaction,recoverTransactionAddress,toHex,parseEther,type Address,type Hex,type TransactionSerialized} from 'viem';
import {db} from '../db';
import {rpc,assertChain} from './chain';
import {TradeError,type AgentRow,type OrderRow,pending} from './store';
import {createLocalWallet,unlockLocalWallet,localWalletReady} from './key-vault';
import {bridgeReady,exitProviderReady} from './provider';
const privyReady=()=>Boolean(process.env.JOLLY_PRIVY_APP_ID&&process.env.JOLLY_PRIVY_APP_SECRET&&process.env.JOLLY_PRIVY_AUTH_KEY);
export const walletReady=()=>localWalletReady()||privyReady();
export const liveReady=()=>walletReady()&&process.env.JOLLY_TRADING_LIVE_ENABLED==='true'&&Boolean((bridgeReady()||process.env.JOLLY_TRADING_RPC_URL)&&exitProviderReady()&&process.env.JOLLY_ZEROX_ALLOWED_TARGETS);
function privy(){if(!walletReady())throw new TradeError('Managed wallets are awaiting provider setup.',503);return new PrivyClient({appId:process.env.JOLLY_PRIVY_APP_ID!,appSecret:process.env.JOLLY_PRIVY_APP_SECRET!,maxRetries:0,timeout:20000});}
export async function provision(a:AgentRow){
 if(a.wallet_id)return;
 if(!liveReady())throw new TradeError('Live wallets are not enabled yet. You can use practice mode now.',503);
 if(localWalletReady()){
  const w=createLocalWallet(a.id,a.owner_key);
  await db().begin(async sql=>{
   const [row]=await sql`select wallet_id from jolly_trade_agents where id=${a.id} for update`;
   if(row.wallet_id)return;
   await sql`insert into jolly_trade_wallet_keys(agent_id,encrypted_key) values(${a.id},${w.envelope})`;
   await sql`update jolly_trade_agents set wallet_id=${'local:'+a.id},wallet_address=${w.address},updated_at=now() where id=${a.id}`;
  });return;
 }
 const p=privy();
 // Durable external ID prevents duplicate wallets even beyond idempotency expiry.
 let w;
 try{w=await p.wallets().get('ext_wal_jolly_'+a.id);}catch(e){if((e as {status?:number}).status!==404)throw e;}
 if(!w){const key=createPrivateKey({key:Buffer.from(process.env.JOLLY_PRIVY_AUTH_KEY!.replace(/^wallet-auth:/,''),'base64'),format:'der',type:'pkcs8'});const publicKey=createPublicKey(key).export({format:'der',type:'spki'}).toString('base64');w=await p.wallets().create({chain_type:'ethereum',external_id:'jolly_'+a.id,owner:{public_key:publicKey},idempotency_key:'jolly_'+a.id});}
 const address=getAddress(w.address);
 await db()`update jolly_trade_agents set wallet_id=${w.id},wallet_address=${address},updated_at=now() where id=${a.id}`;
}
// Only internally constructed, simulated requests reach the signer. No public raw-transaction API.
export async function signAndBroadcast(a:AgentRow,o:OrderRow,tx:{to:Address;data:Hex;value:bigint}){
 if(!walletReady()||!a.wallet_id||!a.wallet_address)throw new TradeError('Wallet signer is not configured.',503);
 if(o.kind==='buy'&&!liveReady())throw new TradeError('Live entries are disabled.',503);
 const others=await pending(a.id);if(others.some(x=>x.id!==o.id))throw new TradeError('Previous transaction is pending.',409);
 await assertChain();const account=getAddress(a.wallet_address);
 await rpc().call({account,...tx});
 const [nonce,gasEstimate,gasPrice,balance]=await Promise.all([rpc().getTransactionCount({address:account,blockTag:'pending'}),rpc().estimateGas({account,...tx}),rpc().getGasPrice(),rpc().getBalance({address:account})]);
 const gas=gasEstimate*120n/100n;
 if(gas>1500000n||gas*gasPrice>parseEther('0.001'))throw new TradeError('Network fee exceeds the transaction limit.');
 if(balance<tx.value+gas*gasPrice)throw new TradeError('Insufficient ETH for this action and network fees.');
 let raw:Hex;
 if(a.wallet_id==='local:'+a.id){
  const [key]=await db()`select encrypted_key from jolly_trade_wallet_keys where agent_id=${a.id}`;
  if(!key)throw new TradeError('Agent wallet is unavailable.',503);
  const signer=unlockLocalWallet(key.encrypted_key,a.id,a.owner_key,a.wallet_address);
  raw=await signer.signTransaction({chainId:4663,type:'legacy',nonce,to:tx.to,data:tx.data,value:tx.value,gas,gasPrice});
 }else{
  const result=await privy().wallets().ethereum().signTransaction(a.wallet_id,{authorization_context:{authorization_private_keys:[process.env.JOLLY_PRIVY_AUTH_KEY!]},idempotency_key:o.id,params:{transaction:{chain_id:4663,type:0,nonce,to:tx.to,data:tx.data,value:toHex(tx.value),gas_limit:toHex(gas),gas_price:toHex(gasPrice)}}});raw=result.signed_transaction as Hex;
 }
 const decoded=parseTransaction(raw);
 if(decoded.chainId!==4663||decoded.to?.toLowerCase()!==tx.to.toLowerCase()||(decoded.value||0n)!==tx.value||(decoded.data||'0x')!==tx.data||decoded.nonce!==nonce||decoded.gas!==gas||decoded.gasPrice!==gasPrice||(await recoverTransactionAddress({serializedTransaction:raw as TransactionSerialized})).toLowerCase()!==account.toLowerCase())throw new TradeError('Signed transaction validation failed.');
 const hash=keccak256(raw);
 // Save signed bytes and deterministic hash BEFORE broadcast. Crashes cannot cause a second payment.
 await db()`update jolly_trade_orders set status='signed',signed_tx=${raw},tx_hash=${hash},updated_at=now() where id=${o.id}`;
 await rpc().sendRawTransaction({serializedTransaction:raw});
 await db()`update jolly_trade_orders set status='broadcast',updated_at=now() where id=${o.id}`;
 return hash;
}
