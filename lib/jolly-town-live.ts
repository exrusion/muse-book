import { db } from "./db";
import { spawnPosition, type TownPosition } from "./jolly-town-shared";
export function positionFor(row: Record<string, unknown>):TownPosition {
  const initial=spawnPosition(String(row.id),String(row.place));
  const recent=Date.now()-new Date(String(row.last_motion_at || 0)).getTime();
  return { id:String(row.id), x:row.pos_x==null?initial.x:Number(row.pos_x), z:row.pos_z==null?initial.z:Number(row.pos_z), yaw:Number(row.yaw||0), moving:row.moving===true&&recent<1500, version:Number(row.motion_seq||0), online:Date.now()-new Date(String(row.last_seen)).getTime()<45000 };
}
export async function liveSnapshot() {
  const rows=await db()`select id,place,pos_x,pos_z,yaw,moving,motion_seq,last_motion_at,last_seen from jolly_town_residents order by last_seen desc limit 300`;
  return rows.map(positionFor);
}
export async function publishTown(event: Record<string, unknown>) { await db().notify("jolly_town_live",JSON.stringify(event)); }
const listeners=new Set<(event:string)=>void>();
let listening:Promise<unknown>|null=null;
function emit(event:string) { for(const listener of listeners) listener(event); }
export async function subscribeTown(listener:(event:string)=>void) {
  if(!listening) listening=db().listen("jolly_town_live",emit,()=>emit(JSON.stringify({type:"resync"}))).catch(error=>{listening=null;throw error;});
  await listening;
  listeners.add(listener);
  return ()=>listeners.delete(listener);
}
