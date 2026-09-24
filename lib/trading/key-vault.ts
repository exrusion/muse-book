import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
import {generatePrivateKey,privateKeyToAccount} from 'viem/accounts';
import type {Hex} from 'viem';

// A separate random key per wallet, encrypted with a server-only deployment key.
// AAD prevents a database row being moved to another owner, agent or address.
export function vaultKey(value=process.env.JOLLY_WALLET_ENCRYPTION_KEY):Buffer {
 if(!value||!/^([a-f0-9]{64})$/i.test(value))throw new Error('Wallet encryption key is not configured');
 return Buffer.from(value,'hex');
}
export function localWalletReady(){try{vaultKey();return true;}catch{return false;}}
function context(agentId:string,owner:string,address:string){return Buffer.from(JSON.stringify(['jolly-wallet-v1',4663,agentId,owner,address.toLowerCase()]));}
export function createLocalWallet(agentId:string,owner:string,key=vaultKey()){
 const privateKey=generatePrivateKey(),account=privateKeyToAccount(privateKey),iv=randomBytes(12);
 const cipher=createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(context(agentId,owner,account.address));
 const encrypted=Buffer.concat([cipher.update(Buffer.from(privateKey.slice(2),'hex')),cipher.final()]);
 return {address:account.address,envelope:['v1',iv.toString('hex'),cipher.getAuthTag().toString('hex'),encrypted.toString('hex')].join('.')};
}
export function unlockLocalWallet(envelope:string,agentId:string,owner:string,address:string,key=vaultKey()){
 const [version,iv,tag,data,...rest]=envelope.split('.');
 if(version!=='v1'||rest.length||!/^([a-f0-9]{24})$/.test(iv)||!/^([a-f0-9]{32})$/.test(tag)||!/^([a-f0-9]{64})$/.test(data))throw new Error('Invalid wallet envelope');
 const decipher=createDecipheriv('aes-256-gcm',key,Buffer.from(iv,'hex'));decipher.setAAD(context(agentId,owner,address));decipher.setAuthTag(Buffer.from(tag,'hex'));
 const bytes=Buffer.concat([decipher.update(Buffer.from(data,'hex')),decipher.final()]);
 try{const account=privateKeyToAccount(('0x'+bytes.toString('hex')) as Hex);if(account.address.toLowerCase()!==address.toLowerCase())throw new Error('Wallet address mismatch');return account;}finally{bytes.fill(0);}
}
