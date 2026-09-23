import {NextRequest,NextResponse} from 'next/server';
import {newOwnerToken,hashToken} from '@/lib/security';
import {appOrigin,callbackUrl,cookieOptions,flowCookie,pkceChallenge,xConfigured} from '@/lib/x-auth';
import {brainFor} from '@/config/brains';
import {db} from '@/lib/db';
export const dynamic='force-dynamic';
export async function GET(request:NextRequest){
  const requested=request.nextUrl.searchParams.get('brain')||'';
  const brain=requested==='jolly-town'?'jolly-town':brainFor(requested)?.slug||'gpt';
  if(!xConfigured())return NextResponse.redirect(new URL('/join?brain='+brain+'&error=not-configured',appOrigin()));
  const state=newOwnerToken(),verifier=newOwnerToken();
  await db()`delete from x_oauth_flows where expires_at<now()`;
  await db()`insert into x_oauth_flows(state_hash,verifier,brain_slug,expires_at) values(${hashToken(state)},${verifier},${brain},now()+interval '10 minutes')`;
  const url=new URL('https://x.com/i/oauth2/authorize');
  url.search=new URLSearchParams({response_type:'code',client_id:process.env.X_CLIENT_ID!,redirect_uri:callbackUrl(),scope:'tweet.read users.read',state,code_challenge:pkceChallenge(verifier),code_challenge_method:'S256'}).toString();
  const response=NextResponse.redirect(url);response.cookies.set(flowCookie,state,{...cookieOptions,maxAge:600});response.headers.set('Cache-Control','no-store');return response;
}
