import {NextRequest,NextResponse} from 'next/server';
import {appOrigin,callbackUrl,cookieOptions,flowCookie,xConfigured} from '@/lib/x-auth';
import {hashToken,newOwnerToken,safeEqualText} from '@/lib/security';
import {db} from '@/lib/db';
export const dynamic='force-dynamic';
export async function GET(request:NextRequest){
  const fail=(error:string)=>{const r=NextResponse.redirect(new URL('/join?error='+error,appOrigin()));r.cookies.set(flowCookie,'',{...cookieOptions,maxAge:0});return r;};
  const state=request.nextUrl.searchParams.get('state'),code=request.nextUrl.searchParams.get('code');
  if(!xConfigured())return fail('not-configured');
  if(!state||state.length>100||!safeEqualText(state,request.cookies.get(flowCookie)?.value))return fail('expired');
  const [flow]=await db()`delete from x_oauth_flows where state_hash=${hashToken(state)} and expires_at>now() returning verifier,brain_slug`;
  if(!flow||!code||code.length>2000||request.nextUrl.searchParams.has('error'))return fail('cancelled');
  try{
    const tokenResponse=await fetch('https://api.x.com/2/oauth2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded',Authorization:'Basic '+Buffer.from(process.env.X_CLIENT_ID+':'+process.env.X_CLIENT_SECRET).toString('base64')},body:new URLSearchParams({grant_type:'authorization_code',code,redirect_uri:callbackUrl(),code_verifier:String(flow.verifier)}),signal:AbortSignal.timeout(15000),cache:'no-store'});
    if(!tokenResponse.ok)return fail('provider');
    const token=await tokenResponse.json();if(typeof token.access_token!=='string')return fail('provider');
    const meResponse=await fetch('https://api.x.com/2/users/me',{headers:{Authorization:'Bearer '+token.access_token},signal:AbortSignal.timeout(15000),cache:'no-store'});
    if(!meResponse.ok)return fail('provider');
    const {data:user}=await meResponse.json();if(!user||!/^\d+$/.test(user.id)||typeof user.username!=='string'||typeof user.name!=='string')return fail('provider');
    // X access tokens are used only to identify the owner, never stored or sent to agents.
    const [owner]=await db()`insert into x_users(x_id,username,display_name) values(${user.id},${user.username.slice(0,100)},${user.name.slice(0,200)}) on conflict(x_id) do update set username=excluded.username,display_name=excluded.display_name,updated_at=now() returning id`;
    const handoff=newOwnerToken();
    await db()`delete from x_login_handoffs where expires_at<now()`;
    await db()`insert into x_login_handoffs(ticket_hash,user_id,brain_slug,expires_at) values(${hashToken(handoff)},${owner.id},${flow.brain_slug},now()+interval '2 minutes')`;
    const complete=new URL('/api/auth/x/complete',['jolly-town','jolly-trade'].includes(flow.brain_slug)?'https://jollybot.lol':appOrigin());complete.searchParams.set('ticket',handoff);
    const response=NextResponse.redirect(complete);
    response.cookies.set(flowCookie,'',{...cookieOptions,maxAge:0});response.headers.set('Cache-Control','no-store');return response;
  }catch{return fail('provider');}
}
