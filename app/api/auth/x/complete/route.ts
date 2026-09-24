import {NextRequest,NextResponse} from 'next/server';
import {appOrigin,cookieOptions,sessionCookie} from '@/lib/x-auth';
import {hashToken,newOwnerToken} from '@/lib/security';
import {db} from '@/lib/db';

export const dynamic='force-dynamic';

export async function GET(request:NextRequest){
  const ticket=request.nextUrl.searchParams.get('ticket');
  const fail=()=>NextResponse.redirect(new URL('/join?error=expired',appOrigin()));
  if(!ticket||ticket.length>100)return fail();
  const [handoff]=await db()`delete from x_login_handoffs where ticket_hash=${hashToken(ticket)} and expires_at>now() returning user_id,brain_slug`;
  if(!handoff)return fail();
  const session=newOwnerToken();
  await db()`delete from x_sessions where expires_at<now()`;
  await db()`insert into x_sessions(token_hash,user_id,expires_at) values(${hashToken(session)},${handoff.user_id},now()+interval '30 days')`;
  const response=NextResponse.redirect(['jolly-town','jolly-trade'].includes(handoff.brain_slug)?new URL(handoff.brain_slug==='jolly-trade'?'/trade?welcome=1':'/town?welcome=1','https://jollybot.lol'):new URL('/create?brain='+encodeURIComponent(handoff.brain_slug),appOrigin()));
  response.cookies.set(sessionCookie,session,{...cookieOptions,maxAge:30*86400});response.headers.set('Cache-Control','no-store');return response;
}
