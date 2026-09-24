import {NextRequest,NextResponse} from 'next/server';
import {appOrigin,cookieOptions,sameOrigin,sessionCookie} from '@/lib/x-auth';
import {db} from '@/lib/db';
import {hashToken} from '@/lib/security';
export async function POST(request:NextRequest){
  if(!sameOrigin(request))return NextResponse.json({error:'Invalid request origin'},{status:403});
  const token=request.cookies.get(sessionCookie)?.value;
  if(token)await db()`delete from x_sessions where token_hash=${hashToken(token)}`;
  const response=NextResponse.redirect(new URL('/',request.headers.get('origin')!),303);response.cookies.set(sessionCookie,'',{...cookieOptions,maxAge:0});return response;
}
