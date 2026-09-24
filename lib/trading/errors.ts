import {TradeError} from './store';
// Log only error classifications: RPC errors can contain authenticated URLs.
export function reportTradingError(stage:string,error:unknown){
 const e=error as {name?:string;code?:unknown;status?:unknown;cause?:{name?:string;code?:unknown}};
 console.error(JSON.stringify({event:'jolly_trading_error',stage,name:e?.name,code:typeof e?.code==='number'?e.code:undefined,status:typeof e?.status==='number'?e.status:undefined,cause:e?.cause?.name,causeCode:typeof e?.cause?.code==='number'?e.cause.code:undefined}));
}
export function reviewError(stage:'discovery'|'quote'|'model',error:unknown){
 reportTradingError(stage,error);
 if(error instanceof TradeError)return error;
 return new TradeError(stage==='model'?'My AI provider did not finish this assessment. I’ll retry on the next review; no buy was authorized.':stage==='discovery'?'Pons launch discovery is temporarily unavailable. I’ll retry; no order was placed.':'The on-chain quote is unavailable for this coin. I’ll retry; no order was placed.',503);
}
