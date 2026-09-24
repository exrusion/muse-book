import assert from "node:assert/strict";
import { townBounds, mapX, mapZ, townMap, townBuildings } from "../lib/jolly-town-layout";
import {clearWalkPath,places,spawnPosition,townObstacles,walkable,walkStep} from "../lib/jolly-town-shared";

for(const place of places)for(let i=0;i<500;i++){
  const p=spawnPosition(`resident-${i}`,place.id);
  assert.ok(walkable(p.x,p.z),`Blocked spawn in ${place.id}`);
  assert.deepEqual(p,spawnPosition(`resident-${i}`,place.id));
}
for(const [x,z] of townObstacles)assert.equal(walkable(x,z),false);
for(const [x,z] of [[townBounds.maxX+0.1,0],[townBounds.minX-0.1,0],[0,townBounds.maxZ+0.1],[0,townBounds.minZ-0.1],[NaN,2],[0,0],[12,1.8]])assert.equal(walkable(x,z),false);
assert.ok(walkable(-10,-13));assert.ok(walkable(-10,-8));
assert.equal(clearWalkPath(-10,-13,-10,-8),false,"Cannot tunnel through a building");
assert.equal(clearWalkPath(0,3,0,6),true);
assert.deepEqual(walkStep(townBounds.maxX-0.05,4,0.2,0.2),{x:townBounds.maxX-0.05,z:4.2},"Slide along town edge");
for(const place of places){
  let p=spawnPosition("walking-test",place.id);
  for(let i=0;i<3000;i++){
    const angle=i*.173,next=walkStep(p.x,p.z,Math.sin(angle)*.2,Math.cos(angle)*.2);
    assert.ok(walkable(next.x,next.z));
    assert.ok(Math.hypot(next.x-p.x,next.z-p.z)<=.201);
    p=next;
  }
}
// Verify the new districts are reachable from the old plaza, not isolated islands.
const queue: [number,number][] = [[0,3]], reached = new Set(["0,3"]);
for(let cursor=0;cursor<queue.length;cursor++) {
  const [x,z]=queue[cursor];
  for(const [dx,dz] of [[0.5,0],[-0.5,0],[0,0.5],[0,-0.5]]) {
    const nx=x+dx,nz=z+dz,key=`${nx},${nz}`;
    if(!reached.has(key)&&walkable(nx,nz)&&clearWalkPath(x,z,nx,nz)){reached.add(key);queue.push([nx,nz]);}
  }
}
for(const place of places) {
  const p=spawnPosition("walking-test",place.id);
  assert.ok(queue.some(([x,z])=>Math.hypot(x-p.x,z-p.z)<0.8&&clearWalkPath(x,z,p.x,p.z)),`${place.name} is reachable from the plaza`);
  assert.ok(mapX(place.x)>20&&mapX(place.x)<townMap.width-20&&mapZ(place.z)>20&&mapZ(place.z)<townMap.height-20,`${place.name} fits on the map`);
}
for(const [x,z,w,d] of townBuildings) {
  assert.ok(x-w/2>townBounds.minX&&x+w/2<townBounds.maxX&&z-d/2>townBounds.minZ&&z+d/2<townBounds.maxZ,"Building fits within expanded land");
}
for(const [x,z] of [[-22,-5],[-22,-22],[0,-23],[22,-22],[22,-7],[-22,10]])assert.ok(walkable(x,z),"New destination center is open");
assert.ok(clearWalkPath(16,12,16,-31),"East avenue connects the entire town");
assert.ok(clearWalkPath(-16,12,-16,-31),"West avenue connects the entire town");
console.log(`Movement: ${places.length*500} safe spawns, ${places.length*3000} walking steps, all ${places.length} neighborhoods reachable, map bounds and building collisions passed.`);
