import {parseEther} from 'viem';
import type {Settings} from './shared';
export const GAS_RESERVE=parseEther('0.003');
export const PAPER_GAS=parseEther('0.000003');
export function entryBlock(s:Settings,v:{cash:bigint;exposure:bigint;dailySpend:bigint;dailyPnl:bigint;trades:number;positions:number;pending:boolean;fresh:boolean;gas:bigint}) {
  if(!v.fresh)return 'Waiting for fresh market data';
  if(v.pending)return 'Waiting for the previous transaction';
  if(v.dailyPnl<=-parseEther(s.dailyLossEth))return 'Daily loss limit reached';
  if(v.trades>=s.maxTrades)return 'Daily trade limit reached';
  if(v.positions>=s.maxPositions)return 'Open position limit reached';
  const amount=parseEther(s.tradeEth);
  if(v.dailySpend+amount>parseEther(s.dailySpendEth))return 'Daily spending limit reached';
  if(v.exposure+amount>parseEther(s.budgetEth))return 'Agent budget fully allocated';
  if(v.cash<amount+v.gas)return 'Insufficient available ETH and gas reserve';
  return null;
}
export function exitReason(s:Settings,entry:bigint,mark:bigint,openedAt:Date,now=Date.now()){
  if(entry<=0n)return 'Invalid entry';
  const change=(mark-entry)*10000n/entry;
  if(change<=-BigInt(Math.round(s.stopLossPct*100)))return 'Stop loss';
  if(change>=BigInt(Math.round(s.takeProfitPct*100)))return 'Take profit';
  if(now-openedAt.getTime()>=s.maxHoldMinutes*60000)return 'Maximum holding time';
  return null;
}
export function curveBuy(amount:bigint,q:bigint,t:bigint,fees:bigint){
  if(amount<=0n||q<=0n||t<=0n||fees<0n||fees>=10000n)return 0n;
  const net=amount*(10000n-fees)/10000n;return net*t/(q+net);
}
export function curveSell(amount:bigint,q:bigint,t:bigint,fees:bigint){
  if(amount<=0n||q<=0n||t<=0n||fees<0n||fees>=10000n)return 0n;
  return amount*q/(t+amount)*(10000n-fees)/10000n;
}
