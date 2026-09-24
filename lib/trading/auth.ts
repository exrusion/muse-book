import {cookies} from 'next/headers';
import {db} from '../db';
import {hashToken} from '../security';
import {currentUser} from '../x-auth';
import {TradeError} from './store';
export const tradeCookie='jolly_trade_session';
export async function tradeIdentity(){
 const token=(await cookies()).get(tradeCookie)?.value;
 if(token&&token.length<=100){const [s]=await db()`select wallet from jolly_trade_sessions where token_hash=${hashToken(token)} and expires_at>now()`;if(s)return {key:'evm:'+s.wallet,name:String(s.wallet)};}
 const u=await currentUser();return u?{key:'x:'+u.id,name:String(u.display_name)}:null;
}
export async function requireIdentity(){const i=await tradeIdentity();if(!i)throw new TradeError('Sign in to manage your trading agents.',401);return i;}
export function requireOrigin(request:Request){const origin=request.headers.get('origin');const allowed=['https://jollybot.lol','https://www.jollybot.lol'];if(process.env.NODE_ENV!=='production')allowed.push('http://localhost:3000');if(!origin||!allowed.includes(origin))throw new TradeError('Invalid request origin.',403);}
export async function body(request:Request){const text=await request.text();if(text.length>6000)throw new TradeError('Request too large.',413);try{return JSON.parse(text);}catch{throw new TradeError('Invalid request.');}}
export function failure(e:unknown){return Response.json({error:e instanceof TradeError?e.message:'This action could not be completed. Please try again.'},{status:e instanceof TradeError?e.status:503,headers:{'Cache-Control':'no-store'}});}
