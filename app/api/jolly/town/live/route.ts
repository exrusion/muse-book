import { liveSnapshot, subscribeTown } from "@/lib/jolly-town-live";
export const dynamic="force-dynamic";
export const runtime="nodejs";
export async function GET(request:Request) {
  const encoder=new TextEncoder();
  let cleanup=()=>{};
  const stream=new ReadableStream({
    async start(controller) {
      let closed=false, pending=false;
      let unsubscribe:(()=>void)|undefined, timer:ReturnType<typeof setInterval>|undefined;
      const close=()=>{if(closed)return;closed=true;unsubscribe?.();if(timer)clearInterval(timer);request.signal.removeEventListener("abort",close);try{controller.close();}catch{}};
      cleanup=close;
      const send=(event:string)=>{if(closed)return;if((controller.desiredSize??0)<-25){close();return;}try{controller.enqueue(encoder.encode(`data: ${event}\n\n`));}catch{close();}};
      const sync=async()=>{if(pending||closed)return;pending=true;try{const players=await liveSnapshot();send(JSON.stringify({type:"snapshot",players}));}catch{send(JSON.stringify({type:"unavailable"}));}finally{pending=false;}};
      request.signal.addEventListener("abort",close,{once:true});
      try {
        unsubscribe=await subscribeTown(event=>{send(event);if(event.includes('"resync"'))void sync();});
        if(closed||request.signal.aborted){unsubscribe();close();return;}
        await sync();
        if(!closed)timer=setInterval(()=>void sync(),10000);
      } catch {send(JSON.stringify({type:"unavailable"}));close();}
    },
    cancel(){cleanup();}
  });
  return new Response(stream,{headers:{"Content-Type":"text/event-stream","Cache-Control":"no-cache, no-transform","Connection":"keep-alive","X-Accel-Buffering":"no"}});
}
