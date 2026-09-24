import { z } from 'zod';
export const AGENTS = [
  { id: 'scout', name: 'Jolly Scout', color: '#efad89', description: 'Watches fresh Pons launches and checks liquidity before considering an entry.', minLiquidity: 0.15, minAge: 120, interval: 300 },
  { id: 'momentum', name: 'Jolly Momentum', color: '#b5a0df', description: 'Looks for rising quotes across consecutive scans. Waits when the signal is unclear.', minLiquidity: 0.25, minAge: 300, interval: 300 },
  { id: 'patient', name: 'Jolly Patient', color: '#91baa1', description: 'Waits for older launches with more liquidity and spaces entries further apart.', minLiquidity: 0.5, minAge: 900, interval: 900 },
] as const;
const eth = z.string().regex(/^(0|[1-9]\d{0,3})(\.\d{1,8})?$/).refine(v => Number(v) > 0 && Number(v) <= 100, 'Enter an ETH amount between 0 and 100.');
export const settingsSchema = z.object({
  budgetEth: eth, tradeEth: eth, dailySpendEth: eth, dailyLossEth: eth,
  maxTrades: z.number().int().min(1).max(50), maxPositions: z.number().int().min(1).max(5),
  stopLossPct: z.number().min(1).max(50), takeProfitPct: z.number().min(1).max(200),
  slippageBps: z.number().int().min(10).max(300), maxHoldMinutes: z.number().int().min(5).max(1440),
}).strict().superRefine((s,c) => {
  for (const field of ['tradeEth','dailyLossEth'] as const) if (Number(s[field]) > Number(s.budgetEth)) c.addIssue({code:'custom',path:[field],message:'Cannot exceed the total budget.'});
  if (Number(s.tradeEth)>Number(s.dailySpendEth)) c.addIssue({code:'custom',path:['tradeEth'],message:'Cannot exceed daily spending.'});
});
export type Settings = z.infer<typeof settingsSchema>;
export const DEFAULT_SETTINGS: Settings = {budgetEth:'0.05',tradeEth:'0.001',dailySpendEth:'0.01',dailyLossEth:'0.005',maxTrades:10,maxPositions:2,stopLossPct:10,takeProfitPct:20,slippageBps:100,maxHoldMinutes:60};
export const CHAIN_ID=4663;
export const EXPLORER='https://robinhoodchain.blockscout.com';
export type Mode='paper'|'live';
export type TradingAgent = {id:string;template:string;modelId:string;shareDiscussions:boolean;discussionEnabled:boolean;mode:Mode;status:string;settings:Settings;walletAddress:string|null;cashEth:string;equityEth:string;dailyPnlEth:string;realizedEth:string;blockedReason:string|null;updatedAt:string};
export type PositionView = {id:string;agentId:string;symbol:string;token:string;entryEth:string;markEth:string;openedAt:string;status:string};
export type OrderView={id:string;agentId:string;kind:string;status:string;amountEth:string;txHash:string|null;createdAt:string;symbol:string|null};
export type Desk={authenticated:boolean;identity:string|null;liveReady:boolean;walletReady:boolean;agents:TradingAgent[];positions:PositionView[];orders:OrderView[];workerOnline:boolean};
