import {tradingCycle} from '../lib/trading/engine';
export function startTradingWorker(){
 let cycles=0;
 async function run(){const started=Date.now();const trace=cycles++<3;try{if(trace)console.log('Jolly trading cycle started');await tradingCycle(trace);if(trace)console.log('Jolly trading cycle completed in '+(Date.now()-started)+'ms');}catch(e){console.error(JSON.stringify({event:'jolly_trading_cycle_failed',code:typeof (e as {code?:unknown})?.code==='string'?(e as {code:string}).code:'UNKNOWN'}));}finally{setTimeout(run,20000);}}
 void run();
}
