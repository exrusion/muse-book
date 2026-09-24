import {tradingCycle} from '../lib/trading/engine';
export function startTradingWorker(){
 async function run(){try{await tradingCycle();}catch{console.error(JSON.stringify({event:'jolly_trading_cycle_failed'}));}finally{setTimeout(run,20000);}}
 void run();
}
