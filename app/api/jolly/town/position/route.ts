import { NextRequest,NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { checkHolder,townIdentity,townOriginAllowed,townRateLimited } from "@/lib/jolly-town-auth";
import { positionFor } from "@/lib/jolly-town-live";
import { clearWalkPath,nearestPlace,WALK_SPEED } from "@/lib/jolly-town-shared";
export const dynamic="force-dynamic";
const schema=z.object({x:z.number().finite().min(-15.4).max(15.4),z:z.number().finite().min(-14.2).max(14.2),yaw:z.number().finite().min(-Math.PI).max(Math.PI),moving:z.boolean(),version:z.number().int().nonnegative()});
const json=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{"Cache-Control":"no-store"}});
export async function POST(request:NextRequest) {
  if(!townOriginAllowed(request))return json({error:"Invalid request origin"},403);
  try {
    const identity=await townIdentity();if(!identity)return json({error:"Sign in to walk around town."},401);
    if(townRateLimited(request,"walking:"+identity.key,3600))return json({error:"Too many movement updates. Please pause briefly."},429);
    const body=schema.safeParse(await request.json());if(!body.success)return json({error:"Invalid movement."},400);
    // Refresh holder eligibility outside the short movement transaction.
    const [member]=await db()`select id,holder,holder_mint,holder_checked_at from jolly_town_residents where owner_key=${identity.key}`;
    if(!member)return json({error:"Create your Jolly first."},404);
    if(identity.wallet&&process.env.JOLLY_TOKEN_MINT) {
      let holder=member.holder;
      if(member.holder_mint!==process.env.JOLLY_TOKEN_MINT||Date.now()-new Date(member.holder_checked_at).getTime()>300000){
        holder=await checkHolder(identity.wallet);
        await db()`update jolly_town_residents set holder=${holder},holder_mint=${process.env.JOLLY_TOKEN_MINT},holder_checked_at=now() where id=${member.id}`;
      }
      if(!holder)return json({error:"Holder access could not be verified. You can also join through X."},403);
    }
    const result=await db().begin(async sql=>{
      const [row]=await sql`select * from jolly_town_residents where id=${member.id} for update`;
      if(!row)return {status:404,error:"Create your Jolly first."};
      const current=positionFor(row), next=body.data;
      const elapsed=row.last_motion_at?Math.max(0,(Date.now()-new Date(row.last_motion_at).getTime())/1000):0.3;
      const distance=Math.hypot(next.x-current.x,next.z-current.z);
      if(next.version!==current.version||distance>WALK_SPEED*Math.min(elapsed,2)+0.35||!clearWalkPath(current.x,current.z,next.x,next.z))return {status:409,error:"Your position was synchronized.",position:current};
      const [saved]=await sql`update jolly_town_residents set pos_x=${next.x},pos_z=${next.z},yaw=${next.yaw},moving=${next.moving},motion_seq=motion_seq+1,last_motion_at=clock_timestamp(),last_seen=now(),place=${nearestPlace(next.x,next.z)} where id=${row.id} returning *`;
      const position=positionFor(saved);
      // Postgres delivers this notification only after the position commits.
      await sql`select pg_notify('jolly_town_live',${JSON.stringify({type:"position",position})})`;
      return {status:200,position};
    });
    return json(result,result.status);
  } catch {return json({error:"Connection interrupted. Your Jolly will reconnect."},503);}
}
