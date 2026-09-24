import {NextRequest,NextResponse} from 'next/server';
import {getAddress,verifyMessage} from 'viem';
import {db} from '@/lib/db';
import {newOwnerToken,hashToken} from '@/lib/security';
import {cookieOptions} from '@/lib/x-auth';
import {townRateLimited} from '@/lib/jolly-town-auth';
import {body,requireOrigin,failure,tradeCookie} from '@/lib/trading/auth';
import {TradeError} from '@/lib/trading/store';
export const dynamic='force-dynamic';
const challengeCookie='jolly_trade_challenge';
export async function POST(request:NextRequest){try{
 requireOrigin(request);if(townRateLimited(request,'trade-sign-in',25))throw new TradeError('Too many sign-in attempts. Try again in a few minutes.',429);
 const b=await body(request);const address=getAddress(b.address).toLowerCase();
 if(!b.signature){const token=newOwnerToken(),expires=new Date(Date.now()+300000),origin=request.headers.get('origin')!;
 const message=`${new URL(origin).host} wants you to sign in with your Ethereum account:\n${address}\n\nSign in to Jolly Trading. This signature does not authorize a trade or transfer.\n\nURI: ${origin}/trade\nVersion: 1\nChain ID: 4663\nNonce: ${token}\nIssued At: ${new Date().toISOString()}\nExpiration Time: ${expires.toISOString()}`;
 await db()`delete from jolly_trade_challenges where expires_at<now()`;
 await db()`insert into jolly_trade_challenges(token_hash,wallet,message,origin,expires_at) values(${hashToken(token)},${address},${message},${origin},${expires})`;
 const response=NextResponse.json({message});response.cookies.set(challengeCookie,token,{...cookieOptions,maxAge:300});return response;}
 const token=request.cookies.get(challengeCookie)?.value;if(!token||token.length>100||typeof b.signature!=='string'||b.signature.length>200)throw new TradeError('Sign-in expired.');
 const [c]=await db()`delete from jolly_trade_challenges where token_hash=${hashToken(token)} and expires_at>now() returning *`;
 if(!c||c.wallet!==address||c.origin!==request.headers.get('origin')||!await verifyMessage({address:getAddress(address),message:c.message,signature:b.signature}))throw new TradeError('Signature could not be verified.');
 const session=newOwnerToken();await db()`delete from jolly_trade_sessions where expires_at<now()`;await db()`insert into jolly_trade_sessions(token_hash,wallet,expires_at) values(${hashToken(session)},${address},now()+interval '1 day')`;
 const response=NextResponse.json({authenticated:true});response.cookies.set(tradeCookie,session,{...cookieOptions,maxAge:86400});response.cookies.set(challengeCookie,'',{...cookieOptions,maxAge:0});return response;
 }catch(e){return failure(e);}}
export async function DELETE(request:NextRequest){try{requireOrigin(request);const token=request.cookies.get(tradeCookie)?.value;if(token)await db()`delete from jolly_trade_sessions where token_hash=${hashToken(token)}`;const r=NextResponse.json({ok:true});r.cookies.set(tradeCookie,'',{...cookieOptions,maxAge:0});return r;}catch(e){return failure(e);}}
