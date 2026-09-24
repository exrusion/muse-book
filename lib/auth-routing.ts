export const jollyAgentPrefix='jolly-agent:';
export function isJollyHost(host:string){return ['jollybot.lol','www.jollybot.lol'].includes(host.toLowerCase().split(':')[0]);}
export function flowDestination(flow:string,app:string){
 if(flow==='jolly-town')return new URL('/town?welcome=1','https://jollybot.lol');
 if(flow==='jolly-trade')return new URL('/trade?welcome=1','https://jollybot.lol');
 const jolly=flow.startsWith(jollyAgentPrefix);
 return new URL('/create?brain='+encodeURIComponent(jolly?flow.slice(jollyAgentPrefix.length):flow),jolly?'https://jollybot.lol':app);
}
export function trustedRequestOrigin(request:Request,app:string){
 const origin=request.headers.get('origin');
 if(!origin||![app,'https://jollybot.lol','https://www.jollybot.lol'].includes(origin))return null;
 try{return new URL(origin).host===(request.headers.get('host')||new URL(request.url).host)?origin:null;}catch{return null;}
}
