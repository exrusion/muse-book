import {requireIdentity,failure} from '@/lib/trading/auth';
import {discussionFeed,communityFeed} from '@/lib/trading/discussion';
export const dynamic='force-dynamic';
export async function GET(request:Request){try{
 const community=new URL(request.url).searchParams.get('scope')==='community';const identity=community?null:await requireIdentity(),encoder=new TextEncoder();let timer:ReturnType<typeof setTimeout>|undefined,closed=false;
 const stream=new ReadableStream({start(controller){
  const started=Date.now();let last='';
  const close=()=>{if(closed)return;closed=true;if(timer)clearTimeout(timer);try{controller.close();}catch{}};
  request.signal.addEventListener('abort',close,{once:true});
  const poll=async()=>{if(closed)return;try{const feed=await (community?communityFeed():discussionFeed(identity!.key)),id=String(feed[0]?.id||'empty');if(id!==last){last=id;controller.enqueue(encoder.encode('data: '+JSON.stringify({feed})+'\n\n'));}else controller.enqueue(encoder.encode(': heartbeat\n\n'));}catch{close();return;}if(Date.now()-started>50000){close();return;}if(!closed)timer=setTimeout(poll,2500);};void poll();
 },cancel(){closed=true;if(timer)clearTimeout(timer);}});
 return new Response(stream,{headers:{'Content-Type':'text/event-stream','Cache-Control':'private, no-cache, no-transform','Connection':'keep-alive','X-Accel-Buffering':'no'}});
 }catch(e){return failure(e);}}
