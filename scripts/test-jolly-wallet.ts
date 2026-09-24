import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {recoverTransactionAddress,parseTransaction,type TransactionSerialized} from 'viem';
import {createLocalWallet,unlockLocalWallet,vaultKey} from '../lib/trading/key-vault';
async function main(){
 const key=randomBytes(32),a=createLocalWallet('agent-a','owner-a',key),b=createLocalWallet('agent-b','owner-a',key);
 assert.notEqual(a.address,b.address);
 const signer=unlockLocalWallet(a.envelope,'agent-a','owner-a',a.address,key);
 for(const [id,owner,address,k] of [['agent-b','owner-a',a.address,key],['agent-a','owner-b',a.address,key],['agent-a','owner-a',b.address,key],['agent-a','owner-a',a.address,randomBytes(32)]] as const)assert.throws(()=>unlockLocalWallet(a.envelope,id,owner,address,k));
 const bits=a.envelope.split('.');bits[3]=(bits[3][0]==='a'?'b':'a')+bits[3].slice(1);assert.throws(()=>unlockLocalWallet(bits.join('.'),'agent-a','owner-a',a.address,key));
 assert.throws(()=>vaultKey('short'));assert.throws(()=>vaultKey('g'.repeat(64)));
 const raw=await signer.signTransaction({chainId:4663,type:'legacy',nonce:0,to:b.address,value:0n,gas:21000n,gasPrice:1n});
 assert.equal(await recoverTransactionAddress({serializedTransaction:raw as TransactionSerialized}),a.address);assert.equal(parseTransaction(raw).chainId,4663);
 assert(!a.envelope.includes(signer.address));
 console.log('PASS unique wallets, encryption roundtrip, owner/agent/address binding, tamper rejection, wrong-key rejection, invalid configuration, chain-bound transaction signing and sender recovery. No transaction broadcast.');
}main().catch(e=>{console.error(e);process.exit(1);});
