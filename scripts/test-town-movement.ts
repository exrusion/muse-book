import assert from "node:assert/strict";
import {clearWalkPath,places,spawnPosition,townObstacles,walkable,walkStep} from "../lib/jolly-town-shared";

for(const place of places)for(let i=0;i<500;i++){
  const p=spawnPosition(`resident-${i}`,place.id);
  assert.ok(walkable(p.x,p.z),`Blocked spawn in ${place.id}`);
  assert.deepEqual(p,spawnPosition(`resident-${i}`,place.id));
}
for(const [x,z] of townObstacles)assert.equal(walkable(x,z),false);
for(const [x,z] of [[16,0],[0,15],[0,-15],[NaN,2],[0,0],[12,1.8]])assert.equal(walkable(x,z),false);
assert.ok(walkable(-10,-13));assert.ok(walkable(-10,-8));
assert.equal(clearWalkPath(-10,-13,-10,-8),false,"Cannot tunnel through a building");
assert.equal(clearWalkPath(0,3,0,6),true);
assert.deepEqual(walkStep(15.35,4,0.2,0.2),{x:15.35,z:4.2},"Slide along town edge");
for(const place of places){
  let p=spawnPosition("walking-test",place.id);
  for(let i=0;i<3000;i++){
    const angle=i*.173,next=walkStep(p.x,p.z,Math.sin(angle)*.2,Math.cos(angle)*.2);
    assert.ok(walkable(next.x,next.z));
    assert.ok(Math.hypot(next.x-p.x,next.z-p.z)<=.201);
    p=next;
  }
}
console.log("Movement: 3,000 safe spawns, 18,000 walking steps, building collisions, bounds and wall tunneling passed.");
