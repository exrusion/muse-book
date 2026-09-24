const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const vm=require('node:vm');const ts=require('typescript');
function load(fetch,env={ELEVENLABS_API_KEY:'test-secret'}) {
  const module={exports:{}};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/jolly-elevenlabs.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module,exports:module.exports,process:{env},fetch,AbortSignal,Uint8Array});
  return module.exports;
}
const ticket={id:'reply-1',text:'Hello Jolly!',expires:Date.now()+60000};
test('same signed reply shares one paid generation and replay is cached',async()=>{
  let calls=0,release;
  const api=load(async(url,options)=>{calls++;assert.match(url,/api.elevenlabs.io\/v1\/text-to-speech\//);assert.equal(options.headers['xi-api-key'],'test-secret');assert.equal(JSON.parse(options.body).text,ticket.text);await new Promise(r=>release=r);return new Response(new Uint8Array([73,68,51]),{headers:{'content-type':'audio/mpeg'}});});
  const a=api.elevenLabsVoice(ticket),b=api.elevenLabsVoice(ticket);release();
  const [first,second]=await Promise.all([a,b]);assert.equal(first,second);await api.elevenLabsVoice(ticket);assert.equal(calls,1);
});
test('provider authentication and quota errors are safe and retryable',async()=>{
  for(const status of [401,403,402,429,500]){
    let calls=0;const api=load(async()=>{calls++;return new Response('secret upstream body',{status});});
    await assert.rejects(api.elevenLabsVoice(ticket),error=>error instanceof api.JollyVoiceError&&!error.message.includes('secret'));
    await assert.rejects(api.elevenLabsVoice(ticket));assert.equal(calls,2);
  }
});
test('missing keys and non-audio responses never become playable audio',async()=>{
  const missing=load(()=>{throw Error('must not call')},{});await assert.rejects(missing.elevenLabsVoice(ticket),/not configured/);
  const invalid=load(async()=>new Response('{}',{headers:{'content-type':'application/json'}}));await assert.rejects(invalid.elevenLabsVoice(ticket),/invalid audio/);
});
