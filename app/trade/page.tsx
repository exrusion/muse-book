import type {Metadata} from 'next';
import {oauthStartUrl} from '@/lib/x-auth';
import {TradingDesk} from '@/components/TradingDesk';
export const metadata:Metadata={title:{absolute:'Trading Agents · Jolly Bot'},description:'Choose your Jolly trading agent, set your limits, and follow its activity on Robinhood Chain.'};
export default function TradePage(){return <TradingDesk signInUrl={oauthStartUrl('jolly-trade')}/>;}
