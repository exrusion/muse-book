import assert from 'node:assert/strict';
import {getModels,chatCompletion,providerHealth} from '../lib/openrouter';
import {modelForBrain} from '../config/brains';
async function main(){
process.env.JOLLY_API_KEY='test-secret';process.env.JOLLY_API_BASE_URL='https://api.relaymodels.com/v1';process.env.OPENROUTER_API_KEY='invalid-old-key';
const calls:Array<{url:string;body:any}>=[];
globalThis.fetch=(async (url:any,options:any)=>{
 assert.equal(options.headers.Authorization,'Bearer test-secret');
 const body=options.body?JSON.parse(options.body):undefined;calls.push({url:String(url),body});
 assert(String(url).startsWith('https://api.relaymodels.com/v1/'));
 return Response.json(body?{choices:[{message:{content:'Hello'}}]}:{data:[{id:'claude-haiku-4-5'},{id:'deepseek-v4-flash'},{id:'unpriced-model'}]});
}) as typeof fetch;
const models=await getModels(true);assert.equal(models.length,2);
const claude=modelForBrain('claude',models)!;assert.equal(claude.apiModel,'claude-haiku-4-5');assert.equal(modelForBrain('gpt',models),undefined);assert.equal(modelForBrain('llama',models),undefined);
await chatCompletion({model:claude.id,messages:[{role:'user',content:'Hi'}]});assert.equal(calls.at(-1)?.body.model,'claude-haiku-4-5');assert(!calls.at(-1)?.body.plugins);
await chatCompletion({model:modelForBrain('deepseek',models)!.id,messages:[{role:'user',content:'Hi'}]});assert.equal(calls.at(-1)?.body.model,'deepseek-v4-flash');
await assert.rejects(chatCompletion({model:'openai/missing',messages:[]}));assert((await providerHealth()).ok);
console.log('PASS Relay key, endpoint, live catalogue filtering, family selection, exact model dispatch and health check');
}main();
