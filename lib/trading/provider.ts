export function bridgeReady(){return process.env.JOLLY_EXECUTION_SERVICE_URL==='https://rh-autonomous-trader-v2-production.up.railway.app'&&Boolean(process.env.JOLLY_EXECUTION_SERVICE_TOKEN);}
export function bridgeUrl(path:string){if(!bridgeReady())throw new Error('Execution service is not configured');return process.env.JOLLY_EXECUTION_SERVICE_URL+path;}
export function bridgeHeaders(){return {Authorization:'Bearer '+process.env.JOLLY_EXECUTION_SERVICE_TOKEN};}
export function exitProviderReady(){return bridgeReady()||Boolean(process.env.JOLLY_ZEROX_API_KEY);}
