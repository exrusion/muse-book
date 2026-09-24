import assert from "node:assert/strict";
import {townEnvironment,lightningLevel,shipPose} from "../lib/jolly-town-weather";
const env=(iso:string)=>townEnvironment(Date.parse(iso));
assert.equal(env("2026-07-01T16:00:00Z").clock,"12:00 PM");
assert.equal(env("2026-01-01T17:00:00Z").clock,"12:00 PM");
assert.equal(env("2026-03-08T06:59:00Z").clock,"1:59 AM");
assert.equal(env("2026-03-08T07:00:00Z").clock,"3:00 AM");
assert.equal(env("2026-11-01T05:59:00Z").clock,"1:59 AM");
assert.equal(env("2026-11-01T06:00:00Z").clock,"1:00 AM");
assert.equal(env("2026-07-01T07:00:00Z").night,true);
assert.equal(env("2026-07-01T16:00:00Z").daylight,1);
assert.equal(env("2026-07-01T10:45:00Z").daylight,0.5);
assert.equal(env("2026-07-01T23:15:00Z").daylight,0.5);
const conditions=new Set<string>();let pulses=0;
for(let i=0;i<300;i++)conditions.add(townEnvironment(i*45*60000).weather);
assert.equal(conditions.size,4);
assert.deepEqual(townEnvironment(10000000),townEnvironment(10000000));
for(let t=0;t<400000;t+=100){const level=lightningLevel(t);assert.ok(level>=0&&level<=0.65);if(level>0)pulses++;}
assert.ok(pulses>0&&pulses<100,"Lightning is occasional and brief");
for(let t=0;t<900000;t+=500)for(let i=0;i<3;i++){const p=shipPose(t,i);assert.ok(Math.abs(p.x)>33.5||p.z<-36.5||p.z>18.5,"Ship hull clears land and harbor");}
console.log("US Eastern time, both DST changes, dawn/dusk, shared weather, lightning cadence and offshore ship paths passed.");
