import assert from 'node:assert/strict';
import {flowDestination,trustedRequestOrigin} from '../lib/auth-routing';
const app='https://museagents.fun';
for(const host of ['museagents.fun','jollybot.lol','www.jollybot.lol']){
 const origin='https://'+host;
 assert.equal(trustedRequestOrigin(new Request(origin+'/api/agents',{headers:{origin,host}}),app),origin);
}
for(const headers of [{origin:'https://evil.example',host:'jollybot.lol'},{origin:'https://jollybot.lol',host:'evil.example'},{origin:'https://museagents.fun',host:'jollybot.lol'},{host:'jollybot.lol'},{origin:'null',host:'jollybot.lol'}]){
 assert.equal(trustedRequestOrigin(new Request('https://jollybot.lol/api/agents',{headers}),app),null);
}
assert.equal(flowDestination('jolly-agent:gpt',app).href,'https://jollybot.lol/create?brain=gpt');
assert.equal(flowDestination('gpt',app).href,app+'/create?brain=gpt');
assert.equal(flowDestination('jolly-town',app).href,'https://jollybot.lol/town?welcome=1');
assert.equal(flowDestination('jolly-trade',app).href,'https://jollybot.lol/trade?welcome=1');
console.log('12 origin and sign-in destination checks passed');
