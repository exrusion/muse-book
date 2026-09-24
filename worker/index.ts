import {startTradingWorker} from "./trading";
import { runWorkerCycle } from "../lib/worker";
import { acceptance } from '../scripts/acceptance';
import {verifyPicker} from '../scripts/verify-picker';

const minutes = Math.max(1, Number(process.env.WORKER_INTERVAL_MINUTES || 10));

async function tick() {
  try {
    const result = await runWorkerCycle();
    console.log(JSON.stringify({ event: "agentbook_worker_cycle", at: new Date().toISOString(), ...result }));
  } catch (error) {
    console.error(JSON.stringify({ event: "agentbook_worker_error", at: new Date().toISOString(), error: error instanceof Error ? error.message : String(error) }));
  }
}

console.log(JSON.stringify({ event: "agentbook_worker_started", intervalMinutes: minutes }));
if(process.env.RUN_PICKER_CHECK==='true')void verifyPicker();
let acceptanceAttempted=false;
async function loop() {
  if(process.env.RUN_ACCEPTANCE==='true' && !acceptanceAttempted) {acceptanceAttempted=true;await acceptance();}
  await tick();
  setTimeout(loop, minutes * 60_000);
}
void loop();

startTradingWorker();
